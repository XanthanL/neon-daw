/**
 * 抽卡组装流水线：一次抽出一个命名风格的完整工程
 *
 * 1. 抽风格 → 定调（一次抽卡内全段共用同一 KeyCtx 与预设指派）
 * 2. 和声计划 → 每段 4/8 小节的 ChordEvent（扩展音 / 转位 / 声部平滑已决策）
 * 3. 动机 → 全曲共用一个细胞，逐段做起承转合变体（保证高潮可识别）
 * 4. 每个 form 段落生成一个 Pattern：鼓按段落 intensity 加密，声部按 role.sections 增减
 * 5. Song 编排：同段 repeat → 多个 clip 复用同一 patternId
 * 6. validateProject 兜底，不合规则重抽（≤3 次后抛错）
 */
import { SYNTH_PRESETS, type PresetCategoryId, type SynthPreset } from '../../audio/synthPresets';
import { SAMPLE_INSTRUMENTS } from '../../audio/samples';
import type {
  Channel,
  DrumType,
  FxInstance,
  FxType,
  MixerTrack,
  Note,
  Pattern,
  Project,
  SongClip,
  StepData,
} from '../../types/project';
import { makeRng, rid } from './rng';
import type { Rng } from './rng';
import { chordAtStep, fitRegister, makeKey, planHarmony } from './theory';
import type { KeyCtx } from './theory';
import { buildBass, buildDrums } from './groove';
import { describeOps, makeMotif, phraseArc, realize } from './motif';
import { drawStyle, getStyle } from './styles';
import type {
  CadenceKind,
  ChordEvent,
  GeneratedInfo,
  GeneratedRole,
  RoleId,
  SectionKind,
  StyleDef,
  StyleId,
} from './types';

const BAR_STEPS = 16;
const DRUM_ORDER: DrumType[] = ['kick', 'snare', 'clap', 'closedHat', 'openHat', 'tom'];

const DRUM_NAMES: Record<DrumType, string> = {
  kick: 'Kick',
  snare: 'Snare',
  clap: 'Clap',
  closedHat: 'Closed Hat',
  openHat: 'Open Hat',
  tom: 'Tom',
};

const DRUM_COLORS: Record<DrumType, string> = {
  kick: '#00E5FF',
  snare: '#FF3DBE',
  clap: '#FFE600',
  closedHat: '#39FF88',
  openHat: '#A78BFA',
  tom: '#4D9FFF',
};

const ROLE_LABEL: Record<RoleId, string> = {
  bass: 'Bass',
  lead: 'Lead',
  keys: 'Keys',
  pad: 'Pad',
  arp: 'Arp',
};

const ROLE_COLORS: Record<RoleId, string> = {
  bass: '#FF5CA8',
  lead: '#00E5FF',
  keys: '#FFE600',
  pad: '#A78BFA',
  arp: '#39FF88',
};

const SECTION_LABEL: Record<SectionKind, string> = {
  Intro: 'Intro',
  Verse: 'Verse',
  PreChorus: 'Pre-Chorus',
  Chorus: 'Chorus',
  Bridge: 'Bridge',
  Outro: 'Outro',
};

/** 段落强度：驱动鼓组密度与铺底厚度 */
const INTENSITY: Record<SectionKind, number> = {
  Intro: 0,
  Verse: 1,
  PreChorus: 2,
  Chorus: 3,
  Bridge: 1,
  Outro: 0,
};

const CADENCE_LABEL: Record<CadenceKind, string> = {
  authentic: '正格终止 V → I',
  plagal: '变格终止 IV → I',
  vamp: '循环 vamp（不解决）',
};

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/** 抽卡可控的 Pattern 数区间：段落数 = Pattern 数，越多越长越厚 */
export const MIN_PATTERNS = 3;
export const MAX_PATTERNS = 8;

/** 按 Pattern 数取前 N 段的宏观曲式（天然含重复段与对比 Bridge） */
const FORM_BY_COUNT: Record<number, SectionKind[]> = {
  3: ['Verse', 'Chorus', 'Outro'],
  4: ['Intro', 'Verse', 'Chorus', 'Outro'],
  5: ['Intro', 'Verse', 'PreChorus', 'Chorus', 'Outro'],
  6: ['Intro', 'Verse', 'PreChorus', 'Chorus', 'Bridge', 'Outro'],
  7: ['Intro', 'Verse', 'PreChorus', 'Chorus', 'Verse', 'Bridge', 'Outro'],
  8: ['Intro', 'Verse', 'PreChorus', 'Chorus', 'Verse', 'Bridge', 'Chorus', 'Outro'],
};

/** 段落默认小节数（8 段合计 24 小节，稳落在 ≤64 校验内） */
const BARS_BY_KIND: Record<SectionKind, 1 | 2 | 4 | 8> = {
  Intro: 2,
  Verse: 4,
  PreChorus: 2,
  Chorus: 4,
  Bridge: 2,
  Outro: 2,
};

/** 声部分层门槛：Pattern 越多，越靠后的声部（lead→pad→arp）才加入 */
const ROLE_TIER: Record<RoleId, number> = { bass: 0, keys: 0, lead: 1, pad: 2, arp: 3 };

/**
 * 音高折进合法区间 [24, 100]：只能整体移八度，
 * 直接 clamp 会把音名改掉（例如把低于 C0 的 E 变成 C → 跑出音阶）
 */
const foldPitch = (v: number): number => {
  let m = Math.round(v);
  let guard = 12;
  while (m < 24 && guard-- > 0) m += 12;
  guard = 12;
  while (m > 100 && guard-- > 0) m -= 12;
  return m;
};

const emptySteps = (len: number): StepData[] =>
  Array.from({ length: len }, () => ({ on: false, velocity: 100 }));

const fxOf = (type: FxType, params: Record<string, number>): FxInstance => ({
  id: rid('fx'),
  type,
  params: { ...params },
  bypass: false,
});

type Bare = Omit<Note, 'id' | 'channelId'>;

/* ============================================================
 * 和声类声部的音符
 * ============================================================ */

/** 键盘击键：按和声计划的 strikes 发声，时值截到下一次击键 */
function buildComp(chords: ChordEvent[], bars: number, rng: Rng, vel: number): Bare[] {
  const notes: Bare[] = [];
  const total = bars * BAR_STEPS;
  for (const ev of chords) {
    for (let i = 0; i < ev.strikes.length; i++) {
      const at = ev.startStep + ev.strikes[i];
      if (at >= total) continue;
      const next =
        i + 1 < ev.strikes.length ? ev.startStep + ev.strikes[i + 1] : ev.startStep + ev.lengthSteps;
      const barLeft = BAR_STEPS - (at % BAR_STEPS);
      const len = Math.max(1, Math.min(next - at, barLeft));
      const v = ev.strikes[i] === 0 ? vel : vel - 8;
      for (const m of ev.voicing) {
        notes.push({
          pitch: m,
          startStep: at,
          lengthSteps: len,
          velocity: clamp(40, 127, v + rng.int(-4, 4)),
        });
      }
    }
  }
  return notes;
}

/** 铺底长音：每个和弦一条，最低声部下沉八度让出中频 */
function buildDrone(chords: ChordEvent[], bars: number, vel: number): Bare[] {
  const total = bars * BAR_STEPS;
  const notes: Bare[] = [];
  for (const ev of chords) {
    const len = Math.max(1, Math.min(ev.lengthSteps, total - ev.startStep));
    ev.voicing.forEach((m, i) => {
      notes.push({
        pitch: i === 0 ? m - 12 : m,
        startStep: ev.startStep,
        lengthSteps: len,
        velocity: vel,
      });
    });
  }
  return notes;
}

/** 分解和弦：voicing 循环上奏，密度随段落强度提高 */
function buildArp(
  chords: ChordEvent[],
  bars: number,
  rng: Rng,
  register: [number, number],
  intensity: number,
): Bare[] {
  const total = bars * BAR_STEPS;
  const grid =
    intensity >= 3
      ? Array.from({ length: BAR_STEPS }, (_, i) => i)
      : intensity >= 1
        ? [0, 2, 4, 6, 8, 10, 12, 14]
        : [0, 4, 8, 12];
  const notes: Bare[] = [];
  let idx = 0;
  for (let step = 0; step < total; step++) {
    if (!grid.includes(step % BAR_STEPS)) continue;
    // 满格 16 分需要呼吸感，随机漏掉少量击点
    if (intensity >= 3 && rng.chance(0.18)) continue;
    const ev = chordAtStep(chords, step);
    const voices = ev.voicing.length ? ev.voicing : [60];
    const base = voices[idx % voices.length];
    idx += 1;
    notes.push({
      pitch: fitRegister(base + 12, register[0], register[1]),
      startStep: step,
      lengthSteps: intensity >= 3 ? 1 : 2,
      velocity: clamp(45, 120, (step % 8 === 0 ? 84 : 70) + rng.int(-6, 6)),
    });
  }
  return notes;
}

/* ============================================================
 * 预设指派（16 预设 / 5 类，只挑选不新增）
 * ============================================================ */

function pickPreset(cats: readonly PresetCategoryId[], used: string[], rng: Rng): SynthPreset {
  const fresh = SYNTH_PRESETS.filter((p) => cats.includes(p.category) && !used.includes(p.id));
  const pool = fresh.length ? fresh : SYNTH_PRESETS.filter((p) => cats.includes(p.category));
  return rng.pick(pool.length ? pool : SYNTH_PRESETS);
}

/* ============================================================
 * 校验
 * ============================================================ */

export function validateProject(p: Project): string[] {
  const errors: string[] = [];
  if (p.patterns.length < 1 || p.patterns.length > 8) errors.push(`patterns 数量 ${p.patterns.length}`);
  if (p.bpm < 60 || p.bpm > 200) errors.push(`bpm ${p.bpm}`);

  const channelIds = new Set(p.channels.map((c) => c.id));
  const patternIds = new Set(p.patterns.map((x) => x.id));
  if (!patternIds.has(p.currentPatternId)) errors.push('currentPatternId 无效');
  if (!p.mixerTracks.some((t) => t.id === 'track-master')) errors.push('缺少 Master 轨');

  let totalBars = 0;
  for (const track of p.song.tracks) {
    for (const clip of track.clips) {
      const pat = p.patterns.find((x) => x.id === clip.patternId);
      if (!pat) {
        errors.push(`clip 指向未知 pattern`);
        continue;
      }
      totalBars = Math.max(totalBars, clip.startBar + pat.bars);
    }
  }
  if (totalBars > 64) errors.push(`总小节数 ${totalBars}`);

  for (const pat of p.patterns) {
    const steps = pat.bars * BAR_STEPS;
    for (const ch of p.channels) {
      const lane = pat.steps[ch.id];
      if (!lane) {
        errors.push(`${pat.name} 缺少通道 ${ch.id} 的 steps`);
        continue;
      }
      if (lane.length !== steps) errors.push(`${pat.name}/${ch.id} steps 长度 ${lane.length}≠${steps}`);
    }
    for (const n of pat.notes) {
      if (!channelIds.has(n.channelId)) errors.push(`${pat.name} 音符指向未知通道`);
      if (n.startStep < 0 || n.startStep + n.lengthSteps > steps)
        errors.push(`${pat.name} 音符越界 ${n.startStep}+${n.lengthSteps}>${steps}`);
      if (n.pitch < 24 || n.pitch > 100) errors.push(`${pat.name} 音高越界 ${n.pitch}`);
      if (n.lengthSteps < 1) errors.push(`${pat.name} 音符时值 ${n.lengthSteps}`);
    }
  }
  for (const ch of p.channels) {
    if (!p.mixerTracks.some((t) => t.id === ch.mixerTrackId)) errors.push(`通道 ${ch.id} 无对应混音轨`);
  }
  return errors;
}

/* ============================================================
 * 单个工程的构建
 * ============================================================ */

function buildProject(
  style: StyleDef,
  rng: Rng,
  patternCount: number,
): { project: Project; info: GeneratedInfo } {
  const ctx: KeyCtx = makeKey(rng, style.scales);
  const prog = rng.pick(style.harmony.prog);
  const bpm = clamp(60, 200, rng.int(style.bpm[0], style.bpm[1]));

  /* Pattern 数 → 密度：越大越长、越多声部、越密的 groove */
  const count = clamp(MIN_PATTERNS, MAX_PATTERNS, patternCount);
  const d = (count - MIN_PATTERNS) / (MAX_PATTERNS - MIN_PATTERNS);
  const maxTier = d < 0.2 ? 0 : d < 0.45 ? 1 : d < 0.7 ? 2 : 3;
  const tiered = style.roles.filter((r) => ROLE_TIER[r.role] <= maxTier);
  const roleSpecs = tiered.length ? tiered : style.roles.slice(0, 1);
  const form = (FORM_BY_COUNT[count] ?? FORM_BY_COUNT[MAX_PATTERNS]).map((kind) => ({
    kind,
    bars: BARS_BY_KIND[kind],
    repeat: 1,
  }));

  const compRegister: [number, number] =
    style.roles.find((x) => x.role === 'keys')?.register ??
    style.roles.find((x) => x.role === 'pad')?.register ?? [52, 74];
  const melodyRegister: [number, number] =
    style.roles.find((x) => x.role === 'lead')?.register ?? [62, 84];

  /* ---------- 通道 + 混音轨：先 roles 后 6 件鼓，master 挂风格链 ---------- */
  const channels: Channel[] = [];
  const mixerTracks: MixerTrack[] = [];
  const roleChannel: Record<RoleId, string> = {
    bass: 'ch-bass',
    lead: 'ch-lead',
    keys: 'ch-keys',
    pad: 'ch-pad',
    arp: 'ch-arp',
  };
  /* 旋律/和声性角色用真实采样（引擎内未加载键自动回退合成器）；lead/arp 保留合成质感 */
  const roleSample: Partial<Record<RoleId, string>> = {
    keys: SAMPLE_INSTRUMENTS.piano,
    bass: SAMPLE_INSTRUMENTS.bass,
    pad: SAMPLE_INSTRUMENTS.strings,
  };
  const usedPresets: string[] = [];
  const infoRoles: GeneratedRole[] = [];

  for (const spec of roleSpecs) {
    const preset = pickPreset(spec.cats, usedPresets, rng);
    usedPresets.push(preset.id);
    const name = `${ROLE_LABEL[spec.role]} · ${preset.name}`;
    const id = roleChannel[spec.role];
    channels.push({
      id,
      name,
      kind: 'synth',
      color: ROLE_COLORS[spec.role],
      synthParams: { ...preset.params },
      sampleInstrument: roleSample[spec.role],
      mixerTrackId: `track-${spec.role}`,
    });
    mixerTracks.push({
      id: `track-${spec.role}`,
      name,
      volume: style.mix.vol[spec.role] ?? 0.7,
      pan: style.mix.pan[spec.role] ?? 0,
      mute: false,
      solo: false,
      effects: (style.fx[spec.role] ?? []).map((f) => fxOf(f.type, f.params)),
    });
    infoRoles.push({ role: spec.role, label: ROLE_LABEL[spec.role], preset: preset.name });
  }

  for (const dt of DRUM_ORDER) {
    channels.push({
      id: `ch-${dt}`,
      name: DRUM_NAMES[dt],
      kind: 'drum',
      color: DRUM_COLORS[dt],
      drumType: dt,
      mixerTrackId: `track-${dt}`,
    });
    mixerTracks.push({
      id: `track-${dt}`,
      name: DRUM_NAMES[dt],
      volume: dt === 'kick' ? 0.85 : dt === 'closedHat' || dt === 'openHat' ? 0.6 : 0.74,
      pan: dt === 'openHat' ? 0.16 : dt === 'tom' ? -0.12 : dt === 'clap' ? 0.08 : 0,
      mute: false,
      solo: false,
      effects: [],
    });
  }

  const masterFx = style.fx.master ?? [{ type: 'limiter' as FxType, params: { threshold: -1 } }];
  mixerTracks.push({
    id: 'track-master',
    name: 'Master',
    volume: 0.85,
    pan: 0,
    mute: false,
    solo: false,
    effects: masterFx.map((f) => fxOf(f.type, f.params)),
  });

  /* ---------- 全曲共用一个动机细胞（高潮因此可识别） ---------- */
  const seedChords = planHarmony(ctx, prog, style.harmony, rng, { bars: 8, register: compRegister });
  const baseMotif = makeMotif(ctx, rng, style.melody, seedChords[0].degree);
  const usedOps = [...baseMotif.ops];

  /* ---------- 逐段生成 Pattern ---------- */
  const patterns: Pattern[] = [];
  const clips: SongClip[] = [];
  const sections: { name: string; kind: SectionKind; bars: number }[] = [];
  const kindTotal: Partial<Record<SectionKind, number>> = {};
  for (const seg of form) kindTotal[seg.kind] = (kindTotal[seg.kind] ?? 0) + 1;
  const kindSeen: Partial<Record<SectionKind, number>> = {};
  let barCursor = 0;

  for (const seg of form) {
    const intensity = clamp(0, 3, INTENSITY[seg.kind] + (d >= 0.6 ? 1 : 0));
    const climax = seg.kind === 'Chorus';
    const total = seg.bars * BAR_STEPS;
    const chords = planHarmony(ctx, prog, style.harmony, rng, {
      bars: seg.bars,
      register: compRegister,
      // Bridge 换和弦起点，制造对比而不离调
      startIdx: seg.kind === 'Bridge' ? rng.int(1, Math.max(1, prog.length - 1)) : 0,
    });

    const drumLanes = buildDrums(style, rng, intensity, seg.kind !== 'Outro', seg.bars);
    const steps: Record<string, StepData[]> = {};
    for (const dt of DRUM_ORDER) steps[`ch-${dt}`] = drumLanes[dt];
    for (const spec of roleSpecs) steps[roleChannel[spec.role]] = emptySteps(total);

    kindSeen[seg.kind] = (kindSeen[seg.kind] ?? 0) + 1;
    const numbered = (kindTotal[seg.kind] ?? 0) > 1;
    const name = `${SECTION_LABEL[seg.kind]}${numbered ? ` ${kindSeen[seg.kind]}` : ''}`;

    const notes: Note[] = [];
    for (const spec of roleSpecs) {
      if (!spec.sections.includes(seg.kind)) continue;
      const chId = roleChannel[spec.role];
      let bare: Bare[];
      if (spec.role === 'bass') {
        bare = buildBass(style, ctx, chords, rng, intensity, seg.bars);
      } else if (spec.role === 'lead') {
        const phrases = phraseArc(baseMotif, rng, style.melody, seg.bars, climax);
        for (const p of phrases) for (const op of p.motif.ops) if (!usedOps.includes(op)) usedOps.push(op);
        bare = realize(phrases, ctx, chords, style.melody, rng, {
          register: melodyRegister,
          octaveShift: climax ? 1 : 0,
          bars: seg.bars,
          velJitter: style.humanize.velJitter,
        });
      } else if (spec.role === 'keys') {
        bare = buildComp(chords, seg.bars, rng, intensity >= 2 ? 74 : 66);
      } else if (spec.role === 'pad') {
        bare = buildDrone(chords, seg.bars, intensity >= 2 ? 58 : 48);
      } else {
        bare = buildArp(chords, seg.bars, rng, spec.register, intensity);
      }

      for (const n of bare) {
        if (n.startStep >= total || n.startStep < 0) continue;
        notes.push({
          id: rid('n'),
          channelId: chId,
          pitch: foldPitch(n.pitch),
          startStep: n.startStep,
          lengthSteps: clamp(1, total - n.startStep, n.lengthSteps),
          velocity: clamp(1, 127, n.velocity),
        });
      }
    }

    const pattern: Pattern = { id: rid('pat'), name, bars: seg.bars, steps, notes };
    patterns.push(pattern);
    sections.push({ name, kind: seg.kind, bars: seg.bars * seg.repeat });

    for (let i = 0; i < seg.repeat; i++) {
      clips.push({ id: rid('clip'), patternId: pattern.id, startBar: barCursor });
      barCursor += seg.bars;
    }
  }

  const tracks = Array.from({ length: 6 }, (_, i) => ({
    id: `song-track-${i + 1}`,
    clips: i === 0 ? clips : [],
  }));

  const chorus = patterns.find((p) => p.name.startsWith('Chorus')) ?? patterns[0];
  const project: Project = {
    bpm,
    currentPatternId: chorus.id,
    patterns,
    channels,
    mixerTracks,
    song: { tracks },
  };

  const info: GeneratedInfo = {
    styleId: style.id,
    styleName: style.name,
    styleNameZh: style.nameZh,
    icon: style.icon,
    color: style.color,
    tagline: style.tagline,
    keyName: ctx.label,
    bpm,
    progression: seedChords.map((c) => c.roman).join(' – '),
    cadenceLabel: CADENCE_LABEL[style.harmony.cadence],
    motifLabel: describeOps(usedOps),
    roles: infoRoles,
    sections,
    bars: barCursor,
  };

  return { project, info };
}

/** 抽卡生成整曲（返回整个工程，交给 importProject 替换当前工程） */
export function generateRandomSong(
  opts: {
    styleId?: StyleId;
    excludeStyleId?: StyleId | null;
    patternCount?: number;
  } = {},
): { project: Project; info: GeneratedInfo } {
  const rng = makeRng();
  const patternCount = clamp(MIN_PATTERNS, MAX_PATTERNS, opts.patternCount ?? 5);
  let lastError = '未知原因';
  for (let attempt = 0; attempt < 4; attempt++) {
    const seeded = opts.styleId ? getStyle(opts.styleId) : undefined;
    const style = seeded ?? drawStyle(rng, opts.excludeStyleId);
    const { project, info } = buildProject(style, rng, patternCount);
    const errors = validateProject(project);
    if (!errors.length) return { project, info };
    lastError = errors.slice(0, 3).join('；');
  }
  throw new Error(`生成结果不合规：${lastError}`);
}
