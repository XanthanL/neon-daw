/**
 * 风格池：20 种命名风格（一次抽卡抽中一种）
 *
 * 采用「BASE 默认值 + 局部覆盖」压缩数据量；每种风格至少与邻居在
 * bpm / 调式 / 扩展音密度 / 鼓格 / 贝斯音型 / 曲式 中的三项以上不同。
 * 约束：鼓只用 6 件已实现音色，预设只从 5 类 16 个里挑，效果器参数 key 对齐 FX_DEFAULT_PARAMS。
 */
import {
  Blend,
  Building2,
  CarFront,
  CloudFog,
  Coffee,
  Cpu,
  Disc3,
  Gauge,
  Guitar,
  Heart,
  House,
  Leaf,
  Martini,
  Piano,
  Skull,
  Sparkles,
  Sprout,
  Sunrise,
  TreePalm,
  Waves,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PresetCategoryId } from '../../audio/synthPresets';
import type { DrumType, FxType } from '../../types/project';
import type { Rng } from './rng';
import type {
  BassSpec,
  FormSegment,
  FxSpec,
  HarmonySpec,
  HumanizeSpec,
  MelodySpec,
  MixSpec,
  RoleId,
  RoleSpec,
  SectionKind,
  StyleDef,
  StyleId,
} from './types';

/* ---------------- 小工具 ---------------- */

const QUARTERS = [0, 4, 8, 12];
const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];
const OFFBEATS = [2, 6, 10, 14];
const SIXTEENTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const EIGHTH_GRID = EIGHTHS;

const ALL_SEC: readonly SectionKind[] = [
  'Intro',
  'Verse',
  'PreChorus',
  'Chorus',
  'Bridge',
  'Outro',
];
const BODY: readonly SectionKind[] = ['Verse', 'PreChorus', 'Chorus', 'Bridge'];
const FULL: readonly SectionKind[] = ['Verse', 'PreChorus', 'Chorus', 'Bridge', 'Outro'];
const PEAK: readonly SectionKind[] = ['PreChorus', 'Chorus'];

const r = (
  role: RoleId,
  cats: readonly PresetCategoryId[],
  register: [number, number],
  sections: readonly SectionKind[],
  octave: -2 | 0 | 1 | 2 = 0,
): RoleSpec => ({ role, cats, register, sections, octave });

const f = (kind: SectionKind, bars: 4 | 8, repeat = 1): FormSegment => ({ kind, bars, repeat });

const F = (type: FxType, params: Record<string, number>): FxSpec => ({ type, params });

const rev = (decay: number, wet: number) =>
  F('reverb', { decay, preDelay: 0.02, wet });
const dly = (time: number, feedback: number, wet: number) =>
  F('pingPongDelay', { delayTime: time, feedback, wet });

/* ---------------- 默认骨架 ---------------- */

const BASS_ROLE = r('bass', ['bass'], [29, 43], ALL_SEC);

const BASE: StyleDef = {
  id: 'city-pop',
  name: 'City Pop',
  nameZh: '都市流行',
  icon: Building2,
  color: '#FFE600',
  tagline: '明亮大调 · 七九和弦 · 切分贝斯',
  bpm: [104, 118],
  scales: ['major', 'lydian', 'mixolydian'],
  harmony: {
    prog: [
      [0, 4, 5, 3],
      [0, 5, 3, 4],
      [3, 4, 0, 5],
      [5, 3, 4, 0],
    ],
    cadence: 'authentic',
    ext: [0.35, 0.15, 0],
    voicing: 'close',
    inversionP: 0.25,
    compRhythm: [0, 8],
    sustainSteps: 7,
  },
  melody: {
    register: [64, 86],
    perBar: [3, 6],
    restP: 0.16,
    leapMax: 3,
    syncP: 0.2,
    endTarget: 'tonic',
  },
  bass: {
    idiom: 'root8th',
    steps: EIGHTH_GRID,
    register: [29, 43],
    octaveJumpP: 0.18,
  },
  groove: {
    kick: [0, 8, 11],
    snare: [4, 12],
    clap: [],
    closedHat: EIGHTHS,
    openHat: [14],
    tom: [],
  },
  accent: [0, 4, 8, 12],
  fill: [12, 13, 14, 15],
  usesDrums: ['kick', 'snare', 'closedHat', 'openHat', 'tom'],
  roles: [
    BASS_ROLE,
    r('lead', ['lead', 'keys'], [64, 86], BODY),
    r('keys', ['keys', 'pluck'], [52, 72], ALL_SEC),
    r('pad', ['pad'], [48, 67], ['Chorus', 'Outro']),
  ],
  form: [f('Intro', 4), f('Verse', 8), f('Chorus', 8, 2), f('Outro', 4)],
  mix: {
    vol: { bass: 0.8, lead: 0.72, keys: 0.55, pad: 0.42, arp: 0.4 },
    pan: { lead: 0.12, keys: -0.18, pad: 0, arp: 0.22 },
  },
  fx: {
    lead: [rev(2.2, 0.26)],
    keys: [rev(1.7, 0.2)],
    pad: [F('chorus', { frequency: 0.7, delayTime: 0.006, depth: 0.5, wet: 0.35 })],
    master: [F('limiter', { threshold: -1 })],
  },
  humanize: { velJitter: 6, dropP: 0.1 },
};

type Override = {
  bpm?: [number, number];
  scales?: readonly string[];
  harmony?: Partial<HarmonySpec>;
  melody?: Partial<MelodySpec>;
  bass?: Partial<BassSpec>;
  groove?: Partial<Record<DrumType, readonly number[]>>;
  accent?: readonly number[];
  fill?: readonly number[];
  usesDrums?: readonly DrumType[];
  roles?: readonly RoleSpec[];
  form?: readonly FormSegment[];
  mix?: Partial<MixSpec>;
  fx?: Partial<Record<RoleId | 'master', readonly FxSpec[]>>;
  humanize?: Partial<HumanizeSpec>;
};

const mk = (
  id: StyleId,
  name: string,
  nameZh: string,
  icon: LucideIcon,
  color: string,
  tagline: string,
  o: Override,
): StyleDef => ({
  ...BASE,
  id,
  name,
  nameZh,
  icon,
  color,
  tagline,
  bpm: o.bpm ?? BASE.bpm,
  scales: o.scales ?? BASE.scales,
  accent: o.accent ?? BASE.accent,
  fill: o.fill ?? BASE.fill,
  usesDrums: o.usesDrums ?? BASE.usesDrums,
  roles: o.roles ?? BASE.roles,
  form: o.form ?? BASE.form,
  harmony: { ...BASE.harmony, ...o.harmony },
  melody: { ...BASE.melody, ...o.melody },
  bass: { ...BASE.bass, ...o.bass },
  groove: { ...BASE.groove, ...o.groove },
  humanize: { ...BASE.humanize, ...o.humanize },
  mix: {
    vol: { ...BASE.mix.vol, ...o.mix?.vol },
    pan: { ...BASE.mix.pan, ...o.mix?.pan },
  },
  fx: { ...BASE.fx, ...o.fx },
});

/* ============================================================
 * 20 种风格
 * ============================================================ */

export const STYLES: readonly StyleDef[] = [
  mk(
    'city-pop',
    'City Pop',
    '都市流行',
    Building2,
    '#FFE600',
    '明亮大调 · 七九和弦 · 切分贝斯',
    {
      bpm: [106, 118],
      scales: ['major', 'lydian', 'mixolydian'],
      harmony: {
        ext: [0.4, 0.32, 0.08],
        voicing: 'drop2',
        inversionP: 0.45,
        compRhythm: [0, 6, 10, 14],
        sustainSteps: 3,
      },
      melody: { register: [62, 84], perBar: [3, 6], syncP: 0.35, leapMax: 4, endTarget: 'third' },
      bass: { idiom: 'syncopated', steps: [0, 3, 6, 8, 11, 14], register: [29, 43], octaveJumpP: 0.28 },
      groove: {
        kick: [0, 10, 11],
        snare: [4, 12],
        clap: [7],
        closedHat: SIXTEENTHS,
        openHat: [2, 6, 10, 14],
        tom: [13],
      },
      accent: [0, 6, 10],
      usesDrums: ['kick', 'snare', 'clap', 'closedHat', 'openHat', 'tom'],
      roles: [
        BASS_ROLE,
        r('lead', ['lead', 'pluck'], [62, 84], BODY),
        r('keys', ['keys', 'pluck'], [52, 74], ALL_SEC),
        r('pad', ['pad', 'keys'], [50, 69], ['Chorus', 'Bridge', 'Outro']),
        r('arp', ['pluck'], [72, 88], PEAK, 1),
      ],
      form: [f('Intro', 4), f('Verse', 8), f('PreChorus', 4), f('Chorus', 8, 2), f('Bridge', 4), f('Outro', 4)],
      fx: {
        lead: [rev(2.4, 0.28), dly(0.28, 0.28, 0.2)],
        keys: [rev(1.8, 0.22), F('chorus', { frequency: 0.9, delayTime: 0.005, depth: 0.45, wet: 0.25 })],
        pad: [rev(3.2, 0.4)],
        arp: [dly(0.19, 0.34, 0.28)],
        bass: [F('compressor', { threshold: -22, knee: 10, ratio: 4, attack: 0.004, release: 0.12 })],
      },
      humanize: { velJitter: 8, dropP: 0.14 },
    },
  ),

  mk('lo-fi', 'Lo-Fi HipHop', '低保真嘻哈', Coffee, '#A78BFA', '慵懒拖拍 · 七九和弦 · 磁带噪声感', {
    bpm: [72, 84],
    scales: ['minorPent', 'dorian', 'major'],
    harmony: {
      prog: [
        [0, 5, 3, 4],
        [1, 4, 0, 5],
        [0, 3, 4, 5],
      ],
      cadence: 'vamp',
      ext: [0.55, 0.3, 0.1],
      voicing: 'fourVoice',
      inversionP: 0.4,
      compRhythm: [0, 10],
      sustainSteps: 10,
    },
    melody: { register: [60, 79], perBar: [1, 3], restP: 0.42, leapMax: 2, syncP: 0.22, endTarget: 'third' },
    bass: { idiom: 'syncopated', steps: [0, 6, 10], register: [28, 40], octaveJumpP: 0.1 },
    groove: {
      kick: [0, 10],
      snare: [4, 12],
      clap: [],
      closedHat: EIGHTHS,
      openHat: [],
      tom: [14, 15],
    },
    accent: [0, 10],
    usesDrums: ['kick', 'snare', 'closedHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['keys', 'pluck'], [52, 72], ALL_SEC),
      r('lead', ['pluck', 'keys'], [60, 79], ['Verse', 'Chorus', 'Bridge']),
      r('pad', ['pad'], [48, 67], ['Intro', 'Chorus', 'Outro']),
    ],
    form: [f('Intro', 4), f('Verse', 8, 2), f('Chorus', 8), f('Outro', 4)],
    fx: {
      keys: [F('bitCrusher', { bits: 5, wet: 0.24 }), rev(2.6, 0.34)],
      lead: [rev(3, 0.36)],
      pad: [F('chorus', { frequency: 0.5, delayTime: 0.008, depth: 0.6, wet: 0.4 })],
    },
    humanize: { velJitter: 11, dropP: 0.32 },
  }),

  mk('synthwave', 'Synthwave', '复古合成器浪', Sunrise, '#FF5CA8', '小调四踩 · 八度贝斯 · 大混响主音', {
    bpm: [96, 110],
    scales: ['minor', 'dorian', 'phrygian'],
    harmony: {
      prog: [
        [0, 5, 2, 6],
        [0, 6, 3, 4],
        [5, 2, 6, 3],
      ],
      cadence: 'vamp',
      ext: [0.25, 0.1, 0],
      voicing: 'close',
      inversionP: 0.15,
      compRhythm: QUARTERS,
      sustainSteps: 3,
    },
    melody: { register: [64, 88], perBar: [2, 5], restP: 0.22, leapMax: 4, syncP: 0.12, endTarget: 'tonic' },
    bass: { idiom: 'octave', steps: EIGHTHS, register: [28, 40], octaveJumpP: 0.9 },
    groove: {
      kick: QUARTERS,
      snare: [],
      clap: [4, 12],
      closedHat: EIGHTHS,
      openHat: [14],
      tom: [7],
    },
    accent: QUARTERS,
    usesDrums: ['kick', 'clap', 'closedHat', 'openHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('lead', ['lead'], [64, 88], BODY),
      r('keys', ['keys', 'lead'], [52, 72], ALL_SEC),
      r('arp', ['pluck', 'lead'], [72, 91], FULL, 1),
      r('pad', ['pad'], [48, 66], ['Intro', 'Chorus', 'Outro']),
    ],
    form: [f('Intro', 8), f('Verse', 8), f('Chorus', 8, 2), f('Bridge', 4), f('Outro', 4)],
    fx: {
      lead: [rev(3.4, 0.4), dly(0.32, 0.42, 0.32)],
      keys: [rev(2.2, 0.26)],
      arp: [dly(0.145, 0.5, 0.36)],
      pad: [F('stereoWidener', { width: 0.85 }), rev(3.6, 0.42)],
      bass: [F('compressor', { threshold: -20, knee: 8, ratio: 5, attack: 0.003, release: 0.1 })],
    },
    humanize: { velJitter: 3, dropP: 0.03 },
  }),

  mk('house', 'House', '浩室', House, '#00E5FF', '四踩底鼓 · 反拍开镲 · 反拍和弦刺', {
    bpm: [122, 128],
    scales: ['minor', 'dorian', 'majorPent'],
    harmony: {
      prog: [
        [0, 5, 3, 4],
        [0, 3, 5, 4],
        [5, 4, 0, 3],
      ],
      cadence: 'vamp',
      ext: [0.4, 0.22, 0.02],
      voicing: 'spread',
      inversionP: 0.2,
      compRhythm: OFFBEATS,
      sustainSteps: 2,
    },
    melody: { register: [62, 85], perBar: [2, 5], restP: 0.26, leapMax: 3, syncP: 0.18, endTarget: 'tonic' },
    bass: { idiom: 'offbeat', steps: OFFBEATS, register: [29, 41], octaveJumpP: 0.12 },
    groove: {
      kick: QUARTERS,
      snare: [],
      clap: [4, 12],
      closedHat: SIXTEENTHS,
      openHat: OFFBEATS,
      tom: [],
    },
    accent: OFFBEATS,
    usesDrums: ['kick', 'clap', 'closedHat', 'openHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['pluck', 'keys'], [52, 74], ALL_SEC),
      r('lead', ['lead', 'pluck'], [62, 85], ['Verse', 'Chorus', 'Bridge']),
      r('arp', ['pluck', 'lead'], [70, 90], PEAK, 1),
      r('pad', ['pad'], [50, 68], ['Intro', 'Chorus', 'Outro']),
    ],
    form: [f('Intro', 8), f('Verse', 8), f('PreChorus', 4), f('Chorus', 8, 2), f('Outro', 4)],
    fx: {
      keys: [rev(1.6, 0.2)],
      lead: [rev(2.6, 0.3), dly(0.25, 0.3, 0.24)],
      pad: [F('stereoWidener', { width: 0.8 })],
      bass: [F('compressor', { threshold: -18, knee: 6, ratio: 6, attack: 0.002, release: 0.08 })],
      master: [F('compressor', { threshold: -14, knee: 6, ratio: 2.5, attack: 0.004, release: 0.12 }), F('limiter', { threshold: -1 })],
    },
    humanize: { velJitter: 4, dropP: 0.08 },
  }),

  mk('techno', 'Techno', '极简工业电子', Cpu, '#4D9FFF', '高速十六分 · 循环 vamp · 冷峻无调性旋律', {
    bpm: [128, 140],
    scales: ['minor', 'phrygian', 'harmonicMinor'],
    harmony: {
      prog: [
        [0, 0, 5, 6],
        [0, 6, 0, 5],
        [0, 3, 0, 4],
      ],
      cadence: 'vamp',
      ext: [0.12, 0.04, 0],
      voicing: 'close',
      inversionP: 0.1,
      compRhythm: [0, 6, 8],
      sustainSteps: 2,
    },
    melody: { register: [60, 82], perBar: [1, 3], restP: 0.45, leapMax: 5, syncP: 0.3, endTarget: 'fifth' },
    bass: { idiom: 'pump', steps: SIXTEENTHS.filter((s) => s % 2 === 0), register: [24, 36], octaveJumpP: 0.3 },
    groove: {
      kick: QUARTERS,
      snare: [],
      clap: [4, 12],
      closedHat: [1, 3, 5, 7, 9, 11, 13, 15],
      openHat: [2, 6, 10, 14],
      tom: [3, 7, 11, 15],
    },
    accent: [0, 6, 10],
    fill: [12, 13, 14, 15],
    usesDrums: ['kick', 'clap', 'closedHat', 'openHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['pluck', 'lead'], [52, 72], FULL),
      r('lead', ['lead'], [60, 82], ['Chorus', 'Bridge']),
      r('arp', ['pluck'], [68, 88], ['PreChorus', 'Chorus'], 1),
    ],
    form: [f('Intro', 8), f('Verse', 8), f('PreChorus', 4), f('Chorus', 8, 2)],
    fx: {
      keys: [F('distortion', { distortion: 0.22, wet: 0.18 }), rev(1.4, 0.18)],
      lead: [dly(0.1875, 0.46, 0.34)],
      arp: [dly(0.125, 0.55, 0.4)],
      master: [F('limiter', { threshold: -2 })],
    },
    humanize: { velJitter: 3, dropP: 0.05 },
  }),

  mk('trap', 'Trap', '陷阱说唱', Skull, '#FF9F1C', '半拍军鼓 · 十六分镲群 · 低音 808', {
    bpm: [138, 150],
    scales: ['minorPent', 'phrygian', 'minor'],
    harmony: {
      prog: [
        [0, 0, 5, 4],
        [0, 5, 0, 4],
        [0, 3, 0, 6],
      ],
      cadence: 'vamp',
      ext: [0.2, 0.08, 0],
      voicing: 'close',
      inversionP: 0.1,
      compRhythm: [0],
      sustainSteps: 14,
    },
    melody: { register: [59, 80], perBar: [2, 5], restP: 0.2, leapMax: 3, syncP: 0.45, endTarget: 'tonic' },
    bass: { idiom: 'slide88', steps: [0, 2, 4, 6, 8, 10, 12, 14], register: [24, 36], octaveJumpP: 0.05 },
    groove: {
      kick: [0, 7, 11],
      snare: [8],
      clap: [8],
      closedHat: SIXTEENTHS,
      openHat: [],
      tom: [10, 11, 12],
    },
    accent: [0, 8, 11],
    fill: [12, 13, 14, 15],
    usesDrums: ['kick', 'snare', 'clap', 'closedHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['keys', 'pad'], [52, 70], ALL_SEC),
      r('lead', ['lead', 'pluck'], [59, 80], ['Verse', 'Chorus', 'Bridge']),
      r('arp', ['pluck'], [70, 86], ['Chorus'], 1),
    ],
    form: [f('Intro', 4), f('Verse', 8), f('Chorus', 8, 2), f('Bridge', 4), f('Outro', 4)],
    fx: {
      keys: [rev(2.8, 0.3)],
      lead: [rev(1.8, 0.22), F('tremolo', { frequency: 5.5, depth: 0.35 })],
      bass: [F('distortion', { distortion: 0.18, wet: 0.14 })],
      master: [F('compressor', { threshold: -13, knee: 8, ratio: 3, attack: 0.005, release: 0.14 }), F('limiter', { threshold: -1 })],
    },
    humanize: { velJitter: 9, dropP: 0.22 },
  }),

  mk('dnb', 'Drum & Bass', '鼓打贝斯', Gauge, '#39FF88', '170 BPM 切分鼓 · 长音 sub · 稀疏和声', {
    bpm: [168, 176],
    scales: ['minor', 'dorian', 'harmonicMinor'],
    harmony: {
      prog: [
        [0, 5, 3, 4],
        [5, 4, 0, 3],
        [0, 2, 5, 4],
      ],
      cadence: 'authentic',
      ext: [0.35, 0.2, 0.05],
      voicing: 'fourVoice',
      inversionP: 0.35,
      compRhythm: [0],
      sustainSteps: 16,
    },
    melody: { register: [62, 84], perBar: [2, 4], restP: 0.34, leapMax: 4, syncP: 0.28, endTarget: 'third' },
    bass: { idiom: 'subLong', steps: [0, 8], register: [24, 36], octaveJumpP: 0.05 },
    groove: {
      kick: [0, 10],
      snare: [4, 12],
      clap: [],
      closedHat: [2, 6, 10, 14],
      openHat: [14],
      tom: [13, 15],
    },
    accent: [0, 4, 10, 12],
    fill: [11, 12, 13, 14, 15],
    usesDrums: ['kick', 'snare', 'closedHat', 'openHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('pad', ['pad'], [48, 67], ALL_SEC),
      r('lead', ['lead', 'pluck'], [62, 84], BODY),
      r('keys', ['keys', 'pluck'], [55, 74], ['Chorus', 'Bridge', 'Outro']),
    ],
    form: [f('Intro', 8), f('Verse', 8), f('Chorus', 8, 2), f('Outro', 4)],
    fx: {
      pad: [rev(4, 0.46), F('stereoWidener', { width: 0.9 })],
      lead: [dly(0.22, 0.36, 0.28), rev(2.4, 0.28)],
      keys: [rev(2.8, 0.32)],
      bass: [F('compressor', { threshold: -16, knee: 6, ratio: 6, attack: 0.002, release: 0.09 })],
    },
    humanize: { velJitter: 5, dropP: 0.1 },
  }),

  mk('rnb', 'R&B', '节奏蓝调', Heart, '#FF5CA8', '九和弦十一和弦 · 四声部平滑 · 留白旋律', {
    bpm: [84, 96],
    scales: ['minor', 'dorian', 'major'],
    harmony: {
      prog: [
        [1, 4, 0, 5],
        [0, 3, 4, 5],
        [5, 1, 4, 0],
      ],
      cadence: 'authentic',
      ext: [0.55, 0.35, 0.14],
      voicing: 'drop2',
      inversionP: 0.6,
      compRhythm: [0, 6, 14],
      sustainSteps: 6,
    },
    melody: { register: [62, 83], perBar: [2, 5], restP: 0.3, leapMax: 4, syncP: 0.42, endTarget: 'third' },
    bass: { idiom: 'syncopated', steps: [0, 3, 8, 11, 14], register: [29, 44], octaveJumpP: 0.3 },
    groove: {
      kick: [0, 10, 14],
      snare: [4, 12],
      clap: [12],
      closedHat: SIXTEENTHS,
      openHat: [],
      tom: [7],
    },
    accent: [0, 4, 10, 12],
    usesDrums: ['kick', 'snare', 'clap', 'closedHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['keys', 'pluck'], [52, 74], ALL_SEC),
      r('lead', ['lead', 'keys'], [62, 83], BODY),
      r('pad', ['pad', 'keys'], [50, 69], ['Chorus', 'Bridge', 'Outro']),
    ],
    form: [f('Intro', 4), f('Verse', 8), f('PreChorus', 4), f('Chorus', 8, 2), f('Outro', 4)],
    fx: {
      keys: [rev(2.2, 0.26), F('chorus', { frequency: 0.8, delayTime: 0.005, depth: 0.4, wet: 0.22 })],
      lead: [rev(3, 0.34), dly(0.375, 0.3, 0.22)],
      pad: [rev(3.6, 0.42)],
    },
    humanize: { velJitter: 8, dropP: 0.18 },
  }),

  mk('funk', 'Funk', '放克', Blend, '#FFE600', '十六分切分 · 哇音自动滤波 · 密集 slap 贝斯', {
    bpm: [100, 112],
    scales: ['mixolydian', 'dorian', 'minorPent'],
    harmony: {
      prog: [
        [0, 0, 3, 4],
        [0, 5, 0, 4],
        [3, 3, 0, 0],
      ],
      cadence: 'vamp',
      ext: [0.45, 0.28, 0.06],
      voicing: 'spread',
      inversionP: 0.3,
      compRhythm: [0, 3, 6, 10, 13],
      sustainSteps: 2,
    },
    melody: { register: [60, 82], perBar: [3, 7], restP: 0.12, leapMax: 4, syncP: 0.5, endTarget: 'fifth' },
    bass: { idiom: 'syncopated', steps: [0, 2, 3, 6, 8, 10, 13, 14], register: [28, 42], octaveJumpP: 0.4 },
    groove: {
      kick: [0, 7, 10],
      snare: [4, 12],
      clap: [12],
      closedHat: SIXTEENTHS,
      openHat: [14],
      tom: [6, 9],
    },
    accent: [0, 6, 7, 10, 14],
    usesDrums: ['kick', 'snare', 'clap', 'closedHat', 'openHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['pluck', 'keys'], [52, 74], ALL_SEC),
      r('lead', ['lead', 'pluck'], [60, 82], BODY),
      r('arp', ['pluck'], [70, 88], ['Chorus', 'Bridge'], 1),
    ],
    form: [f('Intro', 4), f('Verse', 8), f('Chorus', 8, 2), f('Bridge', 4), f('Outro', 4)],
    fx: {
      keys: [F('autoFilter', { frequency: 1.6, depth: 0.7, baseFrequency: 420, octaves: 3, wet: 0.6 })],
      lead: [F('autoFilter', { frequency: 1.2, depth: 0.6, baseFrequency: 520, octaves: 2.5, wet: 0.5 })],
      bass: [F('compressor', { threshold: -18, knee: 5, ratio: 6, attack: 0.002, release: 0.08 })],
      arp: [dly(0.16, 0.32, 0.26)],
    },
    humanize: { velJitter: 10, dropP: 0.2 },
  }),

  mk('bossa', 'Bossa Nova', '巴萨诺瓦', TreePalm, '#39FF88', 'Clave 击键 · 大七九和弦 · 行走低音', {
    bpm: [126, 146],
    scales: ['major', 'lydian', 'majorPent'],
    harmony: {
      prog: [
        [0, 4, 0, 3],
        [0, 1, 4, 0],
        [2, 5, 1, 4],
      ],
      cadence: 'authentic',
      ext: [0.6, 0.28, 0.06],
      voicing: 'fourVoice',
      inversionP: 0.5,
      compRhythm: [0, 6, 10],
      sustainSteps: 4,
    },
    melody: { register: [62, 81], perBar: [2, 5], restP: 0.28, leapMax: 3, syncP: 0.4, endTarget: 'third' },
    bass: { idiom: 'walk', steps: QUARTERS, register: [28, 43], octaveJumpP: 0.05 },
    groove: {
      kick: [0, 10],
      snare: [3, 6, 10, 13],
      clap: [],
      closedHat: SIXTEENTHS,
      openHat: [],
      tom: [8],
    },
    accent: [0, 6, 10],
    usesDrums: ['kick', 'snare', 'closedHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['keys', 'pluck'], [52, 74], ALL_SEC),
      r('lead', ['pluck', 'keys'], [62, 81], BODY),
      r('pad', ['pad'], [50, 68], ['Intro', 'Outro']),
    ],
    form: [f('Intro', 4), f('Verse', 8), f('Chorus', 8, 2), f('Outro', 4)],
    fx: {
      keys: [rev(2, 0.22)],
      lead: [rev(2.4, 0.26)],
      pad: [rev(3.4, 0.36)],
      master: [F('eq3', { low: -2, mid: 1, high: 2, lowFrequency: 320, highFrequency: 3200 }), F('limiter', { threshold: -1 })],
    },
    humanize: { velJitter: 7, dropP: 0.16 },
  }),

  mk('afrobeat', 'Afrobeat', '非洲节拍', Sprout, '#FF9F1C', '交错铃律 · 五声马林巴 · 密集通鼓', {
    bpm: [100, 114],
    scales: ['majorPent', 'mixolydian', 'major'],
    harmony: {
      prog: [
        [0, 3, 4, 3],
        [0, 4, 3, 4],
        [3, 0, 4, 0],
      ],
      cadence: 'vamp',
      ext: [0.3, 0.2, 0.02],
      voicing: 'spread',
      inversionP: 0.2,
      compRhythm: [0, 3, 6, 11, 14],
      sustainSteps: 2,
    },
    melody: { register: [64, 88], perBar: [3, 7], restP: 0.14, leapMax: 4, syncP: 0.46, endTarget: 'tonic' },
    bass: { idiom: 'octave', steps: [0, 3, 6, 8, 11, 14], register: [29, 43], octaveJumpP: 0.5 },
    groove: {
      kick: [0, 6, 10],
      snare: [4, 12],
      clap: OFFBEATS,
      closedHat: SIXTEENTHS,
      openHat: [7, 15],
      tom: [3, 5, 11, 14],
    },
    accent: [0, 6, 10, 11],
    usesDrums: ['kick', 'snare', 'clap', 'closedHat', 'openHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('lead', ['pluck', 'keys'], [64, 88], ALL_SEC),
      r('keys', ['keys', 'pluck'], [52, 72], FULL),
      r('arp', ['pluck'], [72, 91], ['Chorus', 'Bridge'], 1),
      r('pad', ['pad'], [50, 68], ['Intro', 'Outro']),
    ],
    form: [f('Intro', 4), f('Verse', 8), f('Chorus', 8, 2), f('Bridge', 4)],
    fx: {
      lead: [rev(1.8, 0.2)],
      keys: [F('phaser', { frequency: 0.6, octaves: 2.5, wet: 0.3 })],
      arp: [dly(0.1875, 0.4, 0.3)],
      pad: [rev(3, 0.38)],
    },
    humanize: { velJitter: 10, dropP: 0.24 },
  }),

  mk('jazz-fusion', 'Jazz Fusion', '爵士融合', Martini, '#A78BFA', '多利亚九十一 · drop2 排列 · 行走低音', {
    bpm: [110, 128],
    scales: ['dorian', 'mixolydian', 'minor', 'lydian'],
    harmony: {
      prog: [
        [1, 4, 0, 5],
        [2, 5, 1, 4],
        [0, 1, 4, 0],
      ],
      cadence: 'authentic',
      ext: [0.6, 0.34, 0.16],
      voicing: 'drop2',
      inversionP: 0.7,
      compRhythm: [3, 10, 14],
      sustainSteps: 3,
    },
    melody: { register: [62, 88], perBar: [4, 8], restP: 0.1, leapMax: 5, syncP: 0.55, endTarget: 'third' },
    bass: { idiom: 'walk', steps: QUARTERS, register: [28, 43], octaveJumpP: 0.1 },
    groove: {
      kick: [0, 10],
      snare: [6, 10, 14],
      clap: [],
      closedHat: [4, 12],
      openHat: [],
      tom: [],
    },
    accent: [4, 12],
    fill: [13, 14, 15],
    usesDrums: ['kick', 'snare', 'closedHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['keys', 'pluck'], [52, 76], ALL_SEC),
      r('lead', ['lead', 'pluck'], [62, 88], BODY),
      r('pad', ['pad', 'keys'], [50, 68], ['Bridge', 'Outro']),
    ],
    form: [f('Intro', 4), f('Verse', 8), f('Chorus', 8), f('Bridge', 8), f('Outro', 4)],
    fx: {
      keys: [rev(2.2, 0.24)],
      lead: [rev(2.6, 0.28)],
      pad: [F('chorus', { frequency: 0.6, delayTime: 0.007, depth: 0.5, wet: 0.34 })],
      master: [F('eq3', { low: -1, mid: 2, high: 1, lowFrequency: 260, highFrequency: 3600 }), F('limiter', { threshold: -1 })],
    },
    humanize: { velJitter: 12, dropP: 0.26 },
  }),

  mk('rock', 'Rock', '摇滚', Guitar, '#FF3DBE', '强力和弦八分 · 直白大调 · 粗粝主音', {
    bpm: [112, 132],
    scales: ['mixolydian', 'minorPent', 'major'],
    harmony: {
      prog: [
        [0, 3, 4, 3],
        [0, 6, 3, 4],
        [5, 3, 0, 4],
      ],
      cadence: 'authentic',
      ext: [0.14, 0.04, 0],
      voicing: 'close',
      inversionP: 0.05,
      compRhythm: EIGHTHS,
      sustainSteps: 2,
    },
    melody: { register: [60, 82], perBar: [3, 6], restP: 0.14, leapMax: 4, syncP: 0.2, endTarget: 'tonic' },
    bass: { idiom: 'root8th', steps: EIGHTHS, register: [28, 41], octaveJumpP: 0.1 },
    groove: {
      kick: [0, 8, 10],
      snare: [4, 12],
      clap: [],
      closedHat: EIGHTHS,
      openHat: [14],
      tom: [15],
    },
    accent: QUARTERS,
    fill: [12, 13, 14, 15],
    usesDrums: ['kick', 'snare', 'closedHat', 'openHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('lead', ['lead'], [60, 82], ALL_SEC),
      r('keys', ['pluck', 'keys'], [52, 72], ['Chorus', 'Bridge', 'Outro']),
      r('pad', ['pad'], [48, 66], ['Chorus']),
    ],
    form: [f('Intro', 4), f('Verse', 8), f('PreChorus', 4), f('Chorus', 8, 2), f('Outro', 4)],
    fx: {
      lead: [F('distortion', { distortion: 0.34, wet: 0.3 }), rev(1.6, 0.18)],
      keys: [rev(1.8, 0.2)],
      pad: [rev(3, 0.36)],
      master: [F('compressor', { threshold: -12, knee: 10, ratio: 2.5, attack: 0.006, release: 0.16 }), F('limiter', { threshold: -1 })],
    },
    humanize: { velJitter: 5, dropP: 0.05 },
  }),

  mk('punk', 'Punk', '朋克', Sparkles, '#00E5FF', '180 BPM 全八分 · 三和弦直给 · 齐诵式旋律', {
    bpm: [160, 190],
    scales: ['major', 'mixolydian', 'minor'],
    harmony: {
      prog: [
        [0, 5, 3, 4],
        [0, 3, 4, 4],
        [5, 4, 0, 3],
      ],
      cadence: 'authentic',
      ext: [0, 0, 0],
      voicing: 'close',
      inversionP: 0,
      compRhythm: QUARTERS,
      sustainSteps: 3,
    },
    melody: { register: [60, 79], perBar: [3, 6], restP: 0.06, leapMax: 2, syncP: 0.1, endTarget: 'tonic' },
    bass: { idiom: 'pump', steps: EIGHTHS, register: [28, 42], octaveJumpP: 0.12 },
    groove: {
      kick: QUARTERS,
      snare: [4, 12],
      clap: [],
      closedHat: EIGHTHS,
      openHat: [],
      tom: [14, 15],
    },
    accent: QUARTERS,
    fill: [12, 13, 14, 15],
    usesDrums: ['kick', 'snare', 'closedHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('lead', ['lead'], [60, 79], ALL_SEC),
      r('keys', ['pluck'], [52, 70], ['Chorus']),
    ],
    form: [f('Intro', 4), f('Verse', 8), f('Chorus', 8, 2), f('Chorus', 4, 1)],
    fx: {
      lead: [F('distortion', { distortion: 0.26, wet: 0.24 }), rev(1.2, 0.14)],
      master: [F('compressor', { threshold: -10, knee: 6, ratio: 4, attack: 0.003, release: 0.08 }), F('limiter', { threshold: 0 })],
    },
    humanize: { velJitter: 4, dropP: 0.02 },
  }),

  mk('reggae', 'Reggae', '雷鬼', Leaf, '#39FF88', '一拍落 · 反拍吉他刺 · 深沉旋律贝斯', {
    bpm: [72, 88],
    scales: ['minorPent', 'major', 'mixolydian'],
    harmony: {
      prog: [
        [0, 3, 0, 4],
        [0, 5, 3, 4],
        [1, 4, 0, 0],
      ],
      cadence: 'plagal',
      ext: [0.22, 0.1, 0],
      voicing: 'close',
      inversionP: 0.15,
      compRhythm: [4, 12],
      sustainSteps: 2,
    },
    melody: { register: [60, 79], perBar: [1, 3], restP: 0.42, leapMax: 2, syncP: 0.24, endTarget: 'tonic' },
    bass: { idiom: 'syncopated', steps: [0, 3, 6, 8, 11, 14], register: [26, 38], octaveJumpP: 0.08 },
    groove: {
      kick: [8],
      snare: [8, 12],
      clap: [],
      closedHat: OFFBEATS,
      openHat: [14],
      tom: [],
    },
    accent: [8, 14],
    fill: [14, 15],
    usesDrums: ['kick', 'snare', 'closedHat', 'openHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['pluck', 'keys'], [52, 72], ALL_SEC),
      r('lead', ['keys', 'pluck'], [60, 79], ['Verse', 'Chorus']),
      r('pad', ['keys', 'pad'], [50, 68], ['Chorus', 'Outro']),
    ],
    form: [f('Intro', 4), f('Verse', 8, 2), f('Chorus', 8, 2), f('Outro', 4)],
    fx: {
      keys: [F('phaser', { frequency: 0.7, octaves: 2, wet: 0.28 })],
      lead: [rev(2, 0.22)],
      pad: [rev(2.6, 0.3)],
      bass: [F('compressor', { threshold: -20, knee: 8, ratio: 4, attack: 0.005, release: 0.14 })],
    },
    humanize: { velJitter: 8, dropP: 0.22 },
  }),

  mk('phonk', 'Phonk', '孟菲斯陷阱', CarFront, '#FF3DBE', '和声小调 · 极速 808 滑音 · 牛铃式通鼓', {
    bpm: [155, 170],
    scales: ['harmonicMinor', 'phrygian', 'minor'],
    harmony: {
      prog: [
        [0, 0, 4, 0],
        [0, 6, 0, 4],
        [0, 3, 4, 0],
      ],
      cadence: 'vamp',
      ext: [0.16, 0.05, 0],
      voicing: 'close',
      inversionP: 0.05,
      compRhythm: [0],
      sustainSteps: 15,
    },
    melody: { register: [57, 76], perBar: [2, 4], restP: 0.3, leapMax: 3, syncP: 0.3, endTarget: 'tonic' },
    bass: { idiom: 'slide88', steps: [0, 2, 4, 6, 8, 10, 12, 14], register: [24, 35], octaveJumpP: 0.02 },
    groove: {
      kick: [0, 7, 10],
      snare: [8],
      clap: [],
      closedHat: EIGHTHS,
      openHat: [],
      tom: [4, 12, 15],
    },
    accent: [0, 7, 8, 10],
    fill: [12, 13, 14, 15],
    usesDrums: ['kick', 'snare', 'closedHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['pad', 'keys'], [48, 67], ALL_SEC),
      r('lead', ['lead'], [57, 76], ['Verse', 'Chorus', 'Bridge']),
    ],
    form: [f('Intro', 4), f('Verse', 8), f('Chorus', 8, 2), f('Outro', 4)],
    fx: {
      keys: [rev(3.2, 0.4), F('bitCrusher', { bits: 4, wet: 0.2 })],
      lead: [F('distortion', { distortion: 0.3, wet: 0.26 }), dly(0.2, 0.32, 0.24)],
      bass: [F('distortion', { distortion: 0.2, wet: 0.16 })],
      master: [F('compressor', { threshold: -12, knee: 6, ratio: 4, attack: 0.003, release: 0.1 }), F('limiter', { threshold: -1 })],
    },
    humanize: { velJitter: 7, dropP: 0.16 },
  }),

  mk('future-bass', 'Future Bass', '未来贝斯', Waves, '#00E5FF', '大九和弦宽排列 · 侧链泵动 · 半拍鼓', {
    bpm: [140, 152],
    scales: ['major', 'lydian', 'dorian'],
    harmony: {
      prog: [
        [0, 5, 3, 4],
        [3, 4, 0, 5],
        [5, 3, 4, 0],
      ],
      cadence: 'authentic',
      ext: [0.5, 0.4, 0.08],
      voicing: 'spread',
      inversionP: 0.35,
      compRhythm: [0, 8],
      sustainSteps: 8,
    },
    melody: { register: [64, 86], perBar: [2, 5], restP: 0.24, leapMax: 3, syncP: 0.2, endTarget: 'third' },
    bass: { idiom: 'subLong', steps: [0, 8], register: [24, 36], octaveJumpP: 0.08 },
    groove: {
      kick: [0, 10],
      snare: [],
      clap: [8],
      closedHat: SIXTEENTHS,
      openHat: [],
      tom: [13, 14],
    },
    accent: [0, 8, 10],
    usesDrums: ['kick', 'clap', 'closedHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('pad', ['pad', 'keys'], [55, 74], ALL_SEC),
      r('lead', ['lead', 'pluck'], [64, 86], BODY),
      r('keys', ['keys', 'pluck'], [57, 76], ['Intro', 'Verse', 'Chorus', 'Outro']),
      r('arp', ['pluck'], [72, 90], PEAK, 1),
    ],
    form: [f('Intro', 8), f('Verse', 8), f('PreChorus', 4), f('Chorus', 8, 2), f('Outro', 4)],
    fx: {
      pad: [F('stereoWidener', { width: 0.95 }), rev(3, 0.38)],
      lead: [F('stereoWidener', { width: 0.8 }), rev(2.4, 0.26)],
      keys: [rev(2, 0.22)],
      arp: [dly(0.16, 0.38, 0.3)],
      master: [F('compressor', { threshold: -12, knee: 4, ratio: 4.5, attack: 0.002, release: 0.14 }), F('limiter', { threshold: -1 })],
    },
    humanize: { velJitter: 4, dropP: 0.06 },
  }),

  mk('ambient', 'Ambient', '氛围音景', CloudFog, '#4D9FFF', '无鼓 · 长音铺底 · 大混响留白', {
    bpm: [60, 76],
    scales: ['major', 'lydian', 'dorian'],
    harmony: {
      prog: [
        [0, 3, 0, 4],
        [0, 5, 3, 0],
        [3, 0, 4, 0],
      ],
      cadence: 'plagal',
      ext: [0.6, 0.35, 0.18],
      voicing: 'spread',
      inversionP: 0.4,
      compRhythm: [0],
      sustainSteps: 32,
    },
    melody: { register: [60, 79], perBar: [1, 2], restP: 0.6, leapMax: 2, syncP: 0.1, endTarget: 'fifth' },
    bass: { idiom: 'subLong', steps: [0], register: [24, 36], octaveJumpP: 0 },
    groove: { kick: [], snare: [], clap: [], closedHat: [], openHat: [], tom: [] },
    accent: [0],
    fill: [],
    usesDrums: [],
    roles: [
      BASS_ROLE,
      r('pad', ['pad'], [48, 68], ALL_SEC),
      r('keys', ['keys', 'pluck'], [57, 76], ['Verse', 'Chorus', 'Outro']),
      r('arp', ['pluck'], [72, 88], ['Bridge', 'Chorus'], 1),
      r('lead', ['pluck', 'lead'], [62, 79], ['Verse', 'Bridge', 'Outro']),
    ],
    form: [f('Intro', 8), f('Verse', 8), f('Bridge', 8), f('Outro', 8)],
    fx: {
      pad: [rev(5.5, 0.55), F('stereoWidener', { width: 0.95 })],
      keys: [rev(4.2, 0.45), dly(0.5, 0.42, 0.28)],
      arp: [dly(0.375, 0.5, 0.36), rev(3.6, 0.4)],
      lead: [rev(4, 0.44)],
      master: [F('limiter', { threshold: -3 })],
    },
    humanize: { velJitter: 9, dropP: 0.3 },
  }),

  mk('ballad', 'Piano Ballad', '钢琴叙事曲', Piano, '#A78BFA', '慢速抒情 · 分解和弦 · 长线条旋律', {
    bpm: [66, 80],
    scales: ['major', 'minor', 'lydian'],
    harmony: {
      prog: [
        [0, 4, 5, 3],
        [5, 3, 4, 0],
        [0, 5, 3, 4],
      ],
      cadence: 'authentic',
      ext: [0.35, 0.2, 0.08],
      voicing: 'fourVoice',
      inversionP: 0.35,
      compRhythm: [0, 8],
      sustainSteps: 8,
    },
    melody: { register: [62, 81], perBar: [2, 4], restP: 0.32, leapMax: 3, syncP: 0.12, endTarget: 'tonic' },
    bass: { idiom: 'root8th', steps: [0, 8], register: [28, 40], octaveJumpP: 0.05 },
    groove: {
      kick: [0, 8],
      snare: [4, 12],
      clap: [],
      closedHat: [],
      openHat: [],
      tom: [15],
    },
    accent: [0, 8],
    fill: [12, 14, 15],
    usesDrums: ['kick', 'snare', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['keys'], [52, 74], ALL_SEC),
      r('lead', ['pluck', 'lead'], [62, 81], ['Verse', 'PreChorus', 'Chorus', 'Bridge']),
      r('pad', ['pad'], [48, 66], ['Chorus', 'Outro']),
    ],
    form: [f('Intro', 4), f('Verse', 8), f('PreChorus', 4), f('Chorus', 8, 2), f('Outro', 4)],
    fx: {
      keys: [rev(2.6, 0.3)],
      lead: [rev(3, 0.34)],
      pad: [rev(4, 0.44), F('stereoWidener', { width: 0.7 })],
    },
    humanize: { velJitter: 10, dropP: 0.18 },
  }),

  mk('disco', 'Disco', '迪斯科', Disc3, '#FFE600', '四踩 + 反拍开镲 · 八度跳跃贝斯 · 弦乐刺', {
    bpm: [118, 126],
    scales: ['minor', 'major', 'lydian', 'mixolydian'],
    harmony: {
      prog: [
        [0, 3, 4, 5],
        [5, 3, 4, 0],
        [0, 4, 3, 4],
      ],
      cadence: 'authentic',
      ext: [0.45, 0.25, 0.05],
      voicing: 'drop2',
      inversionP: 0.4,
      compRhythm: OFFBEATS,
      sustainSteps: 3,
    },
    melody: { register: [62, 86], perBar: [3, 6], restP: 0.16, leapMax: 4, syncP: 0.32, endTarget: 'tonic' },
    bass: { idiom: 'octave', steps: EIGHTHS, register: [29, 45], octaveJumpP: 0.95 },
    groove: {
      kick: QUARTERS,
      snare: [4, 12],
      clap: [4, 12],
      closedHat: EIGHTHS,
      openHat: OFFBEATS,
      tom: [15],
    },
    accent: [0, 4, 8, 12, 14],
    usesDrums: ['kick', 'snare', 'clap', 'closedHat', 'openHat', 'tom'],
    roles: [
      BASS_ROLE,
      r('keys', ['pluck', 'keys'], [52, 74], ALL_SEC),
      r('lead', ['lead', 'keys'], [62, 86], BODY),
      r('pad', ['pad'], [50, 70], ALL_SEC),
      r('arp', ['pluck'], [72, 90], PEAK, 1),
    ],
    form: [f('Intro', 8), f('Verse', 8), f('PreChorus', 4), f('Chorus', 8, 2), f('Outro', 4)],
    fx: {
      keys: [F('autoFilter', { frequency: 1.4, depth: 0.6, baseFrequency: 480, octaves: 2.5, wet: 0.5 })],
      lead: [F('phaser', { frequency: 0.5, octaves: 3, wet: 0.34 }), rev(2.2, 0.24)],
      pad: [F('chorus', { frequency: 0.9, delayTime: 0.006, depth: 0.55, wet: 0.4 }), rev(2.8, 0.32)],
      arp: [dly(0.1875, 0.36, 0.28)],
      master: [F('compressor', { threshold: -13, knee: 8, ratio: 3, attack: 0.004, release: 0.12 }), F('limiter', { threshold: -1 })],
    },
    humanize: { velJitter: 5, dropP: 0.08 },
  }),
];

/**
 * 抽一种风格；传入上次 id 可避免连抽同一种。
 * 均匀分布 + 排除上一次 → 20 种都有机会，且不会连续重复。
 */
export function drawStyle(rng: Rng, excludeId?: StyleId | null): StyleDef {
  const pool = excludeId ? STYLES.filter((s) => s.id !== excludeId) : [...STYLES];
  return rng.pick(pool.length ? pool : STYLES);
}

export const getStyle = (id: StyleId): StyleDef | undefined => STYLES.find((s) => s.id === id);
