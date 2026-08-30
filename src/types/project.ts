/**
 * Web Music Studio 核心数据模型
 * 严格遵循 spec.md「数据模型（核心类型）」章节定义
 */

/** 合成式 808 风格鼓组音源类型 */
export type DrumType =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'closedHat'
  | 'openHat'
  | 'tom';

/** 效果器类型（≥12 种效果器库） */
export type FxType =
  | 'reverb'
  | 'feedbackDelay'
  | 'pingPongDelay'
  | 'eq3'
  | 'filter'
  | 'autoFilter'
  | 'compressor'
  | 'chorus'
  | 'phaser'
  | 'distortion'
  | 'bitCrusher'
  | 'tremolo'
  | 'limiter'
  | 'stereoWidener';

/** 合成器波形 */
export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

/** 滤波器类型 */
export type FilterType = 'lowpass' | 'highpass' | 'bandpass' | 'notch';

/** 合成器参数（双振荡器 + 滤波器 + ADSR） */
export interface SynthParams {
  /* 振荡器 1 */
  osc1Waveform: Waveform;
  osc1Octave: number; // -2 ~ 2
  osc1Level: number; // 0 ~ 1
  /* 振荡器 2 */
  osc2Waveform: Waveform;
  osc2Octave: number; // -2 ~ 2
  osc2Detune: number; // cents，失谐
  osc2Level: number; // 0 ~ 1
  /* 滤波器 */
  filterType: FilterType;
  filterCutoff: number; // Hz
  filterQ: number; // 共鸣
  filterEnvAmount: number; // 滤波包络量 0 ~ 1
  /* ADSR 包络（秒） */
  attack: number;
  decay: number;
  sustain: number; // 0 ~ 1
  release: number;
  /* 输出 */
  volume: number; // 0 ~ 1
}

/** 钢琴卷帘音符 */
export interface Note {
  id: string;
  channelId: string;
  pitch: number; // MIDI 音高 0-127
  startStep: number; // 起始步（16 分音符网格）
  lengthSteps: number; // 时值（步数）
  velocity: number; // 0-127
}

/** 步进音序器单步数据 */
export interface StepData {
  on: boolean;
  velocity: number; // 0-127
}

/** Pattern（模式）：步进 + 音符的容器 */
export interface Pattern {
  id: string;
  name: string;
  bars: 1 | 2 | 4 | 8; // 步数 = bars × 16
  steps: Record<string, StepData[]>; // key = channelId
  notes: Note[];
}

/** 鼓通道调音参数（tune：半音移位；decay：衰减秒数；缺省用各鼓声部默认值） */
export interface DrumTuneParams {
  tune?: number;
  decay?: number;
}

/** 乐器通道（含鼓组与合成器） */
export interface Channel {
  id: string;
  name: string;
  kind: 'drum' | 'synth';
  color: string; // 通道功能色（荧光家族 8 色）
  synthParams?: SynthParams; // kind === 'synth' 时存在（合成回退 / 编辑源）
  /** kind === 'synth' 时可选：采样乐器名（public/samples 文件夹），优先于合成器发声 */
  sampleInstrument?: string;
  drumType?: DrumType; // kind === 'drum' 时存在
  drumParams?: DrumTuneParams; // kind === 'drum' 时的音高/衰减调音
  mixerTrackId: string;
}

/** 混音轨效果器实例 */
export interface FxInstance {
  id: string;
  type: FxType;
  params: Record<string, number>;
  bypass: boolean;
}

/** 混音轨（与 channels 一一对应 + master） */
export interface MixerTrack {
  id: string;
  name: string;
  volume: number; // 0 ~ 1
  pan: number; // -1 ~ 1
  mute: boolean;
  solo: boolean;
  effects: FxInstance[];
}

/** Song 编曲片段（clip） */
export interface SongClip {
  id: string;
  patternId: string;
  startBar: number;
}

/** 编排轨道 */
export interface SongTrack {
  id: string;
  clips: SongClip[];
}

/** Song 编曲 */
export interface SongArrangement {
  tracks: SongTrack[];
}

/** 工程（根模型） */
export interface Project {
  bpm: number; // 60 ~ 200
  currentPatternId: string;
  patterns: Pattern[];
  channels: Channel[];
  mixerTracks: MixerTrack[];
  song: SongArrangement;
}
