/**
 * 节奏挑战（键 7 右栏 / 移动端卡片下模块）
 * · 抽到的曲子主旋律化为 4 轨下落音符：桌面 D F J K 击打，手机直接点按轨道
 * · 判定 Perfect/Great/Good/Miss + 连击；播放头与引擎严格同步（useVizClock）
 * · 完整放完一轮（或中途停止播放）弹出结算：分数 / 准度 / 全计数 / 评级 S~D
 * · 未抽卡时是环境音符 attract 页；底部保留 Master 频谱条
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { engine } from '../../audio/engine';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import type { VizSong } from '../../utils/music/types';
import { buildRhythmNotes, type RhythmNote } from './viz';

const LANES = 4;
const KEY_LABELS = ['D', 'F', 'J', 'K'];
const KEY_TO_LANE: Record<string, number> = { d: 0, f: 1, j: 2, k: 3 };
const LANE_COLOR = ['#00E5FF', '#FF3DBE', '#FFE600', '#39FF88'];
const JUDGE_MS = [70, 130, 200]; // Perfect / Great / Good
const JUDGE_SCORE = [300, 200, 100];
const JUDGE_LABEL = ['PERFECT', 'GREAT', 'GOOD', 'MISS'];
const JUDGE_COLOR = ['#FFE600', '#39FF88', '#00E5FF', '#FF3DBE'];

interface RunState {
  notes: RhythmNote[];
  /** -1 待击打，0 miss，1..3 判定档 */
  flags: Int8Array;
  score: number;
  combo: number;
  maxCombo: number;
  counts: [number, number, number, number]; // perfect/great/good/miss
  laneFlash: number[];
  laneHeld: boolean[];
  popups: { text: string; color: string; at: number; lane: number }[];
  scan: number;
  /** 本局起表时刻；-1 = 等第一个 step 回调起表（引擎启动有异步延迟） */
  t0: number;
  pos: number;
}

const freshRun = (notes: RhythmNote[]): RunState => ({
  notes,
  flags: new Int8Array(notes.length).fill(-1),
  score: 0,
  combo: 0,
  maxCombo: 0,
  counts: [0, 0, 0, 0],
  laneFlash: [0, 0, 0, 0],
  laneHeld: [false, false, false, false],
  popups: [],
  scan: 0,
  t0: -1,
  pos: 0,
});

interface FinalResult {
  score: number;
  acc: number;
  counts: [number, number, number, number];
  maxCombo: number;
  total: number;
  rank: string;
  rankColor: string;
}

export function RhythmGame({ viz, className = '' }: { viz: VizSong | null; className?: string }) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const notes = useMemo(() => buildRhythmNotes(viz), [viz]);
  const runRef = useRef<RunState>(freshRun([]));
  const [phase, setPhase] = useState<'idle' | 'run' | 'result'>('idle');
  const [result, setResult] = useState<FinalResult | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  /* 换曲即回 attract */
  useEffect(() => {
    setPhase('idle');
    setResult(null);
  }, [viz]);

  const totalSteps = viz ? viz.totalBars * 16 : 1;
  const stepMs = viz ? 60000 / viz.bpm / 4 : 250;

  const finish = useCallback(() => {
    const g = runRef.current;
    const judged = g.counts[0] + g.counts[1] + g.counts[2] + g.counts[3];
    const total = g.notes.length;
    /* 未扫到的尾音按 miss 记 */
    const unjudged = Math.max(0, total - judged);
    const counts: [number, number, number, number] = [g.counts[0], g.counts[1], g.counts[2], g.counts[3] + unjudged];
    const acc = total ? ((counts[0] * 300 + counts[1] * 200 + counts[2] * 100) / (total * 300)) * 100 : 0;
    const rank = acc >= 95 ? 'S' : acc >= 88 ? 'A' : acc >= 75 ? 'B' : acc >= 60 ? 'C' : 'D';
    const rankColor = acc >= 95 ? '#FFE600' : acc >= 88 ? '#39FF88' : acc >= 75 ? '#00E5FF' : acc >= 60 ? '#A78BFA' : '#FF3DBE';
    engine.stop();
    setResult({ score: g.score, acc, counts, maxCombo: g.maxCombo, total, rank, rankColor });
    setPhase('result');
  }, []);

  const start = useCallback(() => {
    if (!viz || !notes.length) return;
    runRef.current = freshRun(notes);
    engine.seekStep(0);
    /* seek 之后起表：Transport 已归零，音频起点≈此刻 */
    runRef.current.t0 = performance.now();
    void engine.play();
    setPhase('run');
  }, [viz, notes]);

  /* 演奏中引擎被外部停掉 → 直接结算 */
  useEffect(() => {
    if (phaseRef.current === 'run' && !isPlaying) finish();
  }, [isPlaying, finish]);

  const press = useCallback(
    (lane: number) => {
      const g = runRef.current;
      if (phaseRef.current !== 'run') return;
      g.laneHeld[lane] = true;
      const goodSteps = JUDGE_MS[2] / stepMs;
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
      const tier = bestDt <= JUDGE_MS[0] / stepMs ? 0 : bestDt <= JUDGE_MS[1] / stepMs ? 1 : 2;
      g.flags[best] = (tier + 1) as 1 | 2 | 3;
      g.counts[tier] += 1;
      g.score += JUDGE_SCORE[tier];
      g.combo += 1;
      g.maxCombo = Math.max(g.maxCombo, g.combo);
      g.laneFlash[lane] = performance.now();
      g.popups.push({ text: JUDGE_LABEL[tier], color: JUDGE_COLOR[tier], at: performance.now(), lane });
    },
    [stepMs],
  );

  /* 桌面键盘 */
  useEffect(() => {
    if (phase !== 'run') return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const lane = KEY_TO_LANE[e.key.toLowerCase()];
      if (lane === undefined) return;
      e.preventDefault();
      press(lane);
    };
    const up = (e: KeyboardEvent) => {
      const lane = KEY_TO_LANE[e.key.toLowerCase()];
      if (lane !== undefined) runRef.current.laneHeld[lane] = false;
    };
    const blur = () => runRef.current.laneHeld.fill(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [phase, press]);

  /* ---------- 画布主循环 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!ctx.roundRect) {
      const rr = (x: number, y: number, rw: number, rh: number, r: number) => {
        const rad = Math.min(r, rw / 2, rh / 2);
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + rw, y, x + rw, y + rh, rad);
        ctx.arcTo(x + rw, y + rh, x, y + rh, rad);
        ctx.arcTo(x, y + rh, x, y, rad);
        ctx.arcTo(x, y, x + rw, y, rad);
        ctx.closePath();
      };
      (ctx as { roundRect?: unknown }).roundRect = (a: number, b: number, c: number, d: number, e: number) =>
        rr(a, b, c, d, typeof e === 'number' ? e : 0);
    }

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(80, r.width);
      h = Math.max(120, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const ambient = Array.from({ length: 22 }, (_, i) => ({
      x: ((i * 37) % 100) / 100,
      speed: 0.014 + ((i * 13) % 9) / 650,
      size: 3 + ((i * 7) % 5),
      hue: LANE_COLOR[i % 4],
    }));

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, w, h);
      const g = runRef.current;
      const hitY = h - 76;
      const laneW = (w - 12) / LANES;
      const laneX = (l: number) => 6 + l * laneW;

      if (phaseRef.current === 'run' && viz) {
        /* 本局独立计时：起局时已 seekStep(0) 并起表；未起表帧兜底为当前刻 */
        if (g.t0 < 0) g.t0 = now;
        g.pos = Math.max(0, (now - g.t0) / stepMs);
        const goodSteps = JUDGE_MS[2] / stepMs;
        /* miss 扫描 */
        while (g.scan < g.notes.length && g.notes[g.scan].abs + goodSteps < g.pos) {
          if (g.flags[g.scan] === -1) {
            g.flags[g.scan] = 0;
            g.counts[3] += 1;
            g.combo = 0;
            g.popups.push({ text: JUDGE_LABEL[3], color: JUDGE_COLOR[3], at: now, lane: g.notes[g.scan].lane });
          }
          g.scan += 1;
        }
        if (g.pos >= totalSteps - 0.5) {
          finish();
          return;
        }

        /* 轨道底纹 + 分隔 */
        for (let l = 0; l < LANES; l++) {
          ctx.fillStyle = g.laneHeld[l] ? `${LANE_COLOR[l]}14` : 'rgba(23,23,28,0.03)';
          ctx.fillRect(laneX(l), 8, laneW - 2, hitY - 8);
          const flash = Math.max(0, 1 - (now - g.laneFlash[l]) / 240);
          if (flash > 0) {
            const grad = ctx.createLinearGradient(0, hitY - 120, 0, hitY);
            grad.addColorStop(0, 'rgba(255,255,255,0)');
            grad.addColorStop(1, LANE_COLOR[l] + Math.round(flash * 120).toString(16).padStart(2, '0'));
            ctx.fillStyle = grad;
            ctx.fillRect(laneX(l), Math.max(8, hitY - 120), laneW - 2, 120);
          }
        }
        ctx.strokeStyle = 'rgba(23,23,28,0.12)';
        ctx.lineWidth = 1;
        for (let l = 1; l < LANES; l++) {
          ctx.beginPath();
          ctx.moveTo(laneX(l) - 1, 8);
          ctx.lineTo(laneX(l) - 1, hitY);
          ctx.stroke();
        }

        /* 音符 */
        const lookaheadSteps = 2600 / stepMs;
        const pxPerStep = (hitY - 26) / lookaheadSteps;
        for (let i = g.scan; i < g.notes.length; i++) {
          const n = g.notes[i];
          if (n.abs - g.pos > lookaheadSteps) break;
          if (g.flags[i] !== -1) continue;
          const yTop = hitY - (n.abs - g.pos) * pxPerStep;
          const hh = Math.max(12, Math.min(30, n.len * pxPerStep * 0.85));
          if (yTop < -40) continue;
          const x = laneX(n.lane) + 5;
          ctx.fillStyle = LANE_COLOR[n.lane];
          ctx.strokeStyle = 'rgba(23,23,28,0.8)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.roundRect(x, Math.min(yTop, hitY - 6), laneW - 12, hh, 6);
          ctx.fill();
          ctx.stroke();
        }

        /* 判定线 */
        ctx.strokeStyle = 'rgba(23,23,28,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(4, hitY);
        ctx.lineTo(w - 4, hitY);
        ctx.stroke();

        /* 键位盒 */
        for (let l = 0; l < LANES; l++) {
          const active = g.laneHeld[l];
          const flash = Math.max(0, 1 - (now - g.laneFlash[l]) / 240);
          ctx.fillStyle = active || flash > 0.4 ? LANE_COLOR[l] : 'rgba(23,23,28,0.06)';
          ctx.strokeStyle = 'rgba(23,23,28,0.7)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.roundRect(laneX(l) + 5, hitY + 8, laneW - 12, 26, 8);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = active || flash > 0.4 ? '#17171C' : 'rgba(23,23,28,0.6)';
          ctx.font = '900 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(KEY_LABELS[l], laneX(l) + laneW / 2 - 1, hitY + 26);
        }

        /* 判定弹字 */
        g.popups = g.popups.filter((p) => now - p.at < 560);
        for (const p of g.popups) {
          const k = (now - p.at) / 560;
          ctx.save();
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.color;
          ctx.strokeStyle = 'rgba(23,23,28,0.85)';
          ctx.lineWidth = 2.5;
          ctx.font = `900 ${12 + (1 - k) * 2}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          const x = laneX(p.lane) + laneW / 2;
          const y = hitY - 18 - k * 26;
          ctx.strokeText(p.text, x, y);
          ctx.fillText(p.text, x, y);
          ctx.restore();
        }

        /* HUD：分数 + 连击 + 进度 */
        ctx.fillStyle = 'rgba(23,23,28,0.85)';
        ctx.font = '800 13px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(String(g.score).padStart(6, '0'), 8, 20);
        if (g.combo >= 3) {
          ctx.textAlign = 'center';
          ctx.font = '900 26px system-ui, sans-serif';
          ctx.fillStyle = 'rgba(23,23,28,0.75)';
          ctx.fillText(String(g.combo), w / 2, hitY / 2);
          ctx.font = '800 10px system-ui, sans-serif';
          ctx.fillText('COMBO', w / 2, hitY / 2 + 14);
        }
        ctx.fillStyle = 'rgba(23,23,28,0.1)';
        ctx.fillRect(0, 0, w, 4);
        ctx.fillStyle = '#00E5FF';
        ctx.fillRect(0, 0, (w * Math.min(g.pos, totalSteps)) / totalSteps, 4);

        /* 底部频谱 */
        const spec = engine.getSpectrum();
        const bars = 28;
        const bw = (w - 8) / bars;
        for (let i = 0; i < bars; i++) {
          const db = spec[Math.floor((i / bars) * spec.length)] ?? -100;
          const v = Math.max(0, Math.min(1, (db + 92) / 78));
          ctx.fillStyle = `rgba(0,229,255,${0.2 + v * 0.6})`;
          ctx.beginPath();
          ctx.roundRect(4 + i * bw, h - 3 - (2 + v * 14), Math.max(2, bw - 2.5), 2 + v * 14, 2);
          ctx.fill();
        }
        return;
      }

      /* ---------- attract / result 背景 ---------- */
      for (const a of ambient) {
        const y = ((now * a.speed + a.x * h * 7) % (h + 30)) - 15;
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = a.hue;
        ctx.beginPath();
        ctx.arc(a.x * (w - 24) + 12, y, a.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (phaseRef.current === 'idle') {
        ctx.fillStyle = 'rgba(23,23,28,0.55)';
        ctx.font = '800 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const label = viz ? t.random.rhythmHint : t.random.vizIdle;
        const words = label.split(' ');
        let lines: string[] = [];
        for (const wd of words) {
          const last = lines[lines.length - 1];
          if (last && ctx.measureText(last + ' ' + wd).width > w - 20) lines.push(wd);
          else if (last) lines[lines.length - 1] = last + ' ' + wd;
          else lines.push(wd);
        }
        if (lines.length === 1 && ctx.measureText(lines[0]).width > w - 20) {
          const s = lines[0];
          lines = [];
          let cur = '';
          for (const ch of s) {
            if (ctx.measureText(cur + ch).width > w - 20) {
              lines.push(cur);
              cur = ch;
            } else cur += ch;
          }
          if (cur) lines.push(cur);
        }
        lines.slice(0, 3).forEach((ln, li) => ctx.fillText(ln, w / 2, h - 34 + (li - 2) * 15));
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [viz, phase, stepMs, totalSteps, finish, t]);

  /* 移动端点按轨道 */
  const pointerLane = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(LANES - 1, Math.floor(((x - 6) / (rect.width - 12)) * LANES)));
  };

  return (
    <div ref={wrapRef} className={`relative min-h-0 flex-1 touch-none ${className}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label={t.random.rhythm}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          press(pointerLane(e));
        }}
        onPointerUp={(e) => {
          runRef.current.laneHeld[pointerLane(e)] = false;
        }}
        onPointerCancel={(e) => {
          runRef.current.laneHeld[pointerLane(e)] = false;
        }}
      />

      {/* 开始按钮 */}
      {phase === 'idle' && viz && notes.length > 0 && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={start}
          whileTap={{ scale: 0.94 }}
          className="absolute inset-x-0 top-[38%] mx-auto w-max cursor-pointer rounded-2xl border-2 border-ink bg-neon-cyan px-5 py-2.5 text-sm font-black text-ink shadow-hard select-none"
        >
          ▶ {t.random.rhythmStart}
        </motion.button>
      )}

      {/* 结算面板 */}
      {phase === 'result' && result && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-bg-warm/92 p-3 text-center backdrop-blur-[2px]"
        >
          <span
            className="grid h-12 w-12 place-items-center rounded-xl border-2 border-ink text-2xl font-black text-ink"
            style={{ background: result.rankColor, boxShadow: `2px 2px 0 #17171C, 0 0 16px ${result.rankColor}90` }}
          >
            {result.rank}
          </span>
          <span className="text-xl leading-none font-black text-ink tabular-nums">{result.score.toLocaleString()}</span>
          <span className="text-xs font-extrabold text-fg-muted tabular-nums">
            {t.random.accuracy} {result.acc.toFixed(1)}% · {t.random.maxCombo} ×{result.maxCombo}
          </span>
          <div className="mt-1 flex flex-wrap justify-center gap-1 text-[10px] font-black tabular-nums">
            {JUDGE_LABEL.map((label, i) => (
              <span key={label} className="rounded-md border border-ink/50 bg-white/70 px-1.5 py-0.5" style={{ color: JUDGE_COLOR[i] }}>
                {label} {result.counts[i]}
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={start}
              className="cursor-pointer rounded-lg border-2 border-ink bg-neon-cyan px-3 py-1.5 text-xs font-black text-ink shadow-hard-sm select-none active:translate-y-0.5 active:shadow-none"
            >
              {t.random.again2}
            </button>
            <button
              type="button"
              onClick={() => setPhase('idle')}
              className="cursor-pointer rounded-lg border-2 border-ink bg-card px-3 py-1.5 text-xs font-black text-ink shadow-hard-sm select-none active:translate-y-0.5 active:shadow-none"
            >
              {t.random.close}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
