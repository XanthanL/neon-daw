/**
 * 效果器工厂：按 projectStore 的 FxInstance（type + params）实时构建/调参
 * Task 7 的参数面板 schema 将基于此处扩展
 */
import * as Tone from 'tone';
import type { FxType } from '../types/project';

/** Filter 的 type 参数在数据模型中以数字编码（Record<string, number>） */
const FILTER_TYPES = ['lowpass', 'highpass', 'bandpass', 'notch'] as const;

/** 设置 wet（仅 Effect 类节点拥有，且参数中可能未提供） */
const setWet = (node: Tone.ToneAudioNode, wet: number | undefined) => {
  if (wet === undefined) return;
  const effect = node as unknown as { wet: Tone.Param<'normalRange'> };
  if (effect.wet && typeof effect.wet.value === 'number') effect.wet.value = wet;
};

/** 创建效果器节点（参数即初始值） */
export function createFx(type: FxType, params: Record<string, number>): Tone.ToneAudioNode {
  switch (type) {
    case 'reverb': {
      const n = new Tone.Reverb({ decay: params.decay, preDelay: params.preDelay });
      setWet(n, params.wet);
      return n;
    }
    case 'feedbackDelay': {
      const n = new Tone.FeedbackDelay({
        delayTime: params.delayTime,
        feedback: params.feedback,
      });
      setWet(n, params.wet);
      return n;
    }
    case 'pingPongDelay': {
      const n = new Tone.PingPongDelay({
        delayTime: params.delayTime,
        feedback: params.feedback,
      });
      setWet(n, params.wet);
      return n;
    }
    case 'eq3':
      return new Tone.EQ3({
        low: params.low,
        mid: params.mid,
        high: params.high,
        lowFrequency: params.lowFrequency,
        highFrequency: params.highFrequency,
      });
    case 'filter':
      return new Tone.Filter({
        type: FILTER_TYPES[Math.round(params.type) % FILTER_TYPES.length],
        frequency: params.frequency,
        Q: params.q,
      });
    case 'autoFilter': {
      const n = new Tone.AutoFilter({
        frequency: params.frequency,
        depth: params.depth,
        baseFrequency: params.baseFrequency,
        octaves: params.octaves,
      });
      setWet(n, params.wet);
      n.start();
      return n;
    }
    case 'compressor':
      return new Tone.Compressor({
        threshold: params.threshold,
        knee: params.knee,
        ratio: params.ratio,
        attack: params.attack,
        release: params.release,
      });
    case 'chorus': {
      const n = new Tone.Chorus({
        frequency: params.frequency,
        delayTime: params.delayTime,
        depth: params.depth,
      });
      setWet(n, params.wet);
      n.start();
      return n;
    }
    case 'phaser': {
      const n = new Tone.Phaser({
        frequency: params.frequency,
        octaves: params.octaves,
      });
      setWet(n, params.wet);
      return n;
    }
    case 'distortion': {
      const n = new Tone.Distortion({ distortion: params.distortion });
      setWet(n, params.wet);
      return n;
    }
    case 'bitCrusher': {
      const n = new Tone.BitCrusher({ bits: Math.round(params.bits) });
      setWet(n, params.wet);
      return n;
    }
    case 'tremolo': {
      const n = new Tone.Tremolo({
        frequency: params.frequency,
        depth: params.depth,
      });
      setWet(n, params.wet);
      n.start();
      return n;
    }
    case 'limiter':
      return new Tone.Limiter({ threshold: params.threshold });
    case 'stereoWidener':
      return new Tone.StereoWidener({ width: params.width });
  }
}

/** 对已有效果器节点实时调参（不动链路结构，即时生效） */
export function applyFxParams(
  node: Tone.ToneAudioNode,
  type: FxType,
  p: Record<string, number>,
): void {
  switch (type) {
    case 'reverb': {
      const n = node as Tone.Reverb;
      setWet(n, p.wet);
      // decay 赋值会重新生成脉冲响应，加阈值避免拖动时频繁重生成
      if (Math.abs(Number(n.decay) - p.decay) > 0.05) n.decay = p.decay;
      n.preDelay = p.preDelay;
      return;
    }
    case 'feedbackDelay': {
      const n = node as Tone.FeedbackDelay;
      n.delayTime.rampTo(p.delayTime, 0.05);
      n.feedback.rampTo(p.feedback, 0.05);
      setWet(n, p.wet);
      return;
    }
    case 'pingPongDelay': {
      const n = node as Tone.PingPongDelay;
      n.delayTime.rampTo(p.delayTime, 0.05);
      n.feedback.rampTo(p.feedback, 0.05);
      setWet(n, p.wet);
      return;
    }
    case 'eq3': {
      const n = node as Tone.EQ3;
      n.low.value = p.low;
      n.mid.value = p.mid;
      n.high.value = p.high;
      n.lowFrequency.value = p.lowFrequency;
      n.highFrequency.value = p.highFrequency;
      return;
    }
    case 'filter': {
      const n = node as Tone.Filter;
      n.type = FILTER_TYPES[Math.round(p.type) % FILTER_TYPES.length];
      n.frequency.rampTo(p.frequency, 0.03);
      n.Q.value = p.q;
      return;
    }
    case 'autoFilter': {
      const n = node as Tone.AutoFilter;
      n.frequency.value = p.frequency;
      n.depth.value = p.depth;
      n.baseFrequency = p.baseFrequency;
      n.octaves = p.octaves;
      setWet(n, p.wet);
      return;
    }
    case 'compressor': {
      const n = node as Tone.Compressor;
      n.threshold.value = p.threshold;
      n.knee.value = p.knee;
      n.ratio.value = p.ratio;
      n.attack.value = p.attack;
      n.release.value = p.release;
      return;
    }
    case 'chorus': {
      const n = node as Tone.Chorus;
      n.frequency.value = p.frequency;
      n.depth = p.depth; // Chorus.depth 为普通数值属性
      n.delayTime = p.delayTime;
      setWet(n, p.wet);
      return;
    }
    case 'phaser': {
      const n = node as Tone.Phaser;
      n.frequency.value = p.frequency;
      n.octaves = p.octaves;
      setWet(n, p.wet);
      return;
    }
    case 'distortion': {
      const n = node as Tone.Distortion;
      n.distortion = p.distortion;
      setWet(n, p.wet);
      return;
    }
    case 'bitCrusher': {
      const n = node as Tone.BitCrusher;
      n.bits.value = Math.round(p.bits);
      setWet(n, p.wet);
      return;
    }
    case 'tremolo': {
      const n = node as Tone.Tremolo;
      n.frequency.value = p.frequency;
      n.depth.value = p.depth;
      setWet(n, p.wet);
      return;
    }
    case 'limiter': {
      const n = node as Tone.Limiter;
      n.threshold.value = p.threshold;
      return;
    }
    case 'stereoWidener': {
      const n = node as Tone.StereoWidener;
      n.width.value = p.width;
      return;
    }
  }
}

/* ============================================================
 * 效果器参数 schema（Mixer 效果器参数面板按此渲染旋钮/按钮组）
 * ============================================================ */

/** 单个参数定义（enum 存在时以贴纸按钮组呈现，否则渲染 Knob） */
export interface FxParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  /** 枚举型参数（数值编码，如 Filter 类型 0-3） */
  enum?: { value: number; label: string }[];
}

export interface FxMeta {
  /** 面板用完整名 */
  label: string;
  /** 插槽用短名 */
  short: string;
  params: FxParamDef[];
}

const fmtHz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${Math.round(v)}Hz`);
const fmtSec = (v: number) => `${v.toFixed(2)}s`;
const fmtMs = (v: number) => `${Math.round(v * 1000)}ms`;
const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
const fmtDb = (v: number) => `${v.toFixed(1)}dB`;

/** 14 种效果器参数表（key 与 projectStore FX_DEFAULT_PARAMS 一一对应） */
export const FX_LIBRARY: Record<FxType, FxMeta> = {
  reverb: {
    label: 'Reverb ',
    short: 'Reverb',
    params: [
      { key: 'decay', label: 'Decay', min: 0.1, max: 8, step: 0.1, format: fmtSec },
      { key: 'preDelay', label: 'PreDly', min: 0, max: 0.1, step: 0.005, format: fmtMs },
      { key: 'wet', label: 'Wet', min: 0, max: 1, step: 0.01, format: fmtPct },
    ],
  },
  feedbackDelay: {
    label: 'Feedback Delay ',
    short: 'Delay',
    params: [
      { key: 'delayTime', label: 'Time', min: 0.02, max: 1, step: 0.01, format: fmtSec },
      { key: 'feedback', label: 'Fdbk', min: 0, max: 0.9, step: 0.01, format: fmtPct },
      { key: 'wet', label: 'Wet', min: 0, max: 1, step: 0.01, format: fmtPct },
    ],
  },
  pingPongDelay: {
    label: 'PingPong Delay ',
    short: 'P-Pong',
    params: [
      { key: 'delayTime', label: 'Time', min: 0.02, max: 1, step: 0.01, format: fmtSec },
      { key: 'feedback', label: 'Fdbk', min: 0, max: 0.9, step: 0.01, format: fmtPct },
      { key: 'wet', label: 'Wet', min: 0, max: 1, step: 0.01, format: fmtPct },
    ],
  },
  eq3: {
    label: 'EQ3 ',
    short: 'EQ3',
    params: [
      { key: 'low', label: 'Low', min: -12, max: 12, step: 0.5, format: fmtDb },
      { key: 'mid', label: 'Mid', min: -12, max: 12, step: 0.5, format: fmtDb },
      { key: 'high', label: 'High', min: -12, max: 12, step: 0.5, format: fmtDb },
      { key: 'lowFrequency', label: 'LoFreq', min: 40, max: 1000, step: 5, format: fmtHz },
      { key: 'highFrequency', label: 'HiFreq', min: 1000, max: 8000, step: 50, format: fmtHz },
    ],
  },
  filter: {
    label: 'Filter ',
    short: 'Filter',
    params: [
      {
        key: 'type',
        label: 'Type',
        min: 0,
        max: 3,
        step: 1,
        enum: [
          { value: 0, label: 'LP' },
          { value: 1, label: 'HP' },
          { value: 2, label: 'BP' },
          { value: 3, label: 'NT' },
        ],
      },
      { key: 'frequency', label: 'Cutoff', min: 20, max: 20000, step: 20, format: fmtHz },
      { key: 'q', label: 'Q', min: 0.1, max: 10, step: 0.1 },
    ],
  },
  autoFilter: {
    label: 'AutoFilter ',
    short: 'AutoFlt',
    params: [
      { key: 'frequency', label: 'Rate', min: 0.05, max: 10, step: 0.05, format: (v) => `${v.toFixed(2)}Hz` },
      { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, format: fmtPct },
      { key: 'baseFrequency', label: 'Base', min: 20, max: 8000, step: 10, format: fmtHz },
      { key: 'octaves', label: 'Oct', min: 0, max: 6, step: 0.5 },
      { key: 'wet', label: 'Wet', min: 0, max: 1, step: 0.01, format: fmtPct },
    ],
  },
  compressor: {
    label: 'Compressor ',
    short: 'Comp',
    params: [
      { key: 'threshold', label: 'Thresh', min: -60, max: 0, step: 1, format: fmtDb },
      { key: 'knee', label: 'Knee', min: 0, max: 40, step: 1, format: fmtDb },
      { key: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, format: (v) => `${v.toFixed(1)}:1` },
      { key: 'attack', label: 'Attack', min: 0.001, max: 0.2, step: 0.001, format: fmtMs },
      { key: 'release', label: 'Rel', min: 0.01, max: 1, step: 0.01, format: fmtSec },
    ],
  },
  chorus: {
    label: 'Chorus ',
    short: 'Chorus',
    params: [
      { key: 'frequency', label: 'Rate', min: 0.05, max: 10, step: 0.05, format: (v) => `${v.toFixed(2)}Hz` },
      { key: 'delayTime', label: 'Delay', min: 0.001, max: 0.02, step: 0.001, format: fmtMs },
      { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, format: fmtPct },
      { key: 'wet', label: 'Wet', min: 0, max: 1, step: 0.01, format: fmtPct },
    ],
  },
  phaser: {
    label: 'Phaser ',
    short: 'Phaser',
    params: [
      { key: 'frequency', label: 'Rate', min: 0.05, max: 10, step: 0.05, format: (v) => `${v.toFixed(2)}Hz` },
      { key: 'octaves', label: 'Oct', min: 0, max: 6, step: 0.5 },
      { key: 'wet', label: 'Wet', min: 0, max: 1, step: 0.01, format: fmtPct },
    ],
  },
  distortion: {
    label: 'Distortion ',
    short: 'Dist',
    params: [
      { key: 'distortion', label: 'Amount', min: 0, max: 1, step: 0.01, format: fmtPct },
      { key: 'wet', label: 'Wet', min: 0, max: 1, step: 0.01, format: fmtPct },
    ],
  },
  bitCrusher: {
    label: 'BitCrusher ',
    short: 'Crush',
    params: [
      { key: 'bits', label: 'Bits', min: 1, max: 16, step: 1 },
      { key: 'wet', label: 'Wet', min: 0, max: 1, step: 0.01, format: fmtPct },
    ],
  },
  tremolo: {
    label: 'Tremolo ',
    short: 'Trem',
    params: [
      { key: 'frequency', label: 'Rate', min: 0.1, max: 20, step: 0.1, format: (v) => `${v.toFixed(1)}Hz` },
      { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01, format: fmtPct },
    ],
  },
  limiter: {
    label: 'Limiter ',
    short: 'Limit',
    params: [{ key: 'threshold', label: 'Ceil', min: -60, max: 0, step: 1, format: fmtDb }],
  },
  stereoWidener: {
    label: 'StereoWidener ',
    short: 'Wide',
    params: [{ key: 'width', label: 'Width', min: 0, max: 1, step: 0.01, format: fmtPct }],
  },
};

/** 添加菜单顺序（14 种全量） */
export const FX_ORDER: FxType[] = [
  'reverb',
  'feedbackDelay',
  'pingPongDelay',
  'eq3',
  'filter',
  'autoFilter',
  'compressor',
  'chorus',
  'phaser',
  'distortion',
  'bitCrusher',
  'tremolo',
  'limiter',
  'stereoWidener',
];
