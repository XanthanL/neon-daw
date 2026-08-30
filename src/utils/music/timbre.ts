/**
 * 音色锻造：抽卡时按「风格亲和 → 分类池」选骨架预设，再在乐理护栏内现场调制参数，
 * 让每次抽卡都拿到独一无二、但一定贴风格的音色。
 *
 * · bias：每种风格为各角色声明亲和预设 id（85% 命中，未命中/用尽回退分类池）
 * · voice：风格整体音色倾向（bright/dark/punchy/soft/glassy），映射为截止/谐振/包络整形
 * · forgeVoice：截止 ±~4 半音、Q/包络/失谐按角色合法区间抖动，release 随 BPM 自适应
 * · 采样映射：原声预设（钢琴/电钢/弦乐）与摇摆风立式低音走真实采样，其余保持纯合成，
 *   避免 trap/techno 这类风格被硬套 upright bass 之类不搭的声部
 */
import { SYNTH_PRESETS, type SynthPreset } from '../../audio/synthPresets';
import { SAMPLE_INSTRUMENTS } from '../../audio/samples';
import type { SynthParams } from '../../types/project';
import type { Rng } from './rng';
import type { RoleSpec, StyleDef, VoiceHint } from './types';

export interface VoicedRole {
  preset: SynthPreset;
  params: SynthParams;
  /** 真实采样乐器名（public/samples 文件夹）；undefined = 纯合成 */
  sample?: string;
}

/** 原声向预设 → 打包采样乐器；合成质感预设（Organ/Glass 等）不映射 */
const PRESET_SAMPLE: Record<string, string> = {
  'keys-piano': SAMPLE_INSTRUMENTS.piano,
  'keys-epiano': SAMPLE_INSTRUMENTS.ePiano,
  'pad-strings': SAMPLE_INSTRUMENTS.strings,
};

const PRESET_BY_ID = new Map(SYNTH_PRESETS.map((p) => [p.id, p]));

/** 风格倾向 → 整形系数 */
const HINTS: Record<VoiceHint, { cut: number; q: number; atk: number; det: number }> = {
  bright: { cut: 1.45, q: 0.85, atk: 0.8, det: 1.1 },
  dark: { cut: 0.6, q: 1.15, atk: 1.3, det: 0.9 },
  punchy: { cut: 1.05, q: 1.5, atk: 0.55, det: 0.85 },
  soft: { cut: 0.78, q: 0.7, atk: 1.7, det: 1.0 },
  glassy: { cut: 1.25, q: 1.6, atk: 0.9, det: 1.35 },
};

/** 各角色起音时间合法区间（秒） */
const ROLE_ATK: Record<string, [number, number]> = {
  bass: [0.002, 0.03],
  lead: [0.003, 0.08],
  pluck: [0.001, 0.012],
  pad: [0.1, 1.2],
  keys: [0.001, 0.03],
};

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));
const uni = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng.next();

/** 在护栏内把骨架预设调制成新音色 */
export function forgeVoice(
  base: SynthParams,
  role: RoleSpec['role'],
  hint: VoiceHint | undefined,
  bpm: number,
  rng: Rng,
): SynthParams {
  const p: SynthParams = { ...base };
  const h = HINTS[hint ?? 'bright'] ?? HINTS.bright;
  const neutral = !hint;
  const cutMul = (neutral ? 1 : h.cut) * 2 ** uni(rng, -0.22, 0.22);
  const qMul = (neutral ? 1 : h.q) * uni(rng, 0.85, 1.2);
  const atkMul = (neutral ? 1 : h.atk) * uni(rng, 0.75, 1.35);
  const detMul = (neutral ? 1 : h.det) * uni(rng, 0.8, 1.25);
  const beat = 60 / bpm;

  p.filterCutoff = Math.round(clamp(90, 12500, p.filterCutoff * cutMul));
  p.filterQ = Math.round(clamp(0.2, 16, p.filterQ * qMul) * 10) / 10;
  const [aLo, aHi] = ROLE_ATK[role] ?? [0.002, 0.2];
  p.attack = Math.round(clamp(aLo, aHi, p.attack * atkMul) * 1000) / 1000;
  p.osc2Detune = Math.round(clamp(-30, 30, p.osc2Detune * detMul));

  if (role === 'pad') {
    // 铺底随曲速呼吸：慢歌长 release，快歌也不糊
    p.release = Math.round(clamp(beat * 0.9, 0.5, 4) * uni(rng, 1, 2.2) * 100) / 100;
    p.sustain = Math.round(clamp(0.4, 0.95, p.sustain * uni(rng, 0.9, 1.15)) * 100) / 100;
  } else if (role === 'arp' || role === 'keys') {
    p.decay = Math.round(clamp(0.05, 2.4, p.decay * uni(rng, 0.7, 1.5)) * 1000) / 1000;
  } else if (role === 'lead') {
    p.release = Math.round(clamp(0.1, 0.9, p.release * uni(rng, 0.7, 1.5)) * 100) / 100;
  } else if (role === 'bass') {
    // 低音截止锁在安全区，避免调制出轰头或闷罐
    p.filterCutoff = Math.round(clamp(120, 1600, p.filterCutoff));
  }
  return p;
}

/** 为一个角色选出骨架预设：风格 bias 优先，再回退分类池（尽量不与他角色重复） */
function pickSkeleton(style: StyleDef, spec: RoleSpec, used: string[], rng: Rng): SynthPreset {
  const bias = (style.bias?.[spec.role] ?? [])
    .map((id) => PRESET_BY_ID.get(id))
    .filter((x): x is SynthPreset => !!x);
  const freshBias = bias.filter((b) => !used.includes(b.id));
  if (freshBias.length && rng.next() < 0.85) return rng.pick(freshBias);
  const catFresh = SYNTH_PRESETS.filter((s) => spec.cats.includes(s.category) && !used.includes(s.id));
  const catAll = SYNTH_PRESETS.filter((s) => spec.cats.includes(s.category));
  const pool = catFresh.length ? catFresh : catAll;
  return rng.pick(pool.length ? pool : SYNTH_PRESETS);
}

export function designVoice(
  style: StyleDef,
  spec: RoleSpec,
  bpm: number,
  used: string[],
  rng: Rng,
): VoicedRole {
  const preset = pickSkeleton(style, spec, used, rng);
  const params = forgeVoice(preset.params, spec.role, style.voice, bpm, rng);
  let sample: string | undefined;
  if (spec.role === 'bass') sample = style.acousticBass ? SAMPLE_INSTRUMENTS.bass : undefined;
  else sample = PRESET_SAMPLE[preset.id];
  return { preset, params, sample };
}
