/**
 * 律动引擎：鼓组 pattern 与低音音型
 *
 * · 数据模型只有 16 分量化格（无微时值），所以 swing / 松紧靠「格位疏密 + 力度阶梯 + 随机丢格」近似
 * · 鼓音色固定 6 件，风格差异全部落在命中格与力度上，不引用未实现音色
 * · intensity 0..3 控制配器厚度：0 只留骨架，1 常规，2 加密，3 满编 + 句尾加花
 */
import type { DrumType, Note, StepData } from '../../types/project';
import type { Rng } from './rng';
import type { ChordEvent, StyleDef } from './types';
import { chordAtStep, fitRegister, pitchAt } from './theory';
import type { KeyCtx } from './theory';

const BAR_STEPS = 16;
const ALL_DRUMS: DrumType[] = ['kick', 'snare', 'clap', 'closedHat', 'openHat', 'tom'];

const BASE_VEL: Record<DrumType, number> = {
  kick: 112,
  snare: 104,
  clap: 101,
  closedHat: 74,
  openHat: 84,
  tom: 96,
};

const blank = (steps: number): StepData[] =>
  Array.from({ length: steps }, () => ({ on: false, velocity: 100 }));

const clampVel = (v: number) => Math.max(35, Math.min(127, Math.round(v)));

/**
 * 生成一段鼓（bars 小节 × 6 件乐器）
 * isFillBar 由调用方按曲式给定（通常是每个段落的最后一小节）
 */
export function buildDrums(
  style: StyleDef,
  rng: Rng,
  intensity: number,
  isFillBar: boolean,
  bars: number,
): Record<DrumType, StepData[]> {
  const total = bars * BAR_STEPS;
  const out = {} as Record<DrumType, StepData[]>;
  const { velJitter, dropP } = style.humanize;
  const accents = new Set(style.accent);
  /* 加密护栏：只有签名鼓格本身密集的流派才在强度高时补十六分 / 呼吸开镲；
     叙事曲、雷鬼、爵士、氛围等稀疏风格保持稀疏 */
  const hatDriven = (style.groove.closedHat?.length ?? 0) >= 8;
  const openHatDriven = (style.groove.openHat?.length ?? 0) > 0;

  for (const dt of ALL_DRUMS) {
    const lane = blank(total);
    out[dt] = lane;
    if (!style.usesDrums.includes(dt)) continue;

    const grid = style.groove[dt] ?? [];
    for (let bar = 0; bar < bars; bar++) {
      const off = bar * BAR_STEPS;
      for (const s of grid) {
        if (s >= BAR_STEPS) continue;
        // 骨架档只留四分，常规档去掉十六分碎格
        if (intensity === 0 && s % 4 !== 0) continue;
        if (intensity === 1 && s % 2 !== 0 && dt === 'closedHat') continue;
        const isAccent = accents.has(s) || s % 4 === 0;
        if (!isAccent && rng.chance(dropP * (intensity >= 3 ? 0.4 : 1))) continue;
        const v =
          BASE_VEL[dt] + (isAccent ? 6 : -8) + rng.int(-velJitter, velJitter);
        lane[off + s] = { on: true, velocity: clampVel(v) };
      }

      // 高密度档：闭镲补十六分 / 双八分，制造驱动感（仅镲驱动的流派）
      if (dt === 'closedHat' && intensity >= 2 && hatDriven) {
        for (let s = 0; s < BAR_STEPS; s++) {
          if (lane[off + s].on) continue;
          const allow = intensity >= 3 ? s % 2 === 1 : s % 4 === 2;
          if (!allow || !rng.chance(intensity >= 3 ? 0.6 : 0.9)) continue;
          lane[off + s] = { on: true, velocity: clampVel(BASE_VEL.closedHat - 18) };
        }
      }
      // 满编档：每小节末尾补一个开镲呼吸（仅当该风格本来就用开镲）
      if (dt === 'openHat' && intensity >= 3 && openHatDriven && !lane[off + 14].on) {
        lane[off + 14] = { on: true, velocity: clampVel(BASE_VEL.openHat - 6) };
      }
    }
  }

  /* 句尾加花：最后两拍改用 tom 下行运行，同时清掉该处的闭镲与底鼓 */
  if (isFillBar) {
    const fill = style.fill.length ? style.fill : [12, 13, 14, 15];
    const off = (bars - 1) * BAR_STEPS;
    if (style.usesDrums.includes('tom')) {
      fill.forEach((s, i) => {
        if (s >= BAR_STEPS) return;
        out.tom[off + s] = {
          on: true,
          velocity: clampVel(BASE_VEL.tom + 4 + i * 3 + rng.int(-4, 4)),
        };
        out.closedHat[off + s] = { on: false, velocity: 100 };
        if (s % 4 !== 0) out.kick[off + s] = { on: false, velocity: 100 };
      });
    }
  }

  return out;
}

/** 空鼓（段落只做氛围、只留底鼓时由调用方自行裁剪） */
export function emptyDrums(bars: number): Record<DrumType, StepData[]> {
  const total = bars * BAR_STEPS;
  return Object.fromEntries(ALL_DRUMS.map((d) => [d, blank(total)])) as Record<
    DrumType,
    StepData[]
  >;
}

/* ============================================================
 * 低音
 * ============================================================ */

export type BassNote = Omit<Note, 'id' | 'channelId'>;

/**
 * 按风格音型生成低音轨
 * 每个和弦内独立取格位；walk / slide88 / octave 等音型决定音高走向
 */
export function buildBass(
  style: StyleDef,
  ctx: KeyCtx,
  chords: ChordEvent[],
  rng: Rng,
  intensity: number,
  bars: number,
): BassNote[] {
  const notes: BassNote[] = [];
  const reg = style.bass.register;
  const spec = style.bass;
  const total = bars * BAR_STEPS;
  const grid = spec.steps.length ? spec.steps : [0, 8];
  const oct = (m: number) => (m + 12 <= reg[1] ? m + 12 : m);
  const toneOf = (deg: number, off: number) => fitRegister(pitchAt(ctx, deg + off), reg[0], reg[1]);

  for (let bar = 0; bar < bars; bar++) {
    const off = bar * BAR_STEPS;
    const ev = chordAtStep(chords, off);
    const nextEv = chordAtStep(chords, Math.min(total - 1, off + BAR_STEPS));
    const root = fitRegister(pitchAt(ctx, ev.degree), reg[0], reg[1]);
    const hits: { step: number; pitch: number; len: number; vel: number }[] = [];

    const push = (step: number, pitch: number, len: number, vel: number) => {
      if (step >= BAR_STEPS) return;
      hits.push({ step, pitch, len, vel });
    };

    switch (spec.idiom) {
      case 'subLong': {
        push(0, root, BAR_STEPS, 92);
        if (intensity >= 2 && rng.chance(0.5)) push(8, oct(root), 6, 74);
        break;
      }
      case 'pump': {
        for (let s = 0; s < BAR_STEPS; s += 2) {
          const up = s % 8 === 6 && rng.chance(spec.octaveJumpP);
          push(s, up ? oct(root) : root, 2, s % 4 === 0 ? 106 : 88);
        }
        break;
      }
      case 'octave': {
        for (let s = 0; s < BAR_STEPS; s += 2) {
          const hi = (s / 2) % 2 === 1;
          push(s, hi ? oct(root) : root, 2, s % 4 === 0 ? 110 : 94);
        }
        break;
      }
      case 'offbeat': {
        for (const s of grid) {
          if (s % 4 === 0) continue;
          push(s, root, 2, s % 8 === 6 ? 100 : 90);
        }
        break;
      }
      case 'walk': {
        // 行走低音：根 → 五 → 三 → 下一级 approaches 下一和弦根音
        const approach = fitRegister(pitchAt(ctx, nextEv.degree - 1), reg[0], reg[1]);
        const cell = [root, toneOf(ev.degree, 4), toneOf(ev.degree, 2), approach];
        for (let s = 0; s < BAR_STEPS; s += 4) {
          const i = s / 4;
          const pitch = intensity === 0 ? root : cell[i % cell.length];
          push(s, pitch, 4, i === 0 ? 106 : 92);
        }
        break;
      }
      case 'syncopated': {
        grid.forEach((s, i) => {
          const useOct = i > 0 && rng.chance(spec.octaveJumpP);
          const pitch = useOct ? oct(root) : i % 3 === 2 ? toneOf(ev.degree, 4) : root;
          push(s, pitch, 2, s % 4 === 0 ? 108 : 92);
        });
        break;
      }
      case 'slide88': {
        // 808 式：八分连击 + 句尾阶梯下行近似滑音
        const steps = grid.length ? grid : [0, 2, 4, 6, 8, 10, 12, 14];
        steps.forEach((s, i) => {
          let pitch = root;
          if (i === steps.length - 1) pitch = toneOf(ev.degree, 4);
          if (s >= 12) pitch = fitRegister(root - 2 * ((s - 12) % 3), reg[0], reg[1]);
          push(s, pitch, 2, s % 4 === 0 ? 110 : 92);
        });
        break;
      }
      default: {
        for (const s of grid) {
          const up = rng.chance(spec.octaveJumpP) && s >= 8;
          push(s, up ? oct(root) : root, 2, s % 8 === 0 ? 108 : 92);
        }
      }
    }

    for (const h of hits) {
      const start = off + h.step;
      if (start >= total) continue;
      const len = Math.max(1, Math.min(h.len, total - start, BAR_STEPS - h.step));
      notes.push({
        pitch: h.pitch,
        startStep: start,
        lengthSteps: len,
        velocity: clampVel(h.vel + rng.int(-style.humanize.velJitter, style.humanize.velJitter)),
      });
    }
  }
  return notes;
}
