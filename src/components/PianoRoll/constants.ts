/**
 * Piano Roll 网格常量与工具
 * 16 分音符 = 1 步；4/4 拍每小节 16 步
 */

/** 音高范围 C2 - C7 */
export const PITCH_MIN = 36; // C2
export const PITCH_MAX = 96; // C7
export const ROW_COUNT = PITCH_MAX - PITCH_MIN + 1; // 61 行

export const ROW_H = 18; // 音高行高 px
export const KEY_W = 56; // 键盘列宽 px
export const RULER_H = 28; // 小节标尺高 px
export const VEL_H = 72; // 力度编辑条高 px

/** 最短时值 = 1/32（半步） */
export const MIN_LEN = 0.5;

export const SNAP_OPTIONS = ['1/4', '1/8', '1/16', '1/32', '1/8T'] as const;
export type SnapOption = (typeof SNAP_OPTIONS)[number];

/** 吸附档位 → 步数（1/8T：三连八分 = 4/3 步） */
export const SNAP_STEPS: Record<SnapOption, number> = {
  '1/4': 4,
  '1/8': 2,
  '1/16': 1,
  '1/32': 0.5,
  '1/8T': 4 / 3,
};

const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const isBlackKey = (midi: number) =>
  [1, 3, 6, 8, 10].includes(midi % 12);

export const midiToName = (midi: number) =>
  `${PC_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

/** Piano Roll 需要的通道信息 */
export interface ChannelInfo {
  color: string;
  kind: 'drum' | 'synth';
}
