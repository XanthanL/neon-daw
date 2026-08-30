/**
 * 采样声部层：加载**预打包到本地** `public/samples/` 的逐键采样，路由进现有混音链。
 *
 * · 钢琴为 **Salamander Grand Piano v3**（CC-BY 3.0）：`scripts/build-piano-salamander.mjs`
 *   将 30 根音 × 16 力度转成逐键三层力度 44.1k 单声道 mp3 —— `piano/{soft,mid,hard}/<midi>.mp3`，
 *   非网格键转时就近根音并 ±1 半音移调。
 * · 其余乐器为 FluidR3_GM（CC-BY 3.0，经 midi-js-soundfonts）逐键采样：`<instrument>/<midi>.mp3`。
 * · 文件名一律用 MIDI 号：同源静态加载，规避升降号命名差异、URL '#' 锚点与实时跨域 GET。
 * · 每个带 `sampleInstrument` 的通道持有一个 SampleVoice：每层一个 Tone.Sampler，汇入同一 Channel 输出；
 *   触发时按力度选层（就近回退到相邻已加载层），整键未加载返回 false 由调用方回退合成器，保证**永不静音**。
 * · `prepare(midis)` 只加载真正用到的键（扫描编排得到），并发限流、去重、失败静默。
 *
 * 注意：Tone 节点绑定创建时的上下文，故在线引擎与离线导出需各自 new SampleVoice，不能跨上下文复用。
 */
import * as Tone from 'tone';

/** 本地打包采样目录（随 base 变化，兼容 GitHub Pages 子路径） */
export const SAMPLE_BASE = `${import.meta.env.BASE_URL}samples/`;

/** 署名（README / 页脚展示，满足 CC-BY） */
export const SAMPLE_ATTRIBUTION =
  'Piano: Salamander Grand Piano v3 by Alexander Holm (CC-BY 3.0) · Other instruments: FluidR3_GM (CC-BY 3.0)';

/** 常用采样乐器（与 public/samples 下的文件夹名一致） */
export const SAMPLE_INSTRUMENTS = {
  piano: 'piano',
  ePiano: 'electric_piano_1',
  bass: 'acoustic_bass',
  strings: 'synth_strings_1',
} as const;

/** 历史工程里存过的旧文件夹名 → 现规范名 */
const INSTRUMENT_ALIAS: Record<string, string> = {
  acoustic_grand_piano: 'piano',
};

/** 带力度分层的乐器（子目录序列 = 由弱到强）；未列出的为单层 */
const INSTRUMENT_LAYERS: Record<string, string[]> = {
  piano: ['soft', 'mid', 'hard'],
};

/** 0..1 力度 → 层下标 */
const layerForVelocity = (v: number, layers: number): number =>
  layers === 1 ? 0 : v < 0.42 ? 0 : v < 0.72 ? Math.min(1, layers - 1) : layers - 1;

/** MIDI → Tone 音名（仅作为 Sampler 内部键，与文件名无关） */
export const noteName = (midi: number): string =>
  Tone.Frequency(midi, 'midi').toNote();

/** 本地采样 URL：按 MIDI 号命名，天然避开升降号与 '#' */
export const noteUrl = (instrument: string, midi: number, layer?: string): string =>
  `${SAMPLE_BASE}${instrument}${layer ? `/${layer}` : ''}/${Math.round(midi)}.mp3`;

/** 并发限流加载 */
const CONCURRENCY = 6;

export class SampleVoice {
  /** 规范乐器名（public/samples 下文件夹名） */
  readonly instrument: string;
  private readonly out = new Tone.Channel();
  private readonly layerDirs: (string | undefined)[];
  private readonly samplers: Tone.Sampler[];
  private readonly loaded: Set<number>[];
  private readonly inflight = new Set<string>();
  /** 按住发声中的键 → 所用层下标 */
  private readonly active = new Map<number, number>();

  constructor(instrument: string) {
    this.instrument = INSTRUMENT_ALIAS[instrument] ?? instrument;
    this.layerDirs = INSTRUMENT_LAYERS[this.instrument] ?? [undefined];
    this.samplers = Array.from({ length: this.layerDirs.length }, () => {
      const s = new Tone.Sampler();
      s.connect(this.out, 0, 0);
      return s;
    });
    this.loaded = this.layerDirs.map(() => new Set<number>());
  }

  get output(): Tone.ToneAudioNode {
    return this.out;
  }

  isLoaded(midi: number): boolean {
    return this.loaded.some((set) => set.has(midi));
  }

  /** 加载一组 MIDI 键的全部力度层（去重、限流、失败静默跳过 → 触发时回退） */
  async prepare(midis: number[]): Promise<void> {
    const jobs: { midi: number; li: number }[] = [];
    for (const midi of new Set(midis)) {
      for (let li = 0; li < this.layerDirs.length; li++) {
        const key = `${li}:${midi}`;
        if (this.loaded[li].has(midi) || this.inflight.has(key)) continue;
        this.inflight.add(key);
        jobs.push({ midi, li });
      }
    }
    if (jobs.length === 0) return;

    let cursor = 0;
    const worker = async () => {
      while (cursor < jobs.length) {
        const { midi, li } = jobs[cursor++];
        try {
          const buf = new Tone.ToneAudioBuffer();
          await buf.load(noteUrl(this.instrument, midi, this.layerDirs[li]));
          this.samplers[li].add(
            noteName(midi) as Parameters<Tone.Sampler['add']>[0],
            buf,
          );
          this.loaded[li].add(midi);
        } catch {
          /* 单键失败静默：触发时回退相邻层或合成器 */
        } finally {
          this.inflight.delete(`${li}:${midi}`);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker),
    );
  }

  /** 0..1 力度 → 优先层下标（未加载时由调用方就近回退） */
  private pickLayer(midi: number, velocity: number): number {
    const n = this.layerDirs.length;
    const start = layerForVelocity(velocity, n);
    for (let d = 0; d < n; d++) {
      for (const li of d === 0 ? [start] : [start - d, start + d]) {
        if (li >= 0 && li < n && this.loaded[li].has(midi)) return li;
      }
    }
    return -1;
  }

  /** 仅对已加载的键发声；未加载返回 false 由调用方回退 */
  trigger(midi: number, duration: number, time: number, velocity: number): boolean {
    const li = this.pickLayer(midi, velocity);
    if (li < 0) return false;
    this.samplers[li].triggerAttackRelease(noteName(midi), duration, time, velocity);
    return true;
  }

  /** 持续发声开始（虚拟键盘按住）；未加载返回 false 由调用方回退合成器 */
  attack(midi: number, time: number, velocity: number): boolean {
    const li = this.pickLayer(midi, velocity);
    if (li < 0) return false;
    this.samplers[li].triggerAttack(noteName(midi), time, velocity);
    this.active.set(midi, li);
    return true;
  }

  /** 持续发声结束（松开）；非采样发声时静默 */
  release(midi: number, time?: number): void {
    const li = this.active.get(midi);
    if (li === undefined) return;
    this.samplers[li].triggerRelease(noteName(midi), time);
    this.active.delete(midi);
  }

  dispose(): void {
    for (const s of this.samplers) s.dispose();
    this.out.dispose();
    for (const set of this.loaded) set.clear();
    this.active.clear();
    this.inflight.clear();
  }
}
