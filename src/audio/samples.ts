/**
 * 采样声部层：加载**预打包到本地** `public/samples/` 的逐键采样（FluidR3_GM，CC-BY 3.0），路由进现有混音链。
 *
 * · 采样由 `scripts/fetch-samples.mjs` 一次性抓取到 `public/samples/<乐器>/<midi>.mp3`，
 *   运行时同源静态加载（不再实时跨域 GET 远程 CDN，消除卡顿与 404）。
 * · 用 **MIDI 号做文件名**，规避 FluidR3 的降号命名与 URL 里 '#' 被当锚点的问题（黑键不再缺失）。
 * · 每个带 `sampleInstrument` 的通道持有一个 SampleVoice（内部是 Tone.Sampler，可接 track input）。
 * · `prepare(midis)` 只加载真正用到的键（扫描编排得到），并发限流、去重、失败静默。
 * · 触发时若该键未加载则不发声——调用方（引擎/导出）负责回退到合成器，保证**永不静音**。
 *
 * 注意：Tone 节点绑定创建时的上下文，故在线引擎与离线导出需各自 new SampleVoice，不能跨上下文复用。
 */
import * as Tone from 'tone';

/** 本地打包采样目录（随 base 变化，兼容 GitHub Pages 子路径） */
export const SAMPLE_BASE = `${import.meta.env.BASE_URL}samples/`;

/** 署名（README / 页脚展示，满足 CC-BY） */
export const SAMPLE_ATTRIBUTION =
  'Instrument samples: FluidR3_GM (CC-BY 3.0) via midi-js-soundfonts';

/** 常用采样乐器（与 public/samples 下的文件夹名一致） */
export const SAMPLE_INSTRUMENTS = {
  piano: 'acoustic_grand_piano',
  ePiano: 'electric_piano_1',
  bass: 'acoustic_bass',
  strings: 'synth_strings_1',
} as const;

/** MIDI → Tone 音名（仅作为 Sampler 内部键，与文件名无关） */
export const noteName = (midi: number): string =>
  Tone.Frequency(midi, 'midi').toNote();

/** 本地采样 URL：按 MIDI 号命名，天然避开升降号与 '#' */
export const noteUrl = (instrument: string, midi: number): string =>
  `${SAMPLE_BASE}${instrument}/${Math.round(midi)}.mp3`;

/** 并发限流加载 */
const CONCURRENCY = 6;

export class SampleVoice {
  readonly sampler: Tone.Sampler;
  private loaded = new Set<number>();
  private inflight = new Set<number>();

  constructor(readonly instrument: string) {
    this.sampler = new Tone.Sampler();
  }

  get output(): Tone.ToneAudioNode {
    return this.sampler;
  }

  isLoaded(midi: number): boolean {
    return this.loaded.has(midi);
  }

  /** 加载一组 MIDI 键（去重、限流、失败静默跳过 → 调用方回退合成） */
  async prepare(midis: number[]): Promise<void> {
    const todo = [...new Set(midis)].filter(
      (m) => !this.loaded.has(m) && !this.inflight.has(m),
    );
    if (todo.length === 0) return;

    let cursor = 0;
    const worker = async () => {
      while (cursor < todo.length) {
        const midi = todo[cursor++];
        this.inflight.add(midi);
        try {
          const buf = new Tone.ToneAudioBuffer();
          await buf.load(noteUrl(this.instrument, midi));
          this.sampler.add(
            noteName(midi) as Parameters<Tone.Sampler['add']>[0],
            buf,
          );
          this.loaded.add(midi);
        } catch {
          /* 单键失败静默：触发时回退合成器 */
        } finally {
          this.inflight.delete(midi);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker),
    );
  }

  /** 仅对已加载的键发声；未加载返回 false 由调用方回退 */
  trigger(midi: number, duration: number, time: number, velocity: number): boolean {
    if (!this.loaded.has(midi)) return false;
    this.sampler.triggerAttackRelease(noteName(midi), duration, time, velocity);
    return true;
  }

  dispose(): void {
    this.sampler.dispose();
    this.loaded.clear();
    this.inflight.clear();
  }
}
