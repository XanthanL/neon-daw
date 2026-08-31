/**
 * 节奏挑战画布（纯渲染叶子）
 * · 只读 runRef / phaseRef，不持有一局的状态：卡片与全屏演奏层各自挂一份互不打断
 * · 几何（轨宽 / 判定线 / 像素每步）只在尺寸变化时重算，渐变按轨预建，
 *   字体串与色串按档位预生成 —— 逐帧零分配是流畅的前提
 * · 画风对齐三明治贴纸：ink 描边 + 每轨霓虹色 + 硬阴影，只有靠近判定线的音符开 glow
 */
import { useEffect, useMemo, useRef } from 'react';
import { engine } from '../../audio/engine';
import type { VizSong } from '../../utils/music/types';
import {
  FX_LIFE,
  JUDGE_COLOR,
  JUDGE_LABEL,
  LANES,
  LANE_COLOR,
  type RunState,
  type RhythmPhase,
} from './useRhythmRun';

const INK = '#17171C';
const F_SMALL = '800 10px system-ui, sans-serif';
const F_HUD = '800 13px system-ui, sans-serif';
const F_COMBO = '900 26px system-ui, sans-serif';
const F_HINT = '800 12px system-ui, sans-serif';
/** 判定弹字按 8 档字号预生成，避免逐帧拼字符串 */
const F_POPUP = Array.from(
  { length: 8 },
  (_, i) => `900 ${12 + (i / 7) * 2}px system-ui, sans-serif`,
);
/** 频谱条透明度分 24 档预生成 */
const SPEC_FILL = Array.from({ length: 24 }, (_, i) => `rgba(0,229,255,${(0.2 + (i / 23) * 0.6).toFixed(3)})`);
const PAD_X = 6;
const RAIL_H = 5;
const SPECTRUM_BARS = 28;
const FLASH_H = 130;

/** 环境音符（attract 背景）：纯静态数据，模块级常量 */
const AMBIENT = Array.from({ length: 22 }, (_, i) => ({
  x: ((i * 37) % 100) / 100,
  speed: 0.014 + ((i * 13) % 9) / 650,
  size: 3 + ((i * 7) % 5),
  hue: LANE_COLOR[i % 4],
}));

function makeRoundRect(ctx: CanvasRenderingContext2D) {
  if (typeof ctx.roundRect === 'function') {
    return (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    };
  }
  return (x: number, y: number, w: number, h: number, r: number) => {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  };
}

export function RhythmCanvas({
  runRef,
  phaseRef,
  viz,
  totalSteps,
  ariaLabel,
  hintText,
  emptyText,
  className = '',
}: {
  runRef: React.MutableRefObject<RunState>;
  phaseRef: React.MutableRefObject<RhythmPhase>;
  viz: VizSong | null;
  totalSteps: number;
  ariaLabel: string;
  hintText: string;
  emptyText: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* 段落刻度（0..1 位置）：只随 viz 变化 */
  const sectionMarks = useMemo(
    () => (viz ? viz.sections.map((s) => (s.startBar * 16) / (viz.totalBars * 16)) : []),
    [viz],
  );
  const marksRef = useRef(sectionMarks);
  marksRef.current = sectionMarks;
  const textsRef = useRef({ hint: hintText, empty: emptyText });
  textsRef.current = { hint: hintText, empty: emptyText };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rr = makeRoundRect(ctx);

    const geo = {
      w: 0,
      h: 0,
      dpr: 0,
      top: 0,
      hitY: 0,
      laneW: 0,
      noteW: 0,
      laneX: new Float64Array(LANES),
      stepSeconds: -1,
      pxPerStep: 1,
      lookahead: 1,
      /** 每轨一条预建闪重渐变（强弱靠 globalAlpha） */
      flashGrad: [] as CanvasGradient[],
    };

    const fit = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(80, rect.width);
      const h = Math.max(120, rect.height);
      if (w === geo.w && h === geo.h && dpr === geo.dpr) return;
      geo.w = w;
      geo.h = h;
      geo.dpr = dpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      geo.top = RAIL_H + 16;
      geo.hitY = h - 24;
      geo.laneW = (w - PAD_X * 2) / LANES;
      for (let l = 0; l < LANES; l++) geo.laneX[l] = PAD_X + l * geo.laneW;
      geo.noteW = geo.laneW - 10;
      geo.stepSeconds = -1; // 迫使重算视口速度
      geo.flashGrad.length = 0;
      for (let l = 0; l < LANES; l++) {
        const grad = ctx.createLinearGradient(0, geo.hitY - FLASH_H, 0, geo.hitY);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, LANE_COLOR[l]);
        geo.flashGrad.push(grad);
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    /* ---------- attract 文案换行（尺寸或文案变了才重排） ---------- */
    const wrapCache = { key: '', lines: [] as string[] };
    const hintLines = (text: string) => {
      const max = geo.w - 20;
      const key = `${text}|${Math.round(max)}`;
      if (wrapCache.key === key) return wrapCache.lines;
      const lines: string[] = [];
      let cur = '';
      const flush = () => {
        if (cur) lines.push(cur);
        cur = '';
      };
      for (const word of text.split(' ')) {
        const next = cur ? `${cur} ${word}` : word;
        if (cur && ctx.measureText(next).width > max) {
          flush();
          cur = word;
        } else cur = next;
      }
      flush();
      /* 一整段无空格（中文）→ 逐字切 */
      if (lines.length === 1 && ctx.measureText(lines[0]).width > max) {
        const s = lines[0];
        lines.length = 0;
        for (const ch of s) {
          if (cur && ctx.measureText(cur + ch).width > max) {
            flush();
            cur = ch;
          } else cur += ch;
        }
        flush();
      }
      wrapCache.key = key;
      wrapCache.lines = lines.slice(0, 3);
      return wrapCache.lines;
    };

    /* ---------- HUD 文本（数值不变就不重新格式化） ---------- */
    const hud = { score: -1, scoreText: '', combo: -1, comboText: '' };

    const paintRun = (now: number, g: RunState) => {
      const { w, h, laneW, noteW, hitY, top, laneX } = geo;

      if (geo.stepSeconds !== g.stepSeconds) {
        geo.stepSeconds = g.stepSeconds;
        geo.lookahead = 2.6 / g.stepSeconds;
        geo.pxPerStep = (hitY - top - 10) / geo.lookahead;
      }
      const lookahead = geo.lookahead;
      const pxPerStep = geo.pxPerStep;

      /* 轨道底 + 拍/小节格 */
      ctx.fillStyle = 'rgba(23,23,28,0.035)';
      ctx.fillRect(PAD_X, top, w - PAD_X * 2, hitY - top);
      const from = Math.max(0, Math.floor(g.pos - (hitY - top) / pxPerStep));
      const to = Math.min(totalSteps, Math.ceil(g.pos) + 1);
      for (let s = from; s <= to; s++) {
        const bar = s % 16 === 0;
        if (!bar && s % 4 !== 0) continue;
        const y = hitY - (s - g.pos) * pxPerStep;
        if (y < top || y > hitY) continue;
        ctx.fillStyle = bar ? 'rgba(23,23,28,0.16)' : 'rgba(23,23,28,0.07)';
        ctx.fillRect(PAD_X, y - 1, w - PAD_X * 2, bar ? 2 : 1);
      }
      ctx.fillStyle = 'rgba(23,23,28,0.12)';
      for (let l = 1; l < LANES; l++) ctx.fillRect(laneX[l] - 1, top, 1, hitY - top);

      /* 击打余辉 */
      for (let l = 0; l < LANES; l++) {
        const flash = Math.max(0, 1 - (now - g.laneFlash[l]) / 240);
        const held = g.laneHeld[l];
        if (flash <= 0 && !held) continue;
        ctx.save();
        ctx.globalAlpha = Math.min(1, flash * 0.55 + (held ? 0.14 : 0));
        ctx.fillStyle = geo.flashGrad[l];
        ctx.fillRect(laneX[l], hitY - FLASH_H, laneW - 2, FLASH_H);
        ctx.restore();
      }

      /* 下落音符 */
      for (let i = g.scan; i < g.notes.length; i++) {
        const n = g.notes[i];
        const d = n.abs - g.pos;
        if (d > lookahead) break;
        if (g.flags[i] !== -1) continue;
        const hh = Math.max(12, Math.min(30, n.len * pxPerStep * 0.85));
        const near = Math.max(0, 1 - Math.abs(d) / 3);
        const grow = near * 2.2;
        const x = laneX[n.lane] + 5 - grow / 2;
        const y = Math.min(hitY - 6, hitY - d * pxPerStep) - grow / 2;
        const nw = noteW + grow;
        const nh = hh + grow;
        if (near > 0.25) {
          ctx.shadowColor = LANE_COLOR[n.lane];
          ctx.shadowBlur = 4 + near * 10;
        }
        ctx.fillStyle = LANE_COLOR[n.lane];
        rr(x, y, nw, nh, 7);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(23,23,28,0.8)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      /* 判定线：ink 实线 + 硬阴影 */
      ctx.fillStyle = 'rgba(23,23,28,0.18)';
      ctx.fillRect(4, hitY + 3, w - 8, 3);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(4, hitY);
      ctx.lineTo(w - 4, hitY);
      ctx.stroke();

      /* 命中爆点 + 判定弹字：读环形缓冲，不做 filter */
      for (let s = 0; s < g.fx.length; s++) {
        const fx = g.fx[s];
        if (fx.tier < 0) continue;
        const k = (now - fx.at) / FX_LIFE;
        if (k < 0 || k >= 1) continue;
        const cx = laneX[fx.lane] + laneW / 2;
        ctx.globalAlpha = 1 - k;
        if (fx.tier < 3) {
          ctx.strokeStyle = JUDGE_COLOR[fx.tier];
          ctx.lineWidth = 2.5;
          const ring = 12 + k * 20;
          rr(cx - ring, hitY - ring, ring * 2, ring * 2, 10);
          ctx.stroke();
          ctx.fillStyle = JUDGE_COLOR[fx.tier];
          for (let d = 0; d < 6; d++) {
            const ang = (d / 6) * Math.PI * 2 + k;
            const dist = 14 + k * 30;
            rr(cx + Math.cos(ang) * dist - 2, hitY + Math.sin(ang) * dist * 0.55 - 2, 4, 4, 1.5);
            ctx.fill();
          }
        }
        ctx.fillStyle = JUDGE_COLOR[fx.tier];
        ctx.strokeStyle = 'rgba(23,23,28,0.85)';
        ctx.lineWidth = 2.5;
        ctx.textAlign = 'center';
        ctx.font = F_POPUP[Math.min(7, Math.floor((1 - k) * 8))];
        const ty = hitY - 18 - k * 26;
        ctx.strokeText(JUDGE_LABEL[fx.tier], cx, ty);
        ctx.fillText(JUDGE_LABEL[fx.tier], cx, ty);
        ctx.globalAlpha = 1;
      }

      /* 顶部三明治导轨 + 段落刻度 */
      const marks = marksRef.current;
      ctx.fillStyle = 'rgba(23,23,28,0.12)';
      ctx.fillRect(0, 0, w, RAIL_H);
      ctx.fillStyle = '#00E5FF';
      ctx.fillRect(0, 0, (w * Math.min(g.pos, totalSteps)) / totalSteps, RAIL_H);
      ctx.fillStyle = 'rgba(23,23,28,0.5)';
      for (let i = 1; i < marks.length; i++) ctx.fillRect(marks[i] * w, 0, 1.5, RAIL_H);

      /* HUD */
      if (hud.score !== g.score) {
        hud.score = g.score;
        hud.scoreText = String(g.score).padStart(6, '0');
      }
      ctx.fillStyle = 'rgba(23,23,28,0.85)';
      ctx.font = F_HUD;
      ctx.textAlign = 'left';
      ctx.fillText(hud.scoreText, 8, top - 2);
      if (g.combo >= 3) {
        const since = (now - g.comboAt) / 180;
        const pop = since < 1 ? 1 + (1 - since) * 0.35 : 1;
        if (hud.combo !== g.combo) {
          hud.combo = g.combo;
          hud.comboText = String(g.combo);
        }
        ctx.save();
        ctx.translate(w / 2, top + (hitY - top) * 0.34);
        ctx.scale(pop, pop);
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(23,23,28,0.72)';
        ctx.font = F_COMBO;
        ctx.fillText(hud.comboText, 0, 0);
        ctx.font = F_SMALL;
        ctx.fillText('COMBO', 0, 14);
        ctx.restore();
      }

      /* 底部 Master 频谱 */
      const spec = engine.getSpectrum();
      const bw = (w - 8) / SPECTRUM_BARS;
      for (let i = 0; i < SPECTRUM_BARS; i++) {
        const db = spec[Math.floor((i / SPECTRUM_BARS) * spec.length)] ?? -100;
        const v = Math.max(0, Math.min(1, (db + 92) / 78));
        ctx.fillStyle = SPEC_FILL[Math.round(v * 23)];
        rr(4 + i * bw, h - 5 - (2 + v * 14), Math.max(2, bw - 2.5), 2 + v * 14, 2);
        ctx.fill();
      }
    };

    const paintAmbient = (now: number) => {
      const { w, h } = geo;
      for (const a of AMBIENT) {
        const y = ((now * a.speed + a.x * h * 7) % (h + 30)) - 15;
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = a.hue;
        ctx.beginPath();
        ctx.arc(a.x * (w - 24) + 12, y, a.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (phaseRef.current !== 'idle') return;
      ctx.fillStyle = 'rgba(23,23,28,0.55)';
      ctx.font = F_HINT;
      ctx.textAlign = 'center';
      const texts = textsRef.current;
      const lines = hintLines(viz ? texts.hint : texts.empty);
      for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], w / 2, h - 34 + (i - 2) * 15);
    };

    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, geo.w, geo.h);
      if (phaseRef.current === 'run' && viz) paintRun(now, runRef.current);
      else paintAmbient(now);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [phaseRef, runRef, totalSteps, viz]);

  return (
    <div ref={wrapRef} className={`relative min-h-0 flex-1 touch-none ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={ariaLabel} />
    </div>
  );
}
