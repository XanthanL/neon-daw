/**
 * 抽卡生成器的数据契约
 * · StyleDef：一种命名风格的全部乐理与编曲参数
 * · ChordEvent / Motif：和声引擎与动机引擎的中间产物
 * · GeneratedInfo：抽卡结果卡展示用的摘要
 */
import type { LucideIcon } from 'lucide-react';
import type { PresetCategoryId } from '../../audio/synthPresets';
import type { DrumType, FxType } from '../../types/project';

/** 风格池：28 种命名风格 */
export type StyleId =
  | 'city-pop'
  | 'lo-fi'
  | 'synthwave'
  | 'house'
  | 'techno'
  | 'trap'
  | 'dnb'
  | 'rnb'
  | 'funk'
  | 'bossa'
  | 'afrobeat'
  | 'jazz-fusion'
  | 'rock'
  | 'punk'
  | 'reggae'
  | 'phonk'
  | 'future-bass'
  | 'ambient'
  | 'ballad'
  | 'disco'
  | 'uk-garage'
  | 'trip-hop'
  | 'gospel'
  | 'drill'
  | 'electric-blues'
  | 'country'
  | 'samba'
  | 'vaporwave';

/** 段落类型（曲式与配器增减的粒度） */
export type SectionKind =
  | 'Intro'
  | 'Verse'
  | 'PreChorus'
  | 'Chorus'
  | 'Bridge'
  | 'Outro';

/** 声部角色（决定通道 / 混音轨 / 预设分类） */
export type RoleId = 'bass' | 'lead' | 'keys' | 'pad' | 'arp';

export type CadenceKind = 'authentic' | 'plagal' | 'vamp';
export type VoicingKind = 'close' | 'drop2' | 'fourVoice' | 'spread';
export type EndTarget = 'tonic' | 'third' | 'fifth';

/** 贝斯音型（风格辨识度的主要来源之一） */
export type BassIdiom =
  | 'root8th'
  | 'pump'
  | 'subLong'
  | 'walk'
  | 'syncopated'
  | 'offbeat'
  | 'slide88'
  | 'octave';

/** 动机发展手法 */
export type MotifOp =
  | 'repeat'
  | 'sequenceUp'
  | 'sequenceDown'
  | 'invert'
  | 'augment'
  | 'diminish'
  | 'fragment'
  | 'tailSwap'
  | 'octaveShift';

/* ============================================================
 * 和声 / 旋律 / 贝斯规格
 * ============================================================ */

export interface HarmonySpec {
  /** 候选和弦进行：每条 4 个音级（0-based 音阶级数） */
  prog: readonly (readonly number[])[];
  cadence: CadenceKind;
  /** 加音概率：[7 和弦, 9 和弦, 11 和弦] */
  ext: [number, number, number];
  voicing: VoicingKind;
  /** 转位概率 */
  inversionP: number;
  /** 键盘音型：一小节内的击键格位（0 必有） */
  compRhythm: readonly number[];
  /** 每次击键的时值（步） */
  sustainSteps: number;
}

export interface MelodySpec {
  /** 音区 [最低 MIDI, 最高 MIDI] */
  register: [number, number];
  /** 每小节音符数区间 */
  perBar: [number, number];
  /** 留白概率 */
  restP: number;
  /** 允许的跳进幅度（音级） */
  leapMax: number;
  /** 切分（弱起 / 跨拍）概率 */
  syncP: number;
  /** 乐句落点 */
  endTarget: EndTarget;
}

export interface BassSpec {
  idiom: BassIdiom;
  /** 一小节内的起音格位 */
  steps: readonly number[];
  register: [number, number];
  /** 八度跳进概率 */
  octaveJumpP: number;
}

/* ============================================================
 * 编曲 / 混音规格
 * ============================================================ */

export interface RoleSpec {
  role: RoleId;
  /** 预设候选分类（16 预设 / 5 类，只挑选不新增） */
  cats: readonly PresetCategoryId[];
  octave: -2 | 0 | 1 | 2;
  register: [number, number];
  /** 该声部在哪些段落在场 */
  sections: readonly SectionKind[];
}

export interface FormSegment {
  kind: SectionKind;
  bars: 4 | 8;
  repeat: number;
}

export interface FxSpec {
  type: FxType;
  params: Record<string, number>;
}

export interface MixSpec {
  vol: Partial<Record<RoleId, number>>;
  pan: Partial<Record<RoleId, number>>;
}

export interface HumanizeSpec {
  /** 力度抖动（±） */
  velJitter: number;
  /** 非重音格丢弃概率（近似 swing / 松紧） */
  dropP: number;
}

/* ============================================================
 * 风格定义
 * ============================================================ */

export interface StyleDef {
  id: StyleId;
  /** 英文名（结果卡徽标） */
  name: string;
  /** 中文名 */
  nameZh: string;
  icon: LucideIcon;
  color: string;
  tagline: string;
  bpm: [number, number];
  /** 调式偏好（键名取自 music/theory 的 SCALES） */
  scales: readonly string[];

  harmony: HarmonySpec;
  melody: MelodySpec;
  bass: BassSpec;

  /** 每件鼓乐器的 16 分命中格（一小节内） */
  groove: Record<DrumType, readonly number[]>;
  /** 强重音格（力度加成） */
  accent: readonly number[];
  /** 句尾加花格（用 tom 填充最后两拍） */
  fill: readonly number[];
  /** 该风格实际用到的鼓乐器（其余通道留空） */
  usesDrums: readonly DrumType[];

  roles: readonly RoleSpec[];
  form: readonly FormSegment[];
  mix: MixSpec;
  fx: Partial<Record<RoleId | 'master', readonly FxSpec[]>>;
  humanize: HumanizeSpec;
}

/* ============================================================
 * 引擎中间产物
 * ============================================================ */

export type ChordQuality = 'maj' | 'min' | 'dim';

export interface ChordEvent {
  /** 根音音级（绝对音阶级数，可跨八度） */
  degree: number;
  roman: string;
  quality: ChordQuality;
  extension: 0 | 1 | 2 | 3;
  inversion: number;
  /** 和弦音音级列表（含扩展音，根音优先） */
  tones: number[];
  /** 排列后的实际音高（升序 MIDI） */
  voicing: number[];
  /** 低音轨应弹的音级集合（转位时为 voicing 最低音的音级） */
  bassPc: number;
  rootPc: number;
  /** 起始步（16 分格，段内绝对） */
  startStep: number;
  /** 占据步数 */
  lengthSteps: number;
  /** 段内击键格位（相对 startStep） */
  strikes: number[];
}

export interface MotifNote {
  /** 音级（绝对音阶级数，realize 阶段折进音区） */
  deg: number;
  /** 起始步（4 小节模板内，0..63） */
  step: number;
  /** 时值（步） */
  len: number;
  vel: number;
}

export interface Motif {
  notes: MotifNote[];
  ops: MotifOp[];
}

export interface GeneratedRole {
  role: RoleId;
  label: string;
  preset: string;
}

export interface GeneratedSection {
  name: string;
  kind: SectionKind;
  bars: number;
}

/* ============================================================
 * 可视化摘要（Random 模块的音符雨 / 和声轨数据源）
 * ============================================================ */

/** 段内一个和弦事件：步位 + 罗马数字 + 实际排列 */
export interface VizChord {
  step: number;
  roman: string;
  lengthSteps: number;
  voicing: number[];
}

/** 段内一条旋律/和声/低音音符（步位制） */
export interface VizNote {
  step: number;
  len: number;
  pitch: number;
  vel: number;
  role: RoleId;
}

/** 段内一次鼓点击 */
export interface VizDrum {
  step: number;
  kit: DrumType;
  vel: number;
}

export interface VizSection {
  name: string;
  kind: SectionKind;
  /** 全曲绝对起始小节 */
  startBar: number;
  bars: number;
  chords: VizChord[];
  notes: VizNote[];
  drums: VizDrum[];
}

/** 整曲可视化描述：段落按 Song 顺序首尾相接 */
export interface VizSong {
  bpm: number;
  totalBars: number;
  sections: VizSection[];
}

export interface GeneratedInfo {
  styleId: StyleId;
  styleName: string;
  styleNameZh: string;
  icon: LucideIcon;
  color: string;
  tagline: string;
  keyName: string;
  bpm: number;
  progression: string;
  cadenceLabel: string;
  motifLabel: string;
  roles: GeneratedRole[];
  sections: GeneratedSection[];
  bars: number;
  viz: VizSong;
}
