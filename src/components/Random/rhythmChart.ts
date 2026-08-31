/**
 * 节奏谱：把抽到的曲子摊成 4 轨下落音符
 * · 声部合池（bass / keys / arp / lead / pad）+ 底鼓落左轨、军鼓落第二轨 ——
 *   只挑一条旋律线时稀疏到 0.2 音/秒，玩起来是空的；鼓是这套生成器最好听的部分，谱面该跟着律动走
 * · 和声音高按分位数切四段：低音在左、高音在右，四轨负载天然均衡
 * · 节流：同轨最少隔一个八分、每轨每小节最多 3 音、同拍点最多两轨齐响，
 *   再密的 Bossa 也不会变成 11 音/秒的乱麻
 */
import type { VizSong } from '../../utils/music/types';

export interface RhythmNote {
  /** 全曲绝对 16 分步位 */
  abs: number;
  /** 时值（步） */
  len: number;
  lane: number;
  pitch: number;
  vel: number;
}

export const RHYTHM_LANES = 4;

/** 同轨两音的最小间距（步）：2 = 八分音符 */
const MIN_LANE_GAP = 2;
/** 每轨每小节音量上限 */
const LANE_NOTES_PER_BAR = 3;
/** 同拍点最多几轨齐响 */
const MAX_STACK = 2;
const STEPS_PER_BAR = 16;

/** 鼓 → 轨：底鼓压左、军鼓/拍手第二轨，踩镲不进场（它是节拍器，不是可玩的乐句） */
const DRUM_LANE: Record<string, number> = { kick: 0, snare: 1, clap: 1 };

export function buildRhythmNotes(viz: VizSong | null): RhythmNote[] {
  if (!viz) return [];

  const pool: RhythmNote[] = [];
  let pitches: number[] = [];
  for (const sec of viz.sections) {
    const base = sec.startBar * STEPS_PER_BAR;
    for (const n of sec.notes) {
      pool.push({ abs: base + n.step, len: n.len, lane: -1, pitch: n.pitch, vel: n.vel });
      pitches.push(n.pitch);
    }
    for (const d of sec.drums) {
      const lane = DRUM_LANE[d.kit];
      if (lane === undefined) continue;
      pool.push({ abs: base + d.step, len: 1, lane, pitch: lane === 0 ? 36 : 48, vel: d.vel });
    }
  }
  if (!pool.length) return [];

  /* 和声音高 → 轨（分位数），鼓已按律动定轨 */
  const [t0, t1, t2] = quartiles(pitches);
  for (const n of pool) {
    if (n.lane >= 0) continue;
    n.lane = n.pitch < t0 ? 0 : n.pitch < t1 ? 1 : n.pitch < t2 ? 2 : 3;
  }

  /* 同轨同拍点只留力度最高的一音，时值取该拍点最长的那条 */
  const merged = new Map<string, RhythmNote>();
  for (const n of pool) {
    const key = `${n.lane}:${n.abs}`;
    const prev = merged.get(key);
    if (!prev) merged.set(key, n);
    else if (n.vel > prev.vel) merged.set(key, { ...n, len: Math.max(n.len, prev.len) });
    else prev.len = Math.max(prev.len, n.len);
  }

  /* 逐拍点按力度降序放行，受同轨间距 / 每轨每小节音量 / 齐响上限三重节流 */
  const atStep = new Map<number, RhythmNote[]>();
  for (const n of merged.values()) {
    const list = atStep.get(n.abs);
    if (list) list.push(n);
    else atStep.set(n.abs, [n]);
  }
  const lastAt = new Array(RHYTHM_LANES).fill(-999);
  const windowBar = new Array(RHYTHM_LANES).fill(-1);
  const windowCount = new Array(RHYTHM_LANES).fill(0);
  const out: RhythmNote[] = [];
  for (const step of [...atStep.keys()].sort((a, b) => a - b)) {
    const list = atStep.get(step)!.sort((a, b) => b.vel - a.vel);
    const bar = step - (step % STEPS_PER_BAR);
    let stack = 0;
    for (const cand of list) {
      if (stack >= MAX_STACK) break;
      const l = cand.lane;
      if (step - lastAt[l] < MIN_LANE_GAP) continue;
      if (windowBar[l] !== bar) {
        windowBar[l] = bar;
        windowCount[l] = 0;
      }
      if (windowCount[l] >= LANE_NOTES_PER_BAR) continue;
      out.push(cand);
      lastAt[l] = step;
      windowCount[l]++;
      stack++;
    }
  }
  return out.sort((a, b) => a.abs - b.abs || a.lane - b.lane);
}

/** 音高分档阈值 [q25, q50, q75]；无音高数据时退化为均分 */
function quartiles(pitches: number[]): [number, number, number] {
  if (!pitches.length) return [0, 0, 0];
  const sorted = pitches.slice().sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return [at(0.25), at(0.5), at(0.75)];
}
