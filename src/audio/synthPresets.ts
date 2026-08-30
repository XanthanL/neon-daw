/**
 * 合成器音色预设库：5 类 × 3 预设（Task 8）
 * Bass：Deep Sub / Acid / Growl
 * Lead：Saw / Square / Bright
 * Pluck：Karplus / FM / Soft
 * Pad：Warm / Dream / Strings
 * Keys：E-Piano / Organ / Glass
 */
import type { SynthParams } from '../types/project';

export type PresetCategoryId = 'bass' | 'lead' | 'pluck' | 'pad' | 'keys';

export interface PresetCategory {
  id: PresetCategoryId;
  label: string;
  /** 分类功能色（荧光家族） */
  color: string;
}

export const PRESET_CATEGORIES: PresetCategory[] = [
  { id: 'bass', label: 'Bass', color: '#4D9FFF' },
  { id: 'lead', label: 'Lead', color: '#FF9F1C' },
  { id: 'pluck', label: 'Pluck', color: '#39FF88' },
  { id: 'pad', label: 'Pad', color: '#A78BFA' },
  { id: 'keys', label: 'Keys', color: '#FFE600' },
];

export interface SynthPreset {
  id: string;
  name: string;
  category: PresetCategoryId;
  /** 一句话音色描述（卡片副标题） */
  blurb: string;
  params: SynthParams;
}

/* ============================================================
 * 预设参数
 * ============================================================ */

const p = (params: SynthParams): SynthParams => ({ ...params });

export const SYNTH_PRESETS: SynthPreset[] = [
  /* ---------------- Bass ---------------- */
  {
    id: 'bass-deep-sub',
    name: 'Deep Sub',
    category: 'bass',
    blurb: '深沉正弦 sub，只留最低的律动',
    params: p({
      osc1Waveform: 'sine',
      osc1Octave: -1,
      osc1Level: 0.95,
      osc2Waveform: 'triangle',
      osc2Octave: 0,
      osc2Detune: 5,
      osc2Level: 0.3,
      filterType: 'lowpass',
      filterCutoff: 240,
      filterQ: 0.8,
      filterEnvAmount: 0.5,
      attack: 0.005,
      decay: 0.35,
      sustain: 0.35,
      release: 0.3,
      volume: 0.9,
    }),
  },
  {
    id: 'bass-acid',
    name: 'Acid',
    category: 'bass',
    blurb: '303 式共振扫频，酸性锯齿',
    params: p({
      osc1Waveform: 'sawtooth',
      osc1Octave: -1,
      osc1Level: 0.85,
      osc2Waveform: 'square',
      osc2Octave: -1,
      osc2Detune: 9,
      osc2Level: 0.3,
      filterType: 'lowpass',
      filterCutoff: 550,
      filterQ: 12,
      filterEnvAmount: 0.85,
      attack: 0.003,
      decay: 0.18,
      sustain: 0.15,
      release: 0.12,
      volume: 0.8,
    }),
  },
  {
    id: 'bass-growl',
    name: 'Growl',
    category: 'bass',
    blurb: '失谐双锯咆哮，中频厚重',
    params: p({
      osc1Waveform: 'sawtooth',
      osc1Octave: -1,
      osc1Level: 0.8,
      osc2Waveform: 'sawtooth',
      osc2Octave: 0,
      osc2Detune: -18,
      osc2Level: 0.55,
      filterType: 'lowpass',
      filterCutoff: 900,
      filterQ: 6,
      filterEnvAmount: 0.6,
      attack: 0.01,
      decay: 0.3,
      sustain: 0.5,
      release: 0.2,
      volume: 0.85,
    }),
  },

  /* ---------------- Lead ---------------- */
  {
    id: 'lead-saw',
    name: 'Saw Lead',
    category: 'lead',
    blurb: '经典锯齿+方波双振荡主音',
    params: p({
      osc1Waveform: 'sawtooth',
      osc1Octave: 0,
      osc1Level: 0.8,
      osc2Waveform: 'square',
      osc2Octave: 0,
      osc2Detune: 12,
      osc2Level: 0.35,
      filterType: 'lowpass',
      filterCutoff: 5200,
      filterQ: 1.5,
      filterEnvAmount: 0.3,
      attack: 0.01,
      decay: 0.2,
      sustain: 0.6,
      release: 0.3,
      volume: 0.75,
    }),
  },
  {
    id: 'lead-square',
    name: 'Square Lead',
    category: 'lead',
    blurb: '8-bit 感方波，颗粒清晰',
    params: p({
      osc1Waveform: 'square',
      osc1Octave: 0,
      osc1Level: 0.75,
      osc2Waveform: 'square',
      osc2Octave: 1,
      osc2Detune: 7,
      osc2Level: 0.25,
      filterType: 'lowpass',
      filterCutoff: 3800,
      filterQ: 1,
      filterEnvAmount: 0.2,
      attack: 0.01,
      decay: 0.15,
      sustain: 0.7,
      release: 0.25,
      volume: 0.7,
    }),
  },
  {
    id: 'lead-bright',
    name: 'Bright',
    category: 'lead',
    blurb: '高开滤波的明亮穿透主音',
    params: p({
      osc1Waveform: 'sawtooth',
      osc1Octave: 0,
      osc1Level: 0.75,
      osc2Waveform: 'sawtooth',
      osc2Octave: 1,
      osc2Detune: 14,
      osc2Level: 0.4,
      filterType: 'lowpass',
      filterCutoff: 9000,
      filterQ: 2,
      filterEnvAmount: 0.4,
      attack: 0.005,
      decay: 0.25,
      sustain: 0.55,
      release: 0.35,
      volume: 0.7,
    }),
  },

  /* ---------------- Pluck ---------------- */
  {
    id: 'pluck-karplus',
    name: 'Karplus',
    category: 'pluck',
    blurb: '物理拨弦质感，高 Q 短衰减',
    params: p({
      osc1Waveform: 'triangle',
      osc1Octave: 0,
      osc1Level: 0.85,
      osc2Waveform: 'triangle',
      osc2Octave: 0,
      osc2Detune: 4,
      osc2Level: 0.2,
      filterType: 'lowpass',
      filterCutoff: 2400,
      filterQ: 8,
      filterEnvAmount: 0.7,
      attack: 0.002,
      decay: 0.12,
      sustain: 0,
      release: 0.2,
      volume: 0.8,
    }),
  },
  {
    id: 'pluck-fm',
    name: 'FM',
    category: 'pluck',
    blurb: '带通 FM 味金属敲击拨弦',
    params: p({
      // 修正：基音 262~523Hz 在 1400Hz 窄带通之外，实测几乎无声；
      // 改低通 + 中等 Q，金属味交给高八度方波与包络，基音保真
      osc1Waveform: 'triangle',
      osc1Octave: 0,
      osc1Level: 0.9,
      osc2Waveform: 'square',
      osc2Octave: 1,
      osc2Detune: 0,
      osc2Level: 0.45,
      filterType: 'lowpass',
      filterCutoff: 2600,
      filterQ: 2.5,
      filterEnvAmount: 0.7,
      attack: 0.002,
      decay: 0.1,
      sustain: 0,
      release: 0.15,
      volume: 0.8,
    }),
  },
  {
    id: 'pluck-soft',
    name: 'Soft',
    category: 'pluck',
    blurb: '柔和正弦拨弦，圆润入耳',
    params: p({
      osc1Waveform: 'sine',
      osc1Octave: 0,
      osc1Level: 0.85,
      osc2Waveform: 'sine',
      osc2Octave: 0,
      osc2Detune: 3,
      osc2Level: 0.3,
      filterType: 'lowpass',
      filterCutoff: 1800,
      filterQ: 1,
      filterEnvAmount: 0.3,
      attack: 0.004,
      decay: 0.18,
      sustain: 0,
      release: 0.25,
      volume: 0.8,
    }),
  },

  /* ---------------- Pad ---------------- */
  {
    id: 'pad-warm',
    name: 'Warm',
    category: 'pad',
    blurb: '温暖失谐锯齿慢起音铺底',
    params: p({
      osc1Waveform: 'sawtooth',
      osc1Octave: 0,
      osc1Level: 0.55,
      osc2Waveform: 'sawtooth',
      osc2Octave: 0,
      osc2Detune: 10,
      osc2Level: 0.55,
      filterType: 'lowpass',
      filterCutoff: 1600,
      filterQ: 0.8,
      filterEnvAmount: 0.25,
      attack: 0.4,
      decay: 0.6,
      sustain: 0.7,
      release: 1.2,
      volume: 0.65,
    }),
  },
  {
    id: 'pad-dream',
    name: 'Dream',
    category: 'pad',
    blurb: '三角+锯齿梦幻长音氛围',
    params: p({
      osc1Waveform: 'triangle',
      osc1Octave: 0,
      osc1Level: 0.6,
      osc2Waveform: 'sawtooth',
      osc2Octave: 0,
      osc2Detune: 14,
      osc2Level: 0.45,
      filterType: 'lowpass',
      filterCutoff: 2400,
      filterQ: 1,
      filterEnvAmount: 0.3,
      attack: 0.8,
      decay: 1,
      sustain: 0.6,
      release: 1.6,
      volume: 0.6,
    }),
  },
  {
    id: 'pad-strings',
    name: 'Strings',
    category: 'pad',
    blurb: '弦乐合奏感，开阔延音',
    params: p({
      osc1Waveform: 'sawtooth',
      osc1Octave: 0,
      osc1Level: 0.6,
      osc2Waveform: 'sawtooth',
      osc2Octave: -1,
      osc2Detune: 8,
      osc2Level: 0.4,
      filterType: 'lowpass',
      filterCutoff: 3000,
      filterQ: 0.7,
      filterEnvAmount: 0.2,
      attack: 0.25,
      decay: 0.4,
      sustain: 0.8,
      release: 0.8,
      volume: 0.65,
    }),
  },

  /* ---------------- Keys ---------------- */
  {
    id: 'keys-epiano',
    name: 'E-Piano',
    category: 'keys',
    blurb: 'FM 味电钢琴，敲击亮点',
    params: p({
      osc1Waveform: 'sine',
      osc1Octave: 0,
      osc1Level: 0.8,
      osc2Waveform: 'triangle',
      osc2Octave: 1,
      osc2Detune: 4,
      osc2Level: 0.3,
      filterType: 'lowpass',
      filterCutoff: 3500,
      filterQ: 1,
      filterEnvAmount: 0.35,
      attack: 0.003,
      decay: 0.35,
      sustain: 0.25,
      release: 0.4,
      volume: 0.8,
    }),
  },
  {
    id: 'keys-organ',
    name: 'Organ',
    category: 'keys',
    blurb: '叠加正弦的管风琴拉杆',
    params: p({
      osc1Waveform: 'sine',
      osc1Octave: 0,
      osc1Level: 0.7,
      osc2Waveform: 'sine',
      osc2Octave: 1,
      osc2Detune: 0,
      osc2Level: 0.5,
      filterType: 'lowpass',
      filterCutoff: 6000,
      filterQ: 0.5,
      filterEnvAmount: 0,
      attack: 0.005,
      decay: 0.05,
      sustain: 0.95,
      release: 0.08,
      volume: 0.7,
    }),
  },
  {
    id: 'keys-glass',
    name: 'Glass',
    category: 'keys',
    blurb: '玻璃质感带通钟琴音色',
    params: p({
      osc1Waveform: 'sine',
      osc1Octave: 0,
      osc1Level: 0.8,
      osc2Waveform: 'sine',
      osc2Octave: 1,
      osc2Detune: 12,
      osc2Level: 0.45,
      filterType: 'bandpass',
      filterCutoff: 2800,
      filterQ: 3,
      filterEnvAmount: 0.5,
      attack: 0.01,
      decay: 0.5,
      sustain: 0.2,
      release: 0.8,
      volume: 0.7,
    }),
  },
  {
    id: 'keys-piano',
    name: 'Clean Piano',
    category: 'keys',
    blurb: '干净的减法合成钢琴，明亮基音自然衰减',
    params: p({
      osc1Waveform: 'triangle',
      osc1Octave: 0,
      osc1Level: 0.9,
      osc2Waveform: 'sine',
      osc2Octave: 1,
      osc2Detune: 3,
      osc2Level: 0.2,
      filterType: 'lowpass',
      filterCutoff: 4500,
      filterQ: 0.6,
      filterEnvAmount: 0.12,
      attack: 0.002,
      decay: 1.8,
      sustain: 0.0,
      release: 1.4,
      volume: 0.8,
    }),
  },
];

/** 各分类试听短句（MIDI 音高 3-4 音，随预设参数发声） */
export const PRESET_PHRASES: Record<PresetCategoryId, number[]> = {
  bass: [36, 36, 39, 43], // C2 C2 Eb2 G2
  lead: [72, 74, 76, 79], // C5 D5 E5 G5
  pluck: [60, 64, 67, 72], // C4 E4 G4 C5
  pad: [48, 55, 60, 64], // C3 G3 C4 E4
  keys: [60, 64, 67, 72], // C4 E4 G4 C5
};

/** 试听短句的音长（16 分音符步数）与间隔（秒） */
export const PRESET_PHRASE_TIMING: Record<
  PresetCategoryId,
  { gap: number; lengthSteps: number }
> = {
  bass: { gap: 0.22, lengthSteps: 2 },
  lead: { gap: 0.18, lengthSteps: 2 },
  pluck: { gap: 0.16, lengthSteps: 1 },
  pad: { gap: 0.3, lengthSteps: 6 },
  keys: { gap: 0.2, lengthSteps: 3 },
};
