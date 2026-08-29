/**
 * 动机引擎：一个 2 小节旋律细胞 + 发展算子 + 起承转合布局
 *
 * · 细胞约束：3~6 个音、单一节奏细胞、跨度 ≤ 五度、首拍落当前和弦音
 * · 起承转合：a → a'（模进）→ b（分裂 / 倒影推至全段最高音）→ a''（换尾落终止目标）
 * · realize 才落到 16 分格：折进音区、强拍吸附和弦音、音符不跨小节线、力度人性化
 */
import type { Rng } from './rng';
import type { ChordEvent, EndTarget, MelodySpec, Motif, MotifNote, MotifOp } from './types';
import {
  chordAtStep,
  isChordTone,
  melodyPitch,
  nearestChordTone,
  snapDegree,
} from './theory';
import type { KeyCtx } from './theory';

const PHRASE_STEPS = 32; // 2 小节一个乐句
const BAR_STEPS = 16;

export interface RealizedNote {
  pitch: number;
  startStep: number;
  lengthSteps: number;
  velocity: number;
}

const clampVel = (v: number) => Math.max(40, Math.min(127, Math.round(v)));

/* ============================================================
 * 细胞生成
 * ============================================================ */

function normalize(notes: MotifNote[]): Motif {
  const sorted = [...notes].sort((a, b) => a.step - b.step);
  const out: MotifNote[] = [];
  for (const n of sorted) {
    const step = Math.max(0, Math.min(PHRASE_STEPS - 1, Math.round(n.step)));
    if (out.length && step === out[out.length - 1].step) continue;
    const prev = out[out.length - 1];
    const room = prev ? step - prev.step : PHRASE_STEPS;
    const len = Math.max(1, Math.min(Math.round(n.len), room, PHRASE_STEPS - step));
    out.push({ deg: Math.round(n.deg), step, len, vel: Math.round(n.vel) });
  }
  return { notes: out, ops: [] };
}

/** 跨度护栏：细胞整体折进「首音下方三度 ~ 上方五度」的窗口 */
function limitSpan(notes: MotifNote[], firstDeg: number): MotifNote[] {
  const lo = firstDeg - 2;
  const hi = firstDeg + 4;
  return notes.map((n) => {
    let d = n.deg;
    let guard = 12;
    while (d > hi && guard-- > 0) d -= 7;
    guard = 12;
    while (d < lo && guard-- > 0) d += 7;
    return { ...n, deg: d };
  });
}

const RHYTHM_CELLS: number[][] = [
  [0, 3, 6, 8, 11],
  [0, 2, 4, 8, 12, 14],
  [0, 4, 6, 10, 14],
  [0, 3, 4, 8, 10, 14],
  [0, 2, 6, 8, 12],
  [0, 6, 8, 14, 18, 22, 26],
];

/** 生成旋律细胞：startDeg 取段落首和弦根音，保证第一拍就是和弦音 */
export function makeMotif(ctx: KeyCtx, rng: Rng, spec: MelodySpec, startDeg: number): Motif {
  const rhythm = rng
    .pick(RHYTHM_CELLS)
    .filter((s) => s < PHRASE_STEPS);
  const count = Math.min(rhythm.length, rng.int(3, 6));
  const steps = rhythm.slice(0, count);
  const first = snapDegree(ctx, startDeg);
  let deg = first;
  const notes: MotifNote[] = [];

  steps.forEach((step, i) => {
    if (i > 0) {
      const roll = rng.next();
      const dir = rng.chance(0.5) ? 1 : -1;
      if (roll < 0.55) deg += dir;
      else if (roll < 0.75) deg += dir * 2;
      else if (roll < 0.88) {
        /* 同音反复，强化节奏细胞 */
      } else deg += dir * Math.min(Math.max(2, spec.leapMax), 4);
    }
    const next = steps[i + 1] ?? PHRASE_STEPS;
    notes.push({
      deg,
      step,
      len: Math.max(1, next - step - (rng.chance(spec.restP) ? 1 : 0)),
      vel: step % 8 === 0 ? 108 : step % 4 === 0 ? 100 : 88,
    });
  });
  return normalize(limitSpan(notes, first));
}

/* ============================================================
 * 发展算子
 * ============================================================ */

export function derive(motif: Motif, op: MotifOp): Motif {
  const n = motif.notes;
  if (!n.length) return { ...motif, ops: [...motif.ops, op] };
  const head = n[0].deg;
  let notes: MotifNote[];

  switch (op) {
    case 'sequenceUp':
      notes = n.map((x) => ({ ...x, deg: x.deg + 2 }));
      break;
    case 'sequenceDown':
      notes = n.map((x) => ({ ...x, deg: x.deg - 2 }));
      break;
    case 'octaveShift':
      notes = n.map((x) => ({ ...x, deg: x.deg + 7 }));
      break;
    case 'invert':
      notes = n.map((x) => ({ ...x, deg: 2 * head - x.deg }));
      break;
    case 'augment':
      notes = n
        .map((x) => ({ ...x, step: x.step * 2, len: x.len * 2 }))
        .filter((x) => x.step < PHRASE_STEPS);
      break;
    case 'diminish':
      notes = n.map((x) => ({
        ...x,
        step: Math.floor(x.step / 2),
        len: Math.max(1, Math.floor(x.len / 2)),
      }));
      break;
    case 'fragment': {
      const half = n.slice(0, Math.max(2, Math.ceil(n.length / 2)));
      const rest = half.map((x) => ({ ...x, step: x.step + Math.ceil(PHRASE_STEPS / 2) }));
      notes = [...half, ...rest];
      break;
    }
    default:
      notes = [...n];
  }
  return { ...normalize(notes), ops: [...motif.ops, op] };
}

/** 换尾：把乐句末音改写到目标音级（终止落点） */
export function retarget(motif: Motif, targetDeg: number): Motif {
  if (!motif.notes.length) return motif;
  const notes = [...motif.notes];
  const last = notes[notes.length - 1];
  let deg = targetDeg;
  let guard = 12;
  while (deg - last.deg > 4 && guard-- > 0) deg -= 7;
  guard = 12;
  while (last.deg - deg > 4 && guard-- > 0) deg += 7;
  notes[notes.length - 1] = { ...last, deg, len: Math.max(2, last.len) };
  return { ...normalize(notes), ops: [...motif.ops, 'tailSwap'] };
}

const targetDegree = (t: EndTarget): number => (t === 'tonic' ? 0 : t === 'third' ? 2 : 4);

/* ============================================================
 * 起承转合布局
 * ============================================================ */

export interface Phrase {
  motif: Motif;
  /** 段落内起始步 */
  startStep: number;
  label: string;
}

const OP_LABEL: Record<MotifOp, string> = {
  repeat: '原样重复',
  sequenceUp: '上行模进',
  sequenceDown: '下行模进',
  invert: '倒影',
  augment: '增值',
  diminish: '减值',
  fragment: '分裂',
  tailSwap: '换尾',
  octaveShift: '移八度',
};

export const describeOps = (ops: MotifOp[]): string => {
  const uniq: MotifOp[] = [];
  for (const o of ops) if (!uniq.includes(o)) uniq.push(o);
  return uniq.map((o) => OP_LABEL[o]).join(' · ') || '原样重复';
};

/** 收集整段用到的手法（结果卡展示） */
export const arcOps = (phrases: Phrase[]): MotifOp[] => {
  const all: MotifOp[] = [];
  for (const p of phrases) for (const o of p.motif.ops) if (!all.includes(o)) all.push(o);
  return all;
};

/**
 * 排出乐句：8 小节 = 起承转合四句，4 小节 = 问答两句
 * 起句收在半终止音级（2̂ / 5̂），合句收在终止目标 → 问与答成立
 */
export function phraseArc(
  base: Motif,
  rng: Rng,
  spec: MelodySpec,
  bars: number,
  climax: boolean,
): Phrase[] {
  const halfCadence = rng.chance(0.5) ? 1 : 4;
  const end = targetDegree(spec.endTarget);

  if (bars >= 8) {
    const a = retarget(derive(base, 'repeat'), halfCadence);
    const b = derive(base, rng.chance(0.6) ? 'sequenceDown' : 'sequenceUp');
    const c = derive(derive(base, rng.chance(0.5) ? 'fragment' : 'invert'), 'octaveShift');
    const d = retarget(derive(base, climax ? 'augment' : 'repeat'), end);
    return [
      { motif: a, startStep: 0, label: '起' },
      { motif: b, startStep: PHRASE_STEPS, label: '承' },
      { motif: c, startStep: PHRASE_STEPS * 2, label: '转' },
      { motif: d, startStep: PHRASE_STEPS * 3, label: '合' },
    ];
  }

  const a = retarget(base, halfCadence);
  const b = retarget(derive(base, climax ? 'octaveShift' : rng.chance(0.5) ? 'sequenceDown' : 'fragment'), end);
  return [
    { motif: a, startStep: 0, label: '起' },
    { motif: b, startStep: PHRASE_STEPS, label: '合' },
  ];
}

/* ============================================================
 * 落地到 16 分格
 * ============================================================ */

export interface RealizeOptions {
  register: [number, number];
  /** 副歌等整段抬高的声部 */
  octaveShift: number;
  bars: number;
  velJitter: number;
}

/**
 * 实现乐句：
 * · 强拍吸附当前和弦内音；弱拍按 syncP 后移形成切分
 * · 音符不跨小节线（越线者截到小节末，截不下则丢）
 * · 最后按 perBar 对齐密度：过密删弱拍、过疏补经过音
 */
export function realize(
  phrases: Phrase[],
  ctx: KeyCtx,
  chords: ChordEvent[],
  spec: MelodySpec,
  rng: Rng,
  opts: RealizeOptions,
): RealizedNote[] {
  const out: RealizedNote[] = [];
  const total = opts.bars * BAR_STEPS;
  const register: [number, number] = [
    opts.register[0] + opts.octaveShift * 12,
    opts.register[1] + opts.octaveShift * 12,
  ];

  for (const phrase of phrases) {
    const lastIdx = phrase.motif.notes.length - 1;
    for (let ni = 0; ni <= lastIdx; ni++) {
      const n = phrase.motif.notes[ni];
      let step = phrase.startStep + n.step;
      if (step >= total) continue;
      const isEdge = ni === 0 || ni === lastIdx;
      if (!isEdge && rng.chance(spec.restP * 0.55)) continue;

      let deg = n.deg;
      const ev = chordAtStep(chords, step);
      const strong = step % 4 === 0;
      if (strong && !isChordTone(ctx, snapDegree(ctx, deg), ev.tones)) {
        deg = nearestChordTone(ctx, deg, ev.tones);
      } else if (!strong && rng.chance(spec.syncP)) {
        const next = phrase.motif.notes[ni + 1];
        const room = next ? next.step - n.step - n.len : PHRASE_STEPS - n.step - n.len;
        if (room >= 1 && step + 1 < total) step += 1;
      }

      let len = n.len;
      const barLeft = BAR_STEPS - (step % BAR_STEPS);
      if (len > barLeft) len = barLeft;
      if (step + len > total) len = total - step;
      if (len < 1) continue;

      out.push({
        pitch: melodyPitch(ctx, deg, register),
        startStep: step,
        lengthSteps: len,
        velocity: clampVel(n.vel + (strong ? 5 : 0) + rng.int(-opts.velJitter, opts.velJitter)),
      });
    }
  }

  return alignDensity(out, spec, ctx, chords, rng, register, opts.bars);
}

/** 每小节音数对齐 [min,max]：过密删弱拍音，过疏补经过音 */
function alignDensity(
  notes: RealizedNote[],
  spec: MelodySpec,
  ctx: KeyCtx,
  chords: ChordEvent[],
  rng: Rng,
  register: [number, number],
  bars: number,
): RealizedNote[] {
  const result: RealizedNote[] = [];

  for (let bar = 0; bar < bars; bar++) {
    const from = bar * BAR_STEPS;
    const to = from + BAR_STEPS;
    let inBar = notes
      .filter((n) => n.startStep >= from && n.startStep < to)
      .sort((a, b) => a.startStep - b.startStep);

    const [minPer, maxPer] = spec.perBar;
    if (inBar.length > maxPer) {
      const keep = inBar.filter(
        (n, i) => i === 0 || i === inBar.length - 1 || n.startStep % 4 === 0,
      );
      inBar = keep.length >= minPer ? keep.slice(0, maxPer) : inBar.slice(0, maxPer);
    }

    let guard = 0;
    while (inBar.length < minPer && guard++ < 5) {
      const anchor = inBar.length ? inBar[Math.floor(inBar.length / 2)] : null;
      const cand = anchor ? anchor.startStep + anchor.lengthSteps + rng.int(0, 1) : from + 8;
      if (cand >= to || cand < from) break;
      if (inBar.some((n) => n.startStep === cand)) break;
      const ev = chordAtStep(chords, cand);
      const deg = nearestChordTone(ctx, ev.degree + (rng.chance(0.5) ? 1 : -1), ev.tones);
      inBar = [
        ...inBar,
        {
          pitch: melodyPitch(ctx, deg, register),
          startStep: cand,
          lengthSteps: 1,
          velocity: clampVel(78 + rng.int(-6, 6)),
        },
      ].sort((a, b) => a.startStep - b.startStep);
    }
    result.push(...inBar);
  }
  return result;
}
