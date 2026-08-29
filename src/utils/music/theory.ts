/**
 * 乐理引擎：调式、和弦构造、排列（voicing）、声部连接与和声计划
 *
 * 讲理的关键点：
 * · 和弦由音阶叠置三度实际算出，性质（maj/min/dim）来自真实音程而非查表
 * · 扩展音按概率叠加，并带硬护栏（大和弦不加 11 音、扩展音 ≤2、声部 ≤4）
 * · 转位候选用「声部平滑代价」择优：Σ|半音位移| + 交叉 + 跨度 + 平行五八度
 * · cadence 决定段尾：authentic V→I / plagal IV→I / vamp 保持循环
 */
import type { Rng } from './rng';
import type { CadenceKind, ChordEvent, ChordQuality, HarmonySpec } from './types';

export const NOTE_NAMES = [
  'C',
  'C♯',
  'D',
  'E♭',
  'E',
  'F',
  'F♯',
  'G',
  'A♭',
  'A',
  'B♭',
  'B',
];

export interface ScaleDef {
  name: string;
  /** 和弦构造基准（始终 7 音） */
  steps: number[];
  /** 五声类：以某个七声音阶为和声基准 */
  basis?: string;
  /** 五声类：旋律可用的音阶级数 */
  degrees?: number[];
}

export const SCALES: Record<string, ScaleDef> = {
  major: { name: '大调', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: '小调', steps: [0, 2, 3, 5, 7, 8, 10] },
  harmonicMinor: { name: '和声小调', steps: [0, 2, 3, 5, 7, 8, 11] },
  dorian: { name: '多利亚', steps: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { name: '弗里几亚', steps: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: '利底亚', steps: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { name: '混合利底亚', steps: [0, 2, 4, 5, 7, 9, 10] },
  minorPent: {
    name: '小调五声',
    steps: [0, 3, 5, 7, 10],
    basis: 'minor',
    degrees: [0, 2, 3, 4, 6],
  },
  majorPent: {
    name: '大调五声',
    steps: [0, 2, 4, 7, 9],
    basis: 'major',
    degrees: [0, 1, 2, 4, 5],
  },
};

/** 调性上下文：一次抽卡内所有段落共享 */
export interface KeyCtx {
  rootPc: number;
  /** 音阶级数 0 的基准 MIDI */
  tonicMidi: number;
  scaleKey: string;
  scaleName: string;
  /** 七声音阶步进（和声与旋律共用） */
  steps: number[];
  /** 旋律受限音级（五声），null = 全七声 */
  allowed: number[] | null;
  label: string;
}

export function makeKey(rng: Rng, scaleKeys: readonly string[]): KeyCtx {
  const scaleKey = rng.pick(scaleKeys);
  const def = SCALES[scaleKey] ?? SCALES.major;
  const basis = def.basis ? SCALES[def.basis] : def;
  const rootPc = rng.int(0, 11);
  return {
    rootPc,
    tonicMidi: 48 + rootPc,
    scaleKey,
    scaleName: def.name,
    steps: basis.steps,
    allowed: def.degrees ?? null,
    label: `${NOTE_NAMES[rootPc]} ${def.name}`,
  };
}

/** 音级 → MIDI（支持跨八度的绝对音级索引） */
export const scaleAt = (rootMidi: number, steps: number[], degree: number): number => {
  const len = steps.length;
  const oct = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return rootMidi + steps[idx] + 12 * oct;
};

export const pitchAt = (ctx: KeyCtx, degree: number): number =>
  scaleAt(ctx.tonicMidi, ctx.steps, degree);

/**
 * 把音高折进 [lo, hi]（只整体移八度，不改音级）。
 * 优先保留原八度，否则就近平移。窗口窄于一个八度时该音级可能无解 → 退化为贴较近的边，
 * 而不会像「先上抬再下压」的两段循环那样停在 lo 之下。
 */
export const fitRegister = (midi: number, lo: number, hi: number): number => {
  const kLow = Math.ceil((lo - midi) / 12);
  const kHigh = Math.floor((hi - midi) / 12);
  if (kLow <= kHigh) {
    const k = kLow > 0 ? kLow : kHigh < 0 ? kHigh : 0;
    return midi + 12 * k;
  }
  const above = midi + 12 * kLow;
  const below = midi + 12 * kHigh;
  return above - hi <= lo - below ? above : below;
};

export const pcOf = (midi: number): number => ((midi % 12) + 12) % 12;

/** 五声限制：把任意音级吸附到最近的允许音级（同八度内就近，优先向下） */
export const snapDegree = (ctx: KeyCtx, degree: number): number => {
  if (!ctx.allowed) return degree;
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  if (ctx.allowed.includes(idx)) return oct * 7 + idx;
  let best = ctx.allowed[0];
  let bestD = Infinity;
  for (const a of ctx.allowed) {
    const d = Math.abs(a - idx);
    if (d < bestD || (d === bestD && a < best)) {
      best = a;
      bestD = d;
    }
  }
  return oct * 7 + best;
};

/** 旋律音高：先吸附五声集合，再折进音区 */
export const melodyPitch = (ctx: KeyCtx, degree: number, register: [number, number]): number =>
  fitRegister(pitchAt(ctx, snapDegree(ctx, degree)), register[0], register[1]);

/* ============================================================
 * 和弦构造
 * ============================================================ */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** 叠置三度取音：ext 0=三和弦 1=七和弦 2=加九（去五音）3=加十一（去根五） */
function chordDegrees(degree: number, ext: 0 | 1 | 2 | 3): number[] {
  if (ext === 0) return [degree, degree + 2, degree + 4];
  if (ext === 1) return [degree, degree + 2, degree + 4, degree + 6];
  if (ext === 2) return [degree, degree + 2, degree + 6, degree + 8];
  return [degree + 2, degree + 6, degree + 8, degree + 10];
}

interface ChordShape {
  tones: number[];
  quality: ChordQuality;
  third: number;
  fifth: number;
  seventh: number;
}

/** 性质由实际音程算出 */
function shapeOf(ctx: KeyCtx, degree: number, ext: 0 | 1 | 2 | 3): ChordShape {
  const root = pitchAt(ctx, degree);
  const third = pcOf(pitchAt(ctx, degree + 2)) - pcOf(root);
  const fifth = pcOf(pitchAt(ctx, degree + 4)) - pcOf(root);
  const seventh = pcOf(pitchAt(ctx, degree + 6)) - pcOf(root);
  const t = (third + 12) % 12;
  const f = (fifth + 12) % 12;
  const s7 = (seventh + 12) % 12;
  const quality: ChordQuality = t === 3 && f === 6 ? 'dim' : t === 4 ? 'maj' : 'min';
  return { tones: chordDegrees(degree, ext), quality, third: t, fifth: f, seventh: s7 };
}

function romanOf(degree: number, quality: ChordQuality, ext: 0 | 1 | 2 | 3, seventh: number): string {
  const idx = ((degree % 7) + 7) % 7;
  let base = ROMAN[idx];
  if (quality === 'dim') {
    // 小七度 = 半减七（ø），减七度 = 全减七（°）
    base = `${base.toLowerCase()}${ext >= 1 && seventh === 10 ? 'ø' : '°'}`;
  } else if (quality === 'min') base = base.toLowerCase();
  const maj7 = seventh === 11;
  // 小三和弦 + 大七度（和声小调的 i / iv）需写成 m(maj7)，否则会被误读为大七和弦
  const mLabel = quality === 'min' && maj7;
  const suffix =
    ext === 0
      ? ''
      : ext === 1
        ? (mLabel ? 'm(maj7)' : maj7 ? 'maj7' : '7')
        : ext === 2
          ? (mLabel ? 'm(maj9)' : maj7 ? 'maj9' : '9')
          : '11';
  return base + suffix;
}

/** 按概率抽扩展音，并套用硬护栏 */
function sampleExtension(spec: HarmonySpec, quality: ChordQuality, rng: Rng): 0 | 1 | 2 | 3 {
  const [p7, p9, p11] = spec.ext;
  const r = rng.next();
  let ext: 0 | 1 | 2 | 3 = r < p11 ? 3 : r < p11 + p9 ? 2 : r < p11 + p9 + p7 ? 1 : 0;
  // 大和弦的 11 音与三音构成小二度相撞 → 降级为 9
  if (ext === 3 && quality === 'maj') ext = 2;
  // 减和弦的延伸音在流行语境里过浓 → 最多七和弦
  if (quality === 'dim' && ext > 1) ext = 1;
  return ext;
}

/* ============================================================
 * 排列（voicing）
 * ============================================================ */

/** 依序叠音：每个后续音取比前一个高（至少 minGap 半音）的最近目标音级 */
function stackVoicing(
  ctx: KeyCtx,
  degrees: number[],
  register: [number, number],
  minGap: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < degrees.length; i++) {
    const pc = pcOf(pitchAt(ctx, degrees[i]));
    let m: number;
    if (i === 0) {
      m = fitRegister(pitchAt(ctx, degrees[0]), register[0], register[1]);
    } else {
      m = out[i - 1] + minGap;
      let guard = 24;
      while (pcOf(m) !== pc && guard-- > 0) m += 1;
    }
    out.push(m);
  }
  // 整体折回音区，保持相对排列
  const hi = out[out.length - 1];
  const lo = out[0];
  let shift = 0;
  if (hi > register[1]) shift = Math.ceil((hi - register[1]) / 12) * -12;
  else if (lo < register[0]) shift = Math.ceil((register[0] - lo) / 12) * 12;
  // 宽排列下移后会整组和弦掉到可听域外 → 抬回八度（顶部略亮比听不见好）
  while (lo + shift < 36) shift += 12;
  const fitted = out.map((m) => m + shift);
  return shift === 0 ? out : fitted;
}

const MIN_GAP: Record<HarmonySpec['voicing'], number> = {
  close: 1,
  fourVoice: 1,
  drop2: 1,
  spread: 7,
};

const MAX_SPREAD: Record<HarmonySpec['voicing'], number> = {
  close: 14,
  fourVoice: 18,
  drop2: 24,
  spread: 34,
};

/** 按 voicing 形态生成排列；inversion 决定最低音取第几个和弦音 */
export function buildVoicing(
  ctx: KeyCtx,
  tones: number[],
  voicing: HarmonySpec['voicing'],
  inversion: number,
  register: [number, number],
): number[] {
  const n = tones.length;
  const k = Math.min(inversion, Math.max(0, n - 2));
  const ordered = k === 0 ? [...tones] : [...tones.slice(k), ...tones.slice(0, k)];
  // 轮转后低声部需要抬到原最高音之上，保持升序
  for (let i = 1; i < ordered.length; i++) {
    while (ordered[i] <= ordered[i - 1]) ordered[i] += 7;
  }
  let out = stackVoicing(ctx, ordered, register, MIN_GAP[voicing]);
  if (voicing === 'drop2' && out.length >= 3) {
    const idx = out.length - 2; // 第 2 高声部
    out = [...out];
    out[idx] -= 12;
    out.sort((a, b) => a - b);
  }
  return out;
}

/* ============================================================
 * 声部连接择优
 * ============================================================ */

export interface VoiceCandidate {
  voicing: number[];
  inversion: number;
}

interface VoiceOpts {
  voicing: HarmonySpec['voicing'];
  prevBass: number | null;
}

/** 贪心最近邻配对：位移总量 + 声部交叉 + 跨度超限 */
function smoothCost(prev: number[], cur: number[], voicing: HarmonySpec['voicing']): number {
  const used = new Array(cur.length).fill(false);
  let cost = 0;
  const matched: (number | null)[] = prev.map(() => null);
  prev.forEach((p, i) => {
    let best = -1;
    let bestD = Infinity;
    cur.forEach((c, j) => {
      if (used[j]) return;
      const d = Math.abs(c - p);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    });
    if (best >= 0) {
      used[best] = true;
      matched[i] = best;
      cost += bestD;
    }
  });
  // 声部交叉
  for (let i = 0; i < prev.length; i++) {
    for (let j = i + 1; j < prev.length; j++) {
      const a = matched[i];
      const b = matched[j];
      if (a === null || b === null) continue;
      if (prev[j] - prev[i] > 0 && cur[b] - cur[a] < 0) cost += 3;
    }
  }
  const span = cur[cur.length - 1] - cur[0];
  if (span > MAX_SPREAD[voicing]) cost += 2 * (span - MAX_SPREAD[voicing]);
  return cost;
}

/** 平行五度 / 八度：外声部同向且音程保持不变 */
function hasParallel(prev: number[], cur: number[], prevBass: number | null): boolean {
  const prevBassMidi = prevBass ?? prev[0];
  const curBassMidi = cur[0];
  if (curBassMidi === prevBassMidi) return false;
  const dir = curBassMidi > prevBassMidi ? 1 : -1;
  for (let i = 1; i < Math.min(prev.length, cur.length); i++) {
    const ivPrev = pcOf(prev[i] - prevBassMidi);
    if (ivPrev !== 0 && ivPrev !== 7) continue;
    const ivCur = pcOf(cur[i] - curBassMidi);
    if (ivCur !== ivPrev) continue;
    const sameDir = cur[i] > prev[i] ? 1 : cur[i] < prev[i] ? -1 : 0;
    if (sameDir === dir && Math.abs(cur[i] - prev[i]) < 5) return true;
  }
  return false;
}

/**
 * 从若干转位候选中择优，返回代价最小的排列。
 * 全部候选都触发平行五八度时，退化为「忽略平行项 + 低音可移八度」而不是死循环。
 */
export function voiceChord(
  prev: number[] | null,
  candidates: VoiceCandidate[],
  opts: VoiceOpts,
): { voicing: number[]; inversion: number; degraded: boolean } {
  const score = (c: VoiceCandidate, allowParallel: boolean) => {
    const base = prev ? smoothCost(prev, c.voicing, opts.voicing) : 0;
    const parallel =
      prev !== null && !allowParallel && hasParallel(prev, c.voicing, opts.prevBass);
    // 起点偏好根音位置，之后由声部平滑主导
    const inversionPenalty = prev ? c.inversion * 1.5 : c.inversion * 4;
    return parallel ? Infinity : base + inversionPenalty;
  };

  const ranked = (allowParallel: boolean) =>
    candidates
      .map((c) => ({ c, s: score(c, allowParallel) }))
      .filter((e) => Number.isFinite(e.s))
      .sort((a, b) => a.s - b.s);

  let pool = ranked(false);
  let degraded = false;
  if (!pool.length) {
    pool = ranked(true);
    degraded = true;
  }
  if (!pool.length) {
    const c = candidates[0];
    return { voicing: c.voicing, inversion: c.inversion, degraded: true };
  }
  const win = pool[0].c;
  // 退化态下把低音挪一个八度，尽量避开平行
  const voicing = degraded ? win.voicing.map((m, i) => (i === 0 ? m - 12 : m)) : win.voicing;
  return { voicing, inversion: win.inversion, degraded };
}

/* ============================================================
 * 和声计划
 * ============================================================ */

const BAR_STEPS = 16;

interface LayoutItem {
  degree: number;
  bars: number;
}

/** 把 4 和弦进行铺成 bars 小节，并按终止式改写段尾 */
export function chordLayout(
  prog: readonly number[],
  bars: number,
  cadence: CadenceKind,
  startIdx = 0,
): LayoutItem[] {
  const n = Math.max(1, prog.length);
  const pickDeg = (i: number) => prog[((startIdx + i) % n + n) % n];
  const out: LayoutItem[] = [];

  if (bars >= 8) {
    // 6 小节循环体 + 2 小节终止：0-1-2 各 2 小节，终止 1+1
    if (cadence === 'vamp') {
      for (let i = 0; i < 4; i++) out.push({ degree: pickDeg(i), bars: 2 });
      return out;
    }
    out.push({ degree: pickDeg(0), bars: 2 });
    out.push({ degree: pickDeg(1), bars: 2 });
    out.push({ degree: pickDeg(2), bars: 2 });
    out.push({ degree: cadence === 'authentic' ? 4 : 3, bars: 1 });
    out.push({ degree: 0, bars: 1 });
    return out;
  }

  // 4 小节：每和弦 1 小节，段尾同样收终止
  const perBar = [pickDeg(0), pickDeg(1), pickDeg(2), pickDeg(3)];
  if (cadence === 'authentic') perBar[3] = 0;
  if (cadence === 'plagal') {
    perBar[2] = 3;
    perBar[3] = 0;
  }
  for (const d of perBar.slice(0, Math.max(1, Math.floor(bars)))) out.push({ degree: d, bars: 1 });
  return out;
}

export interface HarmonyOptions {
  bars: number;
  /** 键盘音区 */
  register: [number, number];
  /** 进行起始索引（Bridge 换起点） */
  startIdx?: number;
}

/**
 * 生成一段（4 或 8 小节）的和声事件序列。
 * 每个事件带扩展音、转位、排列与击键格位，供键盘 / 铺底 / 低音轨共用。
 */
export function planHarmony(
  ctx: KeyCtx,
  prog: readonly number[],
  spec: HarmonySpec,
  rng: Rng,
  opts: HarmonyOptions,
): ChordEvent[] {
  let layout = chordLayout(prog, opts.bars, spec.cadence, opts.startIdx ?? 0);
  // 护栏：某些调式（弗里几亚 / 利底亚）的终止和弦叠出来是减三和弦，
  // 强行 V→I 或 IV→I 会难听 → 该段退化为循环 vamp
  if (spec.cadence !== 'vamp' && opts.bars >= 8) {
    const tail = layout.slice(-2);
    if (tail.some((l) => shapeOf(ctx, l.degree, 0).quality === 'dim')) {
      layout = chordLayout(prog, opts.bars, 'vamp', opts.startIdx ?? 0);
    }
  }
  const events: ChordEvent[] = [];
  let step = 0;
  let prev: number[] | null = null;

  for (const item of layout) {
    const span = item.bars * BAR_STEPS;
    const quality = shapeOf(ctx, item.degree, 0).quality;
    const ext = sampleExtension(spec, quality, rng);
    const shape = shapeOf(ctx, item.degree, ext);

    const maxInv = Math.max(0, shape.tones.length - 2);
    const inversions: number[] = [0];
    if (maxInv > 0 && rng.chance(spec.inversionP)) {
      inversions.push(rng.int(1, maxInv));
      if (maxInv > 2) inversions.push(rng.int(1, maxInv));
    }
    const candidates: VoiceCandidate[] = inversions.map((inv) => ({
      voicing: buildVoicing(ctx, shape.tones, spec.voicing, inv, opts.register),
      inversion: inv,
    }));

    const best = voiceChord(prev, candidates, {
      voicing: spec.voicing,
      prevBass: prev ? prev[0] : null,
    });
    prev = best.voicing;

    const rhythm = spec.compRhythm.length ? spec.compRhythm : [0];
    const strikes: number[] = [];
    for (let bar = 0; bar < item.bars; bar++) {
      for (let ri = 0; ri < rhythm.length; ri++) {
        const off = bar * BAR_STEPS + rhythm[ri];
        if (off >= span) continue;
        // 除每小节首拍外，其余击键按风格松紧概率取舍
        if (ri > 0 && !rng.chance(0.82)) continue;
        strikes.push(off);
      }
    }
    if (!strikes.length) strikes.push(0);
    strikes.sort((a, b) => a - b);

    const bassSource = best.inversion === 0 ? item.degree : null;
    const bassPc = pcOf(
      bassSource === null ? best.voicing[0] : pitchAt(ctx, bassSource),
    );

    events.push({
      degree: item.degree,
      roman: romanOf(item.degree, shape.quality, ext, shape.seventh),
      quality: shape.quality,
      extension: ext,
      inversion: best.inversion,
      tones: shape.tones,
      voicing: best.voicing,
      bassPc,
      rootPc: pcOf(pitchAt(ctx, item.degree)),
      startStep: step,
      lengthSteps: span,
      strikes,
    });
    step += span;
  }
  return events;
}

/** 该步所在（或最近）的和弦事件 */
export function chordAtStep(events: ChordEvent[], step: number): ChordEvent {
  for (const e of events) {
    if (step >= e.startStep && step < e.startStep + e.lengthSteps) return e;
  }
  return events[events.length - 1];
}

/** 拍点吸附：把音级挪到当前和弦内最近的音级（按半音距离） */
export function nearestChordTone(ctx: KeyCtx, degree: number, tones: number[]): number {
  const p = pitchAt(ctx, degree);
  let best = tones[0];
  let bestD = Infinity;
  for (const t of tones) {
    for (const oct of [-1, 0, 1]) {
      const cand = t + oct * 7;
      const d = Math.abs(pitchAt(ctx, cand) - p);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
  }
  return best;
}

/** 音级是否为该和弦的和弦音 */
export function isChordTone(ctx: KeyCtx, degree: number, tones: number[]): boolean {
  const pc = pcOf(pitchAt(ctx, degree));
  return tones.some((t) => pcOf(pitchAt(ctx, t)) === pc);
}
