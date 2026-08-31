/**
 * 节奏挑战的对局内核（headless）
 * · 时基取 Transport 的 16 分浮点位置（engine.getLivePosition）：跟音频时钟走，
 *   掉帧 / 切后台回来自动对齐，不再用「起表时刻 + 墙钟」硬撑（那是过去漂移与卡顿的根）
 * · getter 拿不到（未 started）才回退墙钟；loopOn 默认开会让 ticks 回绕归零，
 *   故「本帧比上一帧倒退」即曲终
 * · 状态与逻辑 rAF 都挂在这里而不是画布里：卡片 ⇄ 全屏演奏层换宿主时歌曲不会重开
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { engine } from '../../audio/engine';
import { useHistoryStore } from '../../stores/historyStore';
import { useUiStore } from '../../stores/uiStore';
import type { VizSong } from '../../utils/music/types';
import { buildRhythmNotes, RHYTHM_LANES, type RhythmNote } from './rhythmChart';

export const LANES = RHYTHM_LANES;
/** 轨道左 → 右对应键位 */
export const KEY_LABELS = ['A', 'S', 'W', 'D'];
const CODE_TO_LANE: Record<string, number> = { KeyA: 0, KeyS: 1, KeyW: 2, KeyD: 3 };
export const LANE_COLOR = ['#00E5FF', '#FF3DBE', '#FFE600', '#39FF88'];
export const JUDGE_MS = [70, 130, 200]; // Perfect / Great / Good
const JUDGE_SCORE = [300, 200, 100];
export const JUDGE_LABEL = ['PERFECT', 'GREAT', 'GOOD', 'MISS'];
export const JUDGE_COLOR = ['#FFE600', '#39FF88', '#00E5FF', '#FF3DBE'];
/** 判定弹字 / 命中爆点存活时长 */
export const FX_LIFE = 560;
/** 弹字环形缓冲：逐帧只改字段，不重新分配数组 */
export const FX_SLOTS = 12;

export interface FxSlot {
  at: number;
  lane: number;
  /** 0..3 = PERFECT..MISS，-1 = 空格 */
  tier: number;
}

export interface RunState {
  notes: RhythmNote[];
  /** -1 待击打，0 miss，1..3 判定档 */
  flags: Int8Array;
  score: number;
  combo: number;
  maxCombo: number;
  counts: [number, number, number, number];
  /** 各轨最近一次命中时刻 */
  laneFlash: number[];
  laneHeld: boolean[];
  fx: FxSlot[];
  fxHead: number;
  /** notes 已按 abs 升序，扫描线之前的音都已判定 */
  scan: number;
  /** 当前浮点步位 / 上一帧步位（回绕检测） */
  pos: number;
  prevPos: number;
  /** 墙钟兜底起表时刻；-1 = 未起表 */
  t0: number;
  /** 一个 16 分的秒数，随 Transport BPM 实时更新 */
  stepSeconds: number;
  /** 最近一次连击变化时刻（combo 数字弹性缩放用） */
  comboAt: number;
}

const freshRun = (notes: RhythmNote[], stepSeconds: number): RunState => ({
  notes,
  flags: new Int8Array(notes.length).fill(-1),
  score: 0,
  combo: 0,
  maxCombo: 0,
  counts: [0, 0, 0, 0],
  laneFlash: [-1e9, -1e9, -1e9, -1e9],
  laneHeld: [false, false, false, false],
  fx: Array.from({ length: FX_SLOTS }, () => ({ at: -1e9, lane: 0, tier: -1 })),
  fxHead: 0,
  scan: 0,
  pos: 0,
  prevPos: 0,
  t0: -1,
  stepSeconds,
  comboAt: -1e9,
});

export interface RhythmResult {
  score: number;
  acc: number;
  counts: [number, number, number, number];
  maxCombo: number;
  total: number;
  rank: string;
  rankColor: string;
}

export type RhythmPhase = 'idle' | 'run' | 'result';

export function useRhythmRun(viz: VizSong | null) {
  const notes = useMemo(() => buildRhythmNotes(viz), [viz]);
  const fallbackStepSeconds = viz ? 60 / viz.bpm / 4 : 0.125;
  const totalSteps = viz ? viz.totalBars * 16 : 1;

  /** 轨道按下态订阅者（DOM 打击块镜像用，只在 press/release 时回调） */
  const laneSubs = useRef(new Set<(held: boolean[]) => void>());
  const runRef = useRef<RunState>(freshRun([], fallbackStepSeconds));
  const [phase, setPhase] = useState<RhythmPhase>('idle');
  const [result, setResult] = useState<RhythmResult | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const isPlaying = useUiStore((s) => s.isPlaying);
  const setPlayMode = useUiStore((s) => s.setPlayMode);

  /* 换曲即回 attract */
  useEffect(() => {
    setPhase('idle');
    setResult(null);
  }, [viz]);

  const pushFx = (g: RunState, lane: number, tier: number, at: number) => {
    const slot = g.fx[g.fxHead];
    slot.at = at;
    slot.lane = lane;
    slot.tier = tier;
    g.fxHead = (g.fxHead + 1) % FX_SLOTS;
  };

  const finish = useCallback(() => {
    const g = runRef.current;
    const judged = g.counts[0] + g.counts[1] + g.counts[2] + g.counts[3];
    const total = g.notes.length;
    /* 未扫到的尾音按 miss 记 */
    const counts: [number, number, number, number] = [
      g.counts[0],
      g.counts[1],
      g.counts[2],
      g.counts[3] + Math.max(0, total - judged),
    ];
    const acc = total ? ((counts[0] * 300 + counts[1] * 200 + counts[2] * 100) / (total * 300)) * 100 : 0;
    const rank = acc >= 95 ? 'S' : acc >= 88 ? 'A' : acc >= 75 ? 'B' : acc >= 60 ? 'C' : 'D';
    const rankColor =
      acc >= 95 ? '#FFE600' : acc >= 88 ? '#39FF88' : acc >= 75 ? '#00E5FF' : acc >= 60 ? '#A78BFA' : '#FF3DBE';
    engine.stop();
    setResult({ score: g.score, acc, counts, maxCombo: g.maxCombo, total, rank, rankColor });
    setPhase('result');
  }, []);

  /** 中途退出（Esc / 撤销 / 工程被换掉）：不结算，直接回 attract */
  const bail = useCallback(() => {
    engine.stop();
    const g = runRef.current;
    if (g.laneHeld.some(Boolean)) {
      g.laneHeld.fill(false);
      laneSubs.current.forEach((cb) => cb(g.laneHeld));
    }
    runRef.current = freshRun([], fallbackStepSeconds);
    setResult(null);
    setPhase('idle');
  }, [fallbackStepSeconds]);

  const start = useCallback(async () => {
    if (!viz || !notes.length || phaseRef.current === 'run') return;
    /* 挑战打的是抽出来的整曲，Pattern 模式下先切回 Song */
    if (useUiStore.getState().playMode !== 'song') setPlayMode('song');
    const g = freshRun(notes, 60 / viz.bpm / 4);
    runRef.current = g;
    setResult(null);
    engine.seekStep(0);
    /* 起表可能因音频上下文未解锁而失败：失败就留在 attract，不带病进 run */
    const ok = await engine.play();
    if (!ok) {
      runRef.current = freshRun([], 60 / viz.bpm / 4);
      return;
    }
    /* Transport 已归零，墙钟兜底锚点≈此刻 */
    g.t0 = performance.now();
    setPhase('run');
  }, [viz, notes, setPlayMode]);

  /* 演奏中引擎被外部停掉 → 直接结算 */
  useEffect(() => {
    if (phaseRef.current === 'run' && !isPlaying) finish();
  }, [isPlaying, finish]);

  /* 撤销 / 重做会换掉工程，viz 立刻变陈 → 退出本局 */
  useEffect(() => {
    if (phase !== 'run') return;
    return useHistoryStore.subscribe((s, prev) => {
      if (s.past !== prev.past || s.future !== prev.future) bail();
    });
  }, [phase, bail]);

  /** 轨道按下态订阅者（DOM 打击块镜像用，只在 press/release 时回调） */
  const subscribeLanes = useCallback((cb: (held: boolean[]) => void) => {
    laneSubs.current.add(cb);
    return () => {
      laneSubs.current.delete(cb);
    };
  }, []);
  const notifyLanes = (g: RunState) => {
    for (const cb of laneSubs.current) cb(g.laneHeld);
  };

  const press = useCallback((lane: number) => {
    const g = runRef.current;
    if (phaseRef.current !== 'run' || lane < 0 || lane >= LANES) return;
    if (g.laneHeld[lane]) return; // 长按不连击
    g.laneHeld[lane] = true;
    notifyLanes(g);
    const now = performance.now();
    const goodSteps = JUDGE_MS[2] / 1000 / g.stepSeconds;
    let best = -1;
    let bestDt = Infinity;
    for (let i = g.scan; i < g.notes.length; i++) {
      const n = g.notes[i];
      if (n.abs - g.pos > goodSteps) break;
      if (g.flags[i] !== -1 || n.lane !== lane) continue;
      const dt = Math.abs(n.abs - g.pos);
      if (dt <= goodSteps && dt < bestDt) {
        bestDt = dt;
        best = i;
      }
    }
    if (best < 0) return; // 空击不罚
    const tier =
      bestDt <= JUDGE_MS[0] / 1000 / g.stepSeconds ? 0 : bestDt <= JUDGE_MS[1] / 1000 / g.stepSeconds ? 1 : 2;
    g.flags[best] = (tier + 1) as 1 | 2 | 3;
    g.counts[tier] += 1;
    g.score += JUDGE_SCORE[tier];
    g.combo += 1;
    g.comboAt = now;
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    g.laneFlash[lane] = now;
    pushFx(g, lane, tier, now);
  }, []);

  const release = useCallback((lane: number) => {
    if (lane < 0 || lane >= LANES) return;
    const g = runRef.current;
    if (!g.laneHeld[lane]) return;
    g.laneHeld[lane] = false;
    notifyLanes(g);
  }, []);

  /* 桌面键盘：只在 run 期间接管，按 e.code 匹配物理键位（与输入法 / 大小写无关） */
  useEffect(() => {
    if (phase !== 'run') return;
    const laneOf = (e: KeyboardEvent) => CODE_TO_LANE[e.code];
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const lane = laneOf(e);
      if (lane === undefined) return;
      e.preventDefault();
      press(lane);
    };
    const up = (e: KeyboardEvent) => {
      const lane = laneOf(e);
      if (lane !== undefined) release(lane);
    };
    const blur = () => {
      const g = runRef.current;
      if (g.laneHeld.some(Boolean)) {
        g.laneHeld.fill(false);
        notifyLanes(g);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') bail();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keydown', esc);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keydown', esc);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      runRef.current.laneHeld.fill(false);
      notifyLanes(runRef.current);
    };
  }, [phase, press, release, bail]);

  /* ---------- 逻辑帧：推进播放头 + miss 扫描 + 曲终判定 ---------- */
  useEffect(() => {
    if (phase !== 'run') return;
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const g = runRef.current;
      const live = engine.getLivePosition();
      if (live) {
        g.pos = live.stepFloat;
        g.stepSeconds = live.stepSeconds;
      } else {
        if (g.t0 < 0) g.t0 = now;
        g.pos = Math.max(0, (now - g.t0) / 1000 / g.stepSeconds);
      }
      /* 循环区间回绕（loopOn 默认开）= 放完一遍 */
      if (g.pos + 0.5 < g.prevPos) {
        finish();
        return;
      }
      g.prevPos = g.pos;
      const goodSteps = JUDGE_MS[2] / 1000 / g.stepSeconds;
      while (g.scan < g.notes.length && g.notes[g.scan].abs + goodSteps < g.pos) {
        if (g.flags[g.scan] === -1) {
          g.flags[g.scan] = 0;
          g.counts[3] += 1;
          g.combo = 0;
          pushFx(g, g.notes[g.scan].lane, 3, now);
        }
        g.scan += 1;
      }
      if (g.pos >= totalSteps - 0.5) {
        finish();
        return;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, finish, totalSteps]);

  return {
    phase,
    phaseRef,
    result,
    notes,
    totalSteps,
    runRef,
    subscribeLanes,
    start,
    bail,
    press,
    release,
  };
}
