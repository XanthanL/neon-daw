/**
 * 离线渲染：把工程（当前 Pattern 或 Song 整曲）用 Tone.Offline 渲染为 AudioBuffer
 * 复刻在线引擎的信号链与调度规则：
 *   通道音源 → 轨道 input → FX 链（旁路跳过）→ Fader(volume²) → Pan → 静音/独奏门
 *   → Master Fader(volume²) → Limiter
 * 供键 8「导出音乐文件」生成 WAV。
 */
import * as Tone from 'tone';
import type { Channel, Pattern, Project } from '../types/project';
import { createDrumVoice, type DrumVoice } from './drumSynths';
import { createFx } from './effects';
import { synthParamsToOptions } from './engine';
import { SampleVoice } from './samples';

const MASTER_ID = 'track-master';
/** 渲染时长上限（秒），防止误配置渲染过久 */
const MAX_RENDER_SECONDS = 300;
/** 渲染起点留一点余量，避免首样本被包络吃掉 */
const START_OFFSET = 0.05;
/** 结尾余响（release / 混响尾） */
const TAIL_SECONDS = 2.5;

export type RenderTarget =
  | { kind: 'pattern'; patternId: string; loops: number }
  | { kind: 'song' };

/** 导出进度事件：value 为该阶段内 0..1。render 阶段由浏览器原生线程渲染，
 *  OfflineAudioContext 不给中间回调 → 只有 0 与 1，UI 需按不确定进度显示 */
export interface RenderProgress {
  phase: 'schedule' | 'render' | 'encode';
  value: number;
}

/** 预估渲染时长只需工程的一小片，UI 可原地 memoize（不必为此取全量 snapshot） */
export type RenderEstimateSource = Pick<Project, 'bpm' | 'patterns' | 'song'>;

/** Song 编曲末端小节数（与 engine 同规则） */
function songEndBars(proj: RenderEstimateSource): number {
  let end = 0;
  for (const t of proj.song.tracks) {
    for (const c of t.clips) {
      const bars = proj.patterns.find((p) => p.id === c.patternId)?.bars ?? 1;
      end = Math.max(end, c.startBar + bars);
    }
  }
  return Math.max(1, end);
}

/** 计算目标总时长（秒），供 UI 预估渲染时长展示 */
export function estimateRenderSeconds(
  proj: RenderEstimateSource,
  target: RenderTarget,
): number {
  const secPerStep = 60 / proj.bpm / 4;
  if (target.kind === 'pattern') {
    const pat = proj.patterns.find((p) => p.id === target.patternId);
    const steps = (pat?.bars ?? 1) * 16 * Math.max(1, target.loops);
    return steps * secPerStep + TAIL_SECONDS;
  }
  return songEndBars(proj) * 16 * secPerStep + TAIL_SECONDS;
}

interface OfflineChannel {
  drum: DrumVoice | null;
  poly: Tone.PolySynth<Tone.MonoSynth> | null;
  sample: SampleVoice | null;
  semis: number;
  stepSeconds: number;
}

/** 离线渲染工程为 AudioBuffer；onProgress 报告进度（调度 / 渲染阶段） */
export async function renderProject(
  proj: Project,
  target: RenderTarget,
  onProgress?: (p: RenderProgress) => void,
): Promise<AudioBuffer> {
  const secPerStep = 60 / proj.bpm / 4;

  let totalSteps: number;
  let singlePat: Pattern | null = null;
  if (target.kind === 'pattern') {
    singlePat = proj.patterns.find((p) => p.id === target.patternId) ?? null;
    if (!singlePat) throw new Error('找不到要导出的 Pattern');
    totalSteps = singlePat.bars * 16 * Math.max(1, target.loops);
  } else {
    totalSteps = songEndBars(proj) * 16;
    if (totalSteps <= 16 && proj.song.tracks.every((t) => t.clips.length === 0)) {
      throw new Error('Song 编排为空 —— 先在键 5 放置片段或键 7 抽卡生成整曲');
    }
  }

  const duration = Math.min(MAX_RENDER_SECONDS, totalSteps * secPerStep + TAIL_SECONDS);
  const renderSteps = Math.min(totalSteps, Math.floor((MAX_RENDER_SECONDS - TAIL_SECONDS) / secPerStep));
  const patById = new Map(proj.patterns.map((p) => [p.id, p]));

  /* Song 模式：先把「每一步落在哪些 Pattern 的哪些局部步」一次性摊平，
     避免调度循环里每步 × 每轨 × 每片段地重扫 + patterns.find()（长编排时这是卡顿主因） */
  const stepsBucket: { pat: Pattern; local: number }[][] | null = singlePat
    ? null
    : Array.from({ length: renderSteps }, () => [] as { pat: Pattern; local: number }[]);
  if (stepsBucket) {
    for (const track of proj.song.tracks) {
      for (const clip of track.clips) {
        const pat = patById.get(clip.patternId);
        if (!pat) continue;
        const base = clip.startBar * 16;
        const len = pat.bars * 16;
        for (let local = 0; local < len; local++) {
          const step = base + local;
          if (step >= 0 && step < renderSteps) stepsBucket[step].push({ pat, local });
        }
      }
    }
  }

  const rendered = await Tone.Offline(
    async ({ destination }) => {
      /* ---------- Master 链 ---------- */
      const masterTrack = proj.mixerTracks.find((t) => t.id === MASTER_ID);
      const limiter = new Tone.Limiter(-1).connect(destination);
      const masterFader = new Tone.Gain(
        Math.pow(masterTrack?.volume ?? 0.85, 2),
      ).connect(limiter);

      const anySolo = proj.mixerTracks.some((t) => t.id !== MASTER_ID && t.solo);
      const trackInputs = new Map<string, Tone.Gain>();
      const pendingReady: Promise<unknown>[] = [];

      /* ---------- 轨道链 ---------- */
      for (const t of proj.mixerTracks) {
        if (t.id === MASTER_ID) continue;
        const silent = t.mute || (anySolo && !t.solo);
        const input = new Tone.Gain(1);
        let cursor: Tone.ToneAudioNode = input;
        for (const e of t.effects.filter((fx) => !fx.bypass)) {
          const node = createFx(e.type, e.params);
          cursor.connect(node);
          cursor = node;
          const ready = (node as unknown as { ready?: Promise<unknown> }).ready;
          if (ready) pendingReady.push(ready);
        }
        const fader = new Tone.Gain(t.volume * t.volume);
        const panner = new Tone.Panner(t.pan);
        const gate = new Tone.Gain(silent ? 0 : 1);
        cursor.connect(fader);
        fader.connect(panner);
        panner.connect(gate);
        gate.connect(masterFader);
        trackInputs.set(t.id, input);
      }

      /* ---------- 通道音源 ---------- */
      const voices = new Map<string, OfflineChannel>();
      for (const ch of proj.channels) {
        const routeTarget =
          trackInputs.get(ch.mixerTrackId) ?? (masterFader as Tone.ToneAudioNode);
        if (ch.kind === 'drum' && ch.drumType) {
          const drum = createDrumVoice(ch.drumType, ch.drumParams ?? {});
          drum.output.connect(routeTarget);
          voices.set(ch.id, { drum, poly: null, sample: null, semis: 0, stepSeconds: secPerStep });
        } else if (ch.kind === 'synth') {
          const gain = new Tone.Gain(
            Math.pow(ch.synthParams?.volume ?? 0.8, 2),
          ).connect(routeTarget);
          const poly = new Tone.PolySynth(
            Tone.MonoSynth,
            synthParamsToOptions(ch.synthParams),
          ).connect(gain);
          const sample = ch.sampleInstrument ? new SampleVoice(ch.sampleInstrument) : null;
          if (sample) {
            sample.output.connect(gain);
            const midis: number[] = [];
            for (const p of proj.patterns)
              for (const n of p.notes) if (n.channelId === ch.id) midis.push(n.pitch);
            if (midis.length) pendingReady.push(sample.prepare(midis));
          }
          const p = ch.synthParams;
          voices.set(ch.id, {
            drum: null,
            poly,
            sample,
            semis: (p?.osc1Octave ?? 0) * 12 + (p?.osc2Detune ?? 0) / 100,
            stepSeconds: secPerStep,
          });
        }
      }

      /* 等混响等异步生成的节点就绪（离线上下文内部生成 IR） */
      if (pendingReady.length) await Promise.all(pendingReady);

      /* ---------- 调度 ---------- */
      const vel01 = (v: number) => Math.min(1, Math.max(0.01, v / 127));
      const chById = new Map<string, Channel>(proj.channels.map((c) => [c.id, c]));

      const schedulePatternStep = (pat: Pattern, localStep: number, time: number) => {
        for (const ch of proj.channels) {
          const sd = pat.steps[ch.id]?.[localStep];
          if (!sd?.on) continue;
          const v = voices.get(ch.id);
          if (!v) continue;
          if (v.drum) {
            v.drum.trigger(sd.velocity, time);
          } else if (v.poly) {
            v.poly.triggerAttackRelease(
              Tone.Frequency(60 + v.semis, 'midi').toFrequency(),
              secPerStep,
              time,
              vel01(sd.velocity),
            );
          }
        }
        for (const n of pat.notes) {
          if (n.startStep !== localStep) continue;
          const v = voices.get(n.channelId);
          const ch = chById.get(n.channelId);
          if (!v || !ch || ch.kind !== 'synth') continue;
          const dur = Math.min(n.lengthSteps * secPerStep, duration - time - 0.01);
          if (v.sample?.trigger(n.pitch, dur, time, vel01(n.velocity))) continue;
          if (!v.poly) continue;
          v.poly.triggerAttackRelease(
            Tone.Frequency(n.pitch + v.semis, 'midi').toFrequency(),
            dur,
            time,
            vel01(n.velocity),
          );
        }
      };

      /* 分块调度：每 SCHEDULE_CHUNK 步让出主线程并上报进度，避免长曲一次性建节点卡死页面 */
      const SCHEDULE_CHUNK = 32;
      for (let step = 0; step < renderSteps; step++) {
        const time = START_OFFSET + step * secPerStep;
        if (singlePat) {
          schedulePatternStep(singlePat, step % (singlePat.bars * 16), time);
        } else {
          for (const { pat, local } of stepsBucket![step]) schedulePatternStep(pat, local, time);
        }
        if (step % SCHEDULE_CHUNK === SCHEDULE_CHUNK - 1) {
          onProgress?.({ phase: 'schedule', value: (step + 1) / renderSteps });
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      onProgress?.({ phase: 'schedule', value: 1 });
      onProgress?.({ phase: 'render', value: 0 });
    },
    duration,
    2,
    44100,
  );

  const buffer = rendered.get();
  onProgress?.({ phase: 'render', value: 1 });
  if (!buffer) throw new Error('离线渲染返回空音频');
  return buffer;
}
