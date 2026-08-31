/**
 * Web Music Studio · Tone.js 音频引擎核心
 *
 * 信号链（严格按 spec）：
 *   Channel 音源（鼓合成器 / PolySynth）
 *     → 通道 Gain（通道音量）→ 通道 Panner
 *     → 混音轨 input → FX 链（FxInstance 实时构建，旁路的跳过）→ 轨道 Fader → 轨道 Pan
 *     → 静音/独奏门（Gain 0/1）→ Master input
 *     → Master FX 链（Limiter 等）→ Master Fader → 安全 Limiter
 *     → Destination，并分接 Meter（电平表）+ Analyser（频谱）
 *
 * 走带：Tone.Transport + 16 分音符步进调度器（scheduleRepeat + lookahead），
 * 播放位置回调经 Tone.Draw 精准派发 uiStore.currentStep 驱动 UI 播放头。
 */
import * as Tone from 'tone';
import { useProjectStore } from '../stores/projectStore';
import { useUiStore } from '../stores/uiStore';
import type {
  Channel,
  FxInstance,
  Pattern,
  Project,
  SynthParams,
} from '../types/project';
import { applyFxParams, createFx } from './effects';
import { createDrumVoice, type DrumVoice } from './drumSynths';
import { SampleVoice } from './samples';

const MASTER_ID = 'track-master';

/** 深层 Partial（Tone 语音选项的嵌套结构需要；数组保持原样） */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<U>
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

/** SynthParams → PolySynth(MonoSynth) 语音配置（模块级导出，供预设试听复用） */
export function synthParamsToOptions(
  p?: SynthParams,
): DeepPartial<Tone.MonoSynthOptions> {
  if (!p) return {};
  return {
    oscillator: { type: p.osc1Waveform },
    envelope: {
      attack: p.attack,
      decay: p.decay,
      sustain: p.sustain,
      release: p.release,
    },
    filter: { type: p.filterType, Q: p.filterQ },
    filterEnvelope: {
      baseFrequency: Math.max(20, p.filterCutoff),
      attack: Math.min(p.attack, 0.03),
      decay: Math.max(p.decay, 0.05),
      sustain: p.sustain,
      release: p.release,
      // 滤波包络量 0-1 → 0-4 个八度的扫频深度
      octaves: p.filterEnvAmount * 4,
    },
  };
}

interface ChannelNodes {
  gain: Tone.Gain;
  panner: Tone.Panner;
  drum: DrumVoice | null;
  poly: Tone.PolySynth<Tone.MonoSynth> | null;
  /** CDN 采样声部（sampleInstrument 通道优先发声，未加载键回退 poly） */
  sample: SampleVoice | null;
  /** 通道结构签名（kind/drumType/路由/鼓调音/采样乐器变化时重建该通道音源） */
  sig: string;
  /** 上次应用的合成器参数签名（避免每次 store 变化都 set） */
  paramSig: string;
}

interface TrackNodes {
  input: Tone.Gain;
  fader: Tone.Gain;
  panner: Tone.Panner;
  gate: Tone.Gain;
  fxById: Map<string, Tone.ToneAudioNode>;
  fxSig: string;
  /** 轨道电平表（Master 为 null，使用链尾全局 Meter） */
  meter: Tone.Meter | null;
}

interface LoopContext {
  loopOn: boolean;
  /** 循环区间总步数（不循环时即单次播放的总步数） */
  steps: number;
}

/** Song 编曲末端小节数 */
const songEndBars = (proj: Project): number => {
  let end = 0;
  for (const t of proj.song.tracks) {
    for (const c of t.clips) {
      const bars = proj.patterns.find((p) => p.id === c.patternId)?.bars ?? 1;
      end = Math.max(end, c.startBar + bars);
    }
  }
  return Math.max(1, end);
};

export class AudioEngine {
  private inited = false;
  private channels = new Map<string, ChannelNodes>();
  private tracks = new Map<string, TrackNodes>();
  private masterLimiter: Tone.Limiter | null = null;
  private meter: Tone.Meter | null = null;
  private analyser: Tone.Analyser | null = null;
  private metroSynth: Tone.Synth | null = null;
  private stepRepeatId: number | null = null;
  private step = 0;
  private loopCtx: LoopContext = { loopOn: true, steps: 16 };
  private loopSig = '';
  private unsubs: Array<() => void> = [];
  /** 虚拟键盘按住的音符（channelId → midi → 实际发声频率，用于精准 release） */
  private heldFreqs = new Map<string, Map<number, number>>();
  /**
   * noteOn 是异步的（先 await unlock 起音频），快速点按/页面首次交互时
   * noteOff 会先于 attack 落地 → 松手找不到可释放的音，attack 卡成永动低频嗡嗡声。
   * inflight 记录「noteOn 已发但还没落地」的键；pendingOff 记录其间到达的松手，落地时作废该次发声。
   */
  private noteOnInflight = new Map<string, Set<number>>();
  private noteOffWaiting = new Map<string, Set<number>>();

  /* ============================================================
   * 生命周期
   * ============================================================ */

  /** 首次用户交互解锁音频上下文（浏览器自动播放策略） */
  async unlock(): Promise<void> {
    if (Tone.getContext().state !== 'running') await Tone.start();
  }

  /** 初始化引擎（幂等，App 挂载时调用；StrictMode 双挂载安全） */
  init(): void {
    if (this.inited) return;
    this.inited = true;

    // 节拍器（监听用途，直连输出，不进混音链）
    this.metroSynth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.045, sustain: 0 },
      volume: -12,
    }).connect(Tone.getDestination());

    const proj = useProjectStore.getState();
    this.rebuildChannels(proj);
    this.prepareSampledNotes(proj);

    // Master 链尾：master gate → 安全 Limiter → Destination（+ Meter/Analyser 分接）
    const master = this.tracks.get(MASTER_ID);
    if (master) {
      this.masterLimiter = new Tone.Limiter(-1);
      this.meter = new Tone.Meter({ smoothing: 0.75 });
      this.analyser = new Tone.Analyser('fft', 64);
      master.gate.connect(this.masterLimiter);
      this.masterLimiter.connect(Tone.getDestination());
      this.masterLimiter.connect(this.meter);
      this.masterLimiter.connect(this.analyser);
    }

    this.applyMix(proj);
    this.applyLoop(true);

    // 16 分音符步进调度器（lookahead 由 Transport 内部保证）
    this.stepRepeatId = Tone.getTransport().scheduleRepeat(
      (time) => this.onStep(time),
      '16n',
    );

    // 订阅 store：工程数据 / UI 设置变化实时同步到链路与走带
    this.unsubs.push(
      useProjectStore.subscribe((s) => {
        this.rebuildChannels(s);
        this.applyMix(s);
        this.applyLoop();
        this.prepareSampledNotes(s);
      }),
    );
    this.unsubs.push(useUiStore.subscribe(() => this.applyLoop()));
  }

  dispose(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    const transport = Tone.getTransport();
    if (this.stepRepeatId !== null) transport.clear(this.stepRepeatId);
    this.stepRepeatId = null;
    transport.stop();
    for (const nodes of this.channels.values()) this.disposeChannel(nodes);
    this.channels.clear();
    for (const t of this.tracks.values()) {
      for (const n of t.fxById.values()) n.dispose();
      t.input.dispose();
      t.fader.dispose();
      t.panner.dispose();
      t.gate.dispose();
      t.meter?.dispose();
    }
    this.tracks.clear();
    this.heldFreqs.clear();
    this.metroSynth?.dispose();
    this.metroSynth = null;
    this.masterLimiter?.dispose();
    this.masterLimiter = null;
    this.meter?.dispose();
    this.meter = null;
    this.analyser?.dispose();
    this.analyser = null;
    this.inited = false;
  }

  /* ============================================================
   * 走带（Transport 封装）
   * ============================================================ */

  /**
   * 从当前播放头位置起播（支持停止后先拖动进度再播放）。
   * @returns 是否真正启动；浏览器拒绝恢复 AudioContext 时返回 false（不抛出，
   *   否则 `void engine.togglePlay()` 的调用点会变成未处理的 promise rejection）
   */
  async play(): Promise<boolean> {
    try {
      await this.unlock();
    } catch {
      return false;
    }
    const transport = Tone.getTransport();
    this.applyLoop(true);
    const ticksPerStep = transport.PPQ / 4;
    this.step =
      Math.max(0, Math.floor(transport.ticks / ticksPerStep)) % (this.loopCtx.steps || 16);
    transport.start('+0.05'); // 留一点 lookahead 余量保证首步精准
    useUiStore.getState().setIsPlaying(true);
    return true;
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.seconds = 0; // 位置归零
    Tone.getDraw().cancel();
    this.step = 0;
    this.releaseAllHeld(); // 兜底：停播时不收的延音会一直嗡嗡
    const ui = useUiStore.getState();
    ui.setIsPlaying(false);
    ui.setCurrentStep(0);
  }

  /** 强制释放所有在途/按住的音（防卡音），并清空竞态簿记 */
  private releaseAllHeld(): void {
    for (const [channelId, held] of this.heldFreqs) {
      const nodes = this.channels.get(channelId);
      for (const freq of held.values()) nodes?.poly?.triggerRelease(freq);
      held.clear();
    }
    for (const waiting of this.noteOffWaiting.values()) waiting.clear();
    for (const inflight of this.noteOnInflight.values()) inflight.clear();
  }

  /** 跳转播放头到某个 16 分步（0 基，按循环区间夹取）；播放中即时生效 */
  seekStep(step: number): void {
    const transport = Tone.getTransport();
    const region = this.loopCtx.steps || 16;
    const clamped = Math.max(0, Math.min(region - 1, Math.floor(step)));
    const secPerStep = 60 / transport.bpm.value / 4;
    transport.seconds = clamped * secPerStep;
    this.step = clamped;
    useUiStore.getState().setCurrentStep(clamped);
  }

  async togglePlay(): Promise<void> {
    if (Tone.getTransport().state === 'started') this.stop();
    else await this.play();
  }

  /* ============================================================
   * 步进调度
   * ============================================================ */

  private onStep(time: number): void {
    const ui = useUiStore.getState();
    const proj = useProjectStore.getState();
    const step = this.step;

    // UI 播放头：Tone.Draw 在精准时刻派发当前 step 索引
    Tone.getDraw().schedule(() => {
      useUiStore.getState().setCurrentStep(step);
    }, time);

    // 节拍器：每拍一击，小节首拍高音
    if (ui.metronomeOn && this.metroSynth && step % 4 === 0) {
      const down = step % 16 === 0;
      this.metroSynth.triggerAttackRelease(
        down ? 1760 : 1175,
        0.02,
        time,
        down ? 0.9 : 0.5,
      );
    }

    // 内容调度（lookahead：此刻读取的是即将发声的步，编辑即时生效）
    if (ui.playMode === 'pattern') {
      const pat = proj.patterns.find((p) => p.id === proj.currentPatternId);
      if (pat) this.schedulePatternStep(proj, pat, step % (pat.bars * 16), time);
    } else {
      this.scheduleSongStep(proj, step, time);
    }

    // 步进推进：循环模式跟随 Transport 回绕；不循环则播完一次自动停止回起点
    const total = this.loopCtx.steps;
    const next = step + 1;
    if (ui.loopOn) {
      this.step = next >= total ? 0 : next;
    } else if (next >= total) {
      const stopTime = time + Tone.Time('16n').toSeconds();
      Tone.getTransport().stop(stopTime);
      Tone.getDraw().schedule(() => {
        this.step = 0;
        const u = useUiStore.getState();
        u.setIsPlaying(false);
        u.setCurrentStep(0);
      }, stopTime);
      this.step = 0;
    } else {
      this.step = next;
    }
  }

  private schedulePatternStep(
    proj: Project,
    pat: Pattern,
    patternStep: number,
    time: number,
  ): void {
    for (const ch of proj.channels) {
      const sd = pat.steps[ch.id]?.[patternStep];
      if (sd?.on) this.triggerChannel(ch, sd.velocity, time);
    }
    for (const n of pat.notes) {
      if (n.startStep === patternStep) {
        this.triggerSynthNote(n.channelId, n.pitch, n.velocity, time, n.lengthSteps);
      }
    }
  }

  private scheduleSongStep(proj: Project, step: number, time: number): void {
    for (const track of proj.song.tracks) {
      for (const clip of track.clips) {
        const pat = proj.patterns.find((p) => p.id === clip.patternId);
        if (!pat) continue;
        const local = step - clip.startBar * 16;
        if (local < 0 || local >= pat.bars * 16) continue;
        this.schedulePatternStep(proj, pat, local, time);
      }
    }
  }

  /* ============================================================
   * 触发
   * ============================================================ */

  private triggerChannel(ch: Channel, velocity: number, time: number): void {
    const nodes = this.channels.get(ch.id);
    if (!nodes) return;
    if (nodes.drum) {
      nodes.drum.trigger(velocity, time);
      return;
    }
    if (nodes.poly) this.triggerSynthNote(ch.id, 60, velocity, time, 1);
  }

  private triggerSynthNote(
    channelId: string,
    midi: number,
    velocity: number,
    time: number,
    lengthSteps = 1,
  ): void {
    const nodes = this.channels.get(channelId);
    if (!nodes) return;
    const dur = Tone.Time('16n').toSeconds() * Math.max(1, lengthSteps);
    const vel = Math.min(1, Math.max(0.01, velocity / 127));

    // 采样优先（真实音高）；键未加载时后台补载并回退合成，保证不静音
    if (nodes.sample) {
      if (nodes.sample.trigger(midi, dur, time, vel)) return;
      void nodes.sample.prepare([midi]);
    }
    if (!nodes.poly) return;
    const ch = useProjectStore.getState().channels.find((c) => c.id === channelId);
    // 振荡器八度移位 + osc2 失谐近似（双振荡器完整实现见 Task 8）
    const p = ch?.synthParams;
    const semis = (p?.osc1Octave ?? 0) * 12 + (p?.osc2Detune ?? 0) / 100;
    nodes.poly.triggerAttackRelease(
      Tone.Frequency(midi + semis, 'midi').toFrequency(),
      dur,
      time,
      vel,
    );
  }

  /** 点击通道/键盘试听（自动解锁音频上下文） */
  async previewChannel(channelId: string, velocity = 100): Promise<void> {
    await this.unlock();
    const ch = useProjectStore.getState().channels.find((c) => c.id === channelId);
    if (ch) this.triggerChannel(ch, velocity, Tone.now() + 0.02);
  }

  /**
   * 播放中的实时走带位置（供循环录音量化）：
   * stepFloat = 自循环起点起的 16 分步浮点索引；未播放返回 null。
   * 因 lookahead 调度，听到的内容约领先 1 个音频块，就近量化到 16 分格已足够准。
   */
  getLivePosition(): { stepFloat: number; stepSeconds: number } | null {
    const transport = Tone.getTransport();
    if (transport.state !== 'started') return null;
    const ticksPerStep = transport.PPQ / 4;
    return {
      stepFloat: transport.ticks / ticksPerStep,
      /* 逐帧轮询，不能每次 new Tone.Time：按 BPM 直接算 16 分时长 */
      stepSeconds: 60 / transport.bpm.value / 4,
    };
  }

  async previewNote(channelId: string, midi: number, velocity = 100): Promise<void> {
    await this.unlock();
    this.triggerSynthNote(channelId, midi, velocity, Tone.now() + 0.02, 1);
  }

  /** 预设试听：以指定音符序列短句预览某通道（音色取当前 store 参数） */
  async previewPhrase(
    channelId: string,
    midis: number[],
    gapSeconds = 0.22,
    lengthSteps = 2,
  ): Promise<void> {
    await this.unlock();
    const t0 = Tone.now() + 0.03;
    midis.forEach((m, i) => {
      this.triggerSynthNote(channelId, m, 100, t0 + i * gapSeconds, lengthSteps);
    });
  }

  /** 虚拟键盘按下（持续发声直到 noteOff） */
  async noteOn(channelId: string, midi: number, velocity = 100): Promise<void> {
    let inflight = this.noteOnInflight.get(channelId);
    if (!inflight) {
      inflight = new Set();
      this.noteOnInflight.set(channelId, inflight);
    }
    inflight.add(midi);
    await this.unlock();
    // 解锁期间已经松手 → 丢弃这次 attack，绝不留下无主延音
    const offed = this.noteOffWaiting.get(channelId)?.delete(midi) ?? false;
    inflight.delete(midi);
    if (offed) return;
    const nodes = this.channels.get(channelId);
    if (!nodes) return;
    const vel = Math.min(1, Math.max(0.01, velocity / 127));
    // 采样延音优先；键未加载则后台补载并回退合成器（本次仍出声）
    if (nodes.sample) {
      if (nodes.sample.attack(midi, Tone.now() + 0.01, vel)) return;
      void nodes.sample.prepare([midi]);
    }
    if (!nodes.poly) return;
    const p = useProjectStore.getState().channels.find((c) => c.id === channelId)
      ?.synthParams;
    const semis = (p?.osc1Octave ?? 0) * 12 + (p?.osc2Detune ?? 0) / 100;
    const freq = Tone.Frequency(midi + semis, 'midi').toFrequency();
    let held = this.heldFreqs.get(channelId);
    if (!held) {
      held = new Map();
      this.heldFreqs.set(channelId, held);
    }
    held.set(midi, freq);
    nodes.poly.triggerAttack(freq, Tone.now() + 0.01, vel);
  }

  /** 虚拟键盘松开（采样延音与合成器都精准 release；在途 noteOn 会被作废） */
  noteOff(channelId: string, midi: number): void {
    const nodes = this.channels.get(channelId);
    nodes?.sample?.release(midi);
    const held = this.heldFreqs.get(channelId);
    const freq = held?.get(midi);
    if (freq !== undefined) {
      held!.delete(midi);
      nodes?.poly?.triggerRelease(freq);
    } else if (this.noteOnInflight.get(channelId)?.has(midi)) {
      // attack 还在 await unlock 路上：记下松手，落地时作废
      let waiting = this.noteOffWaiting.get(channelId);
      if (!waiting) {
        waiting = new Set();
        this.noteOffWaiting.set(channelId, waiting);
      }
      waiting.add(midi);
    }
  }

  /* ============================================================
   * 信号链构建 / 实时更新
   * ============================================================ */

  /** 混音轨节点（一次性创建，FX 链按需重建；每轨挂 Meter 供电平表） */
  private ensureTracks(proj: Project): void {
    for (const t of proj.mixerTracks) {
      if (this.tracks.has(t.id)) continue;
      const input = new Tone.Gain(1);
      const fader = new Tone.Gain(1);
      const panner = new Tone.Panner(0);
      const gate = new Tone.Gain(1);
      input.connect(fader); // 无 FX 时直通；rebuildTrackFx 会重接
      fader.connect(panner);
      panner.connect(gate);
      // 非 master 轨：gate 后分接轨道电平表（静音/独奏状态直接反映在表上）
      const meter = t.id === MASTER_ID ? null : new Tone.Meter({ smoothing: 0.75 });
      if (meter) gate.connect(meter);
      this.tracks.set(t.id, {
        input,
        fader,
        panner,
        gate,
        fxById: new Map(),
        fxSig: '',
        meter,
      });
    }
    // 普通轨 gate → Master input（master 可能后建，统一在二遍连接）
    const master = this.tracks.get(MASTER_ID);
    if (master) {
      for (const [id, t] of this.tracks) {
        if (id !== MASTER_ID) t.gate.connect(master.input);
      }
    }
  }

  /** 通道结构签名（kind/鼓类型/路由/鼓调音变化 → 仅重建该通道音源） */
  private channelSig(c: Channel): string {
    return [
      c.kind,
      c.drumType ?? '',
      c.mixerTrackId,
      c.sampleInstrument ?? '',
      c.kind === 'drum' ? JSON.stringify(c.drumParams ?? {}) : '',
    ].join(':');
  }

  /** 通道音源增量同步：结构/鼓调音变化仅重建对应通道，合成器参数原地更新 */
  private rebuildChannels(proj: Project): void {
    this.ensureTracks(proj);
    const seen = new Set<string>();
    for (const c of proj.channels) {
      seen.add(c.id);
      const sig = this.channelSig(c);
      const nodes = this.channels.get(c.id);
      if (nodes) {
        if (nodes.sig === sig) {
          this.applyChannelParams(c);
          continue;
        }
        this.disposeChannel(nodes);
        this.channels.delete(c.id);
      }
      const track = this.tracks.get(c.mixerTrackId) ?? this.tracks.get(MASTER_ID);
      if (!track) continue;
      const fresh = this.createChannel(c, sig);
      fresh.panner.connect(track.input);
      this.channels.set(c.id, fresh);
      this.applyChannelParams(c);
    }
    // 清理已删除的通道
    for (const [id, nodes] of this.channels) {
      if (!seen.has(id)) {
        this.disposeChannel(nodes);
        this.channels.delete(id);
      }
    }
  }

  private createChannel(c: Channel, sig: string): ChannelNodes {
    const gain = new Tone.Gain(1);
    const panner = new Tone.Panner(0);
    gain.connect(panner);
    if (c.kind === 'drum' && c.drumType) {
      const drum = createDrumVoice(c.drumType, c.drumParams ?? {});
      drum.output.connect(gain);
      return { gain, panner, drum, poly: null, sample: null, sig, paramSig: '' };
    }
    const poly = new Tone.PolySynth(Tone.MonoSynth, synthParamsToOptions(c.synthParams));
    poly.connect(gain);
    const sample = c.sampleInstrument ? new SampleVoice(c.sampleInstrument) : null;
    if (sample) sample.output.connect(gain);
    return {
      gain,
      panner,
      drum: null,
      poly,
      sample,
      sig,
      paramSig: JSON.stringify(c.synthParams ?? {}),
    };
  }

  private applyChannelParams(c: Channel): void {
    const nodes = this.channels.get(c.id);
    if (!nodes?.poly || !c.synthParams) return;
    const sig = JSON.stringify(c.synthParams);
    if (sig === nodes.paramSig) return;
    nodes.paramSig = sig;
    nodes.poly.set(synthParamsToOptions(c.synthParams));
    nodes.gain.gain.rampTo(c.synthParams.volume * c.synthParams.volume, 0.03);
  }

  private disposeChannel(nodes: ChannelNodes): void {
    nodes.drum?.dispose();
    nodes.poly?.dispose();
    nodes.sample?.dispose();
    nodes.gain.dispose();
    nodes.panner.dispose();
  }

  /** 预加载采样通道在编排里真正用到的键（后台加载，未就绪的键触发时回退合成） */
  private prepareSampledNotes(proj: Project): void {
    for (const c of proj.channels) {
      const nodes = this.channels.get(c.id);
      if (!nodes?.sample) continue;
      const midis: number[] = [];
      for (const p of proj.patterns)
        for (const n of p.notes) if (n.channelId === c.id) midis.push(n.pitch);
      if (midis.length) void nodes.sample.prepare(midis);
    }
  }

  /** 混音实时应用：BPM / FX 链（结构变化重建、参数变化原地调） / Fader / Pan / 静音独奏门 */
  private applyMix(proj: Project): void {
    this.ensureTracks(proj);
    const transport = Tone.getTransport();
    if (Math.abs(transport.bpm.value - proj.bpm) > 0.01) {
      transport.bpm.rampTo(proj.bpm, 0.05); // 播放中实时生效
    }
    for (const t of proj.mixerTracks) {
      const nodes = this.tracks.get(t.id);
      if (!nodes) continue;
      const active = t.effects.filter((e) => !e.bypass);
      const sig = active.map((e) => `${e.id}:${e.type}`).join('|');
      if (sig !== nodes.fxSig) this.rebuildTrackFx(nodes, active);
      else {
        for (const e of active) {
          const n = nodes.fxById.get(e.id);
          if (n) applyFxParams(n, e.type, e.params);
        }
      }
      nodes.fader.gain.rampTo(t.volume * t.volume, 0.03);
      nodes.panner.pan.rampTo(t.pan, 0.03);
    }
    // 静音/独奏门：任一轨独奏时，其余非独奏轨静音（Master 只受自身 mute 影响）
    const anySolo = proj.mixerTracks.some((t) => t.id !== MASTER_ID && t.solo);
    for (const t of proj.mixerTracks) {
      const nodes = this.tracks.get(t.id);
      if (!nodes) continue;
      const silent =
        t.mute || (t.id !== MASTER_ID && anySolo && !t.solo);
      nodes.gate.gain.rampTo(silent ? 0 : 1, 0.02);
    }
  }

  /** FX 链重建（旁路切换 / 增删效果器时） */
  private rebuildTrackFx(nodes: TrackNodes, active: FxInstance[]): void {
    nodes.input.disconnect();
    for (const n of nodes.fxById.values()) n.dispose();
    nodes.fxById.clear();
    let cursor: Tone.ToneAudioNode = nodes.input;
    for (const e of active) {
      const n = createFx(e.type, e.params);
      cursor.connect(n);
      cursor = n;
      nodes.fxById.set(e.id, n);
    }
    cursor.connect(nodes.fader);
    nodes.fxSig = active.map((e) => `${e.id}:${e.type}`).join('|');
  }

  /** 循环配置（Pattern 模式：Pattern 长度 × 重复遍数；Song 模式：整曲；不循环播完即停） */
  private applyLoop(force = false): void {
    const ui = useUiStore.getState();
    const proj = useProjectStore.getState();
    const pat = proj.patterns.find((p) => p.id === proj.currentPatternId);
    const patBars = pat?.bars ?? 1;
    /* Pattern 模式的循环区间至少覆盖整个 Pattern，重复选择器是「再播几遍」；
       Song 模式整曲循环，重复选择器不参与 */
    const regionBars =
      ui.playMode === 'song' ? songEndBars(proj) : patBars * ui.loopBars;
    const regionSteps = regionBars * 16;
    this.loopCtx = { loopOn: ui.loopOn, steps: regionSteps };

    const sig = `${ui.loopOn}|${ui.playMode}|${regionBars}|${proj.currentPatternId}`;
    if (!force && sig === this.loopSig) return;
    const changed = sig !== this.loopSig;
    this.loopSig = sig;

    const transport = Tone.getTransport();
    transport.loop = ui.loopOn;
    if (ui.loopOn) {
      transport.loopStart = 0;
      transport.loopEnd = `${regionBars}m`;
    }
    // 播放中调整循环区 / 切换 Pattern → 依据当前 Transport 位置重同步步进计数
    if (changed && transport.state === 'started') {
      const ticksPerStep = transport.PPQ / 4;
      this.step = Math.max(0, Math.floor(transport.ticks / ticksPerStep) % regionSteps);
    }
  }

  /* ============================================================
   * 分析器（电平表 / 频谱）
   * ============================================================ */

  /** Master 电平 0-1（供 LevelMeter 每帧读取） */
  getMasterLevel(): number {
    if (!this.meter) return 0;
    const v = this.meter.getValue();
    const db = typeof v === 'number' ? v : (v[0] ?? -Infinity);
    return Math.min(1, Math.max(0, Math.pow(10, db / 20) * 1.25));
  }

  /** 轨道电平 0-1（Mixer 轨道条电平表每帧读取；master 复用链尾电平） */
  getTrackLevel(trackId: string): number {
    if (trackId === MASTER_ID) return this.getMasterLevel();
    const m = this.tracks.get(trackId)?.meter;
    if (!m) return 0;
    const v = m.getValue();
    const db = typeof v === 'number' ? v : (v[0] ?? -Infinity);
    return Math.min(1, Math.max(0, Math.pow(10, db / 20) * 1.25));
  }

  /** Master 频谱（dB 值数组，供频谱显示） */
  getSpectrum(): Float32Array {
    if (!this.analyser) return new Float32Array(64);
    const v = this.analyser.getValue();
    return v instanceof Float32Array ? v : (v[0] ?? new Float32Array(64));
  }
}

/** 全局引擎单例 */
export const engine = new AudioEngine();
