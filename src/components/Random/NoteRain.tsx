/**
 * 音符雨（Random 可视化右栏 / 移动端横条）
 * · 生成的旋律 / 和声 / 低音 / 琶音音符自上而下落向判定线，x = 音高、色 = 角色、大小 = 力度
 * · 判定线下方 6 格鼓垫随鼓点闪烁，最底排 Master 频谱柱随响度起伏
 * · 段落切换瞬间在顶部弹出段落名横幅；未抽卡时退化为环境音符漂浮（呼吸感）
 */
import { useEffect, useMemo, useRef } from 'react';
import { engine } from '../../audio/engine';
import { useT } from '../../i18n/ui';
import type { DrumType } from '../../types/project';
import type { RoleId, VizSong } from '../../utils/music/types';
import { KIT_COLOR, KIT_ORDER, ROLE_COLOR, useVizClock } from './viz';

interface FlatNote {
  abs: number;
  len: number;
  pitch: number;
  vel: number;
  color: string;
}
interface FlatHit {
  abs: number;
  vel: number;
  kit: number;
}

export function NoteRain({ viz, className = '' }: { viz: VizSong | null; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getPos = useVizClock(viz);
  const t = useT();

  const flat = useMemo(() => {
    if (!viz) return null;
    const notes: FlatNote[] = [];
    const hits: FlatHit[] = [];
    let lo = 127;
    let hi = 0;
    for (const sec of viz.sections) {
      const base = sec.startBar * 16;
      for (const n of sec.notes) {
        notes.push({ abs: base + n.step, len: n.len, pitch: n.pitch, vel: n.vel, color: ROLE_COLOR[n.role as RoleId] ?? '#00E5FF' });
        if (n.pitch < lo) lo = n.pitch;
        if (n.pitch > hi) hi = n.pitch;
      }
      for (const d of sec.drums) hits.push({ abs: base + d.step, vel: d.vel, kit: KIT_ORDER.indexOf(d.kit as DrumType) });
    }
    notes.sort((a, b) => a.abs - b.abs);
    hits.sort((a, b) => a.abs - b.abs);
    if (hi - lo < 12) hi = lo + 12;
    return { notes, hits, lo, hi, totalSteps: viz.totalBars * 16, stepMs: 60000 / viz.bpm / 4 };
  }, [viz]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* 老浏览器没有 roundRect → 实例上补一个 */
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
      (ctx as { roundRect?: unknown }).roundRect = (a: number, b: number, c: number, d: number, e: number) => {
        rr(a, b, c, d, typeof e === 'number' ? e : 0);
      };
    }

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(80, r.width);
      h = Math.max(80, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    /* 环境音符（未抽卡时）：固定种子的漂浮点，随窗口变化分布 */
    const ambient = Array.from({ length: 26 }, (_, i) => ({
      x: ((i * 37) % 100) / 100,
      speed: 0.012 + ((i * 13) % 9) / 700,
      size: 3 + ((i * 7) % 5),
      hue: ['#00E5FF', '#FF3DBE', '#FFE600', '#39FF88', '#A78BFA'][i % 5],
    }));

    let lastSection = '';
    let sectionAt = -1e9;
    let banner = '';

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, w, h);
      const hitY = h - 46;

      if (!flat) {
        for (const a of ambient) {
          const y = ((now * a.speed + a.x * h * 7) % (h + 30)) - 15;
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = a.hue;
          ctx.beginPath();
          ctx.arc(a.x * (w - 24) + 12, y, a.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(23,23,28,0.55)';
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        /* 空闲提示按词拆成最多三行，避免窄面板被裁 */
        const words = t.random.vizIdle.split(' ');
        let lines: string[] = [];
        for (const wd of words) {
          const last = lines[lines.length - 1];
          if (last && ctx.measureText(last + ' ' + wd).width > w - 24) lines.push(wd);
          else if (last) lines[lines.length - 1] = last + ' ' + wd;
          else lines.push(wd);
        }
        /* 无空格的长句（中文）→ 按字符断行 */
        if (lines.length === 1 && ctx.measureText(lines[0]).width > w - 24) {
          const s = lines[0];
          lines = [];
          let cur = '';
          for (const ch of s) {
            if (ctx.measureText(cur + ch).width > w - 24) {
              lines.push(cur);
              cur = ch;
            } else cur += ch;
          }
          if (cur) lines.push(cur);
        }
        lines.slice(0, 3).forEach((ln, li) => ctx.fillText(ln, w / 2, h / 2 - 12 + li * 15));
        return;
      }

      const pos = getPos();
      const lookaheadSteps = 4200 / flat.stepMs;
      const pxPerStep = (hitY - 8) / lookaheadSteps;
      const pitchToX = (p: number) => 10 + ((p - flat.lo) / (flat.hi - flat.lo)) * (w - 20);

      /* 小节线 */
      const firstBar = Math.max(0, Math.floor(pos / 16) - 1);
      for (let bar = firstBar; bar * 16 - pos < lookaheadSteps + 16; bar++) {
        const y = hitY - (bar * 16 - pos) * pxPerStep;
        if (y < -2 || y > hitY + 2) continue;
        ctx.strokeStyle = bar % 4 === 0 ? 'rgba(23,23,28,0.16)' : 'rgba(23,23,28,0.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(2, y);
        ctx.lineTo(w - 2, y);
        ctx.stroke();
      }

      /* 判定线 */
      ctx.strokeStyle = 'rgba(23,23,28,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, hitY);
      ctx.lineTo(w, hitY);
      ctx.stroke();

      /* 音符雨 */
      for (const n of flat.notes) {
        const top = n.abs;
        const bot = n.abs + n.len;
        if (pos > bot + 4) continue;
        if (top - pos > lookaheadSteps) break;
        const x = pitchToX(n.pitch);
        const yTop = hitY - (top - pos) * pxPerStep;
        const yBot = hitY - (pos - bot) * pxPerStep;
        const clippedTop = Math.max(-10, Math.min(yTop, hitY - 2));
        const clippedBot = Math.max(clippedTop + 5, Math.min(yBot, hitY + 120));
        const r = 2.5 + (n.vel / 127) * 3.2;
        ctx.fillStyle = n.color;
        ctx.strokeStyle = 'rgba(23,23,28,0.75)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.roundRect(x - r, clippedTop, r * 2, clippedBot - clippedTop, r);
        ctx.fill();
        ctx.stroke();
        /* 正在发声：判定线上光斑 */
        if (pos >= top && pos < bot) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.shadowColor = n.color;
          ctx.shadowBlur = 14;
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.arc(x, hitY, r + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      /* 鼓垫行 */
      const padY = hitY + 10;
      const padW = (w - 7 * 4 - 8) / 6;
      KIT_ORDER.forEach((kit, k) => {
        const x = 4 + k * (padW + 4);
        let glow = 0;
        /* 从后往前找该鼓最近一次已过的击打（hits 按 abs 升序） */
        for (let i = flat.hits.length - 1; i >= 0; i--) {
          const hit = flat.hits[i];
          if (hit.kit !== k) continue;
          const dt = (pos - hit.abs) * flat.stepMs;
          if (dt >= 0) {
            glow = Math.max(0, 1 - dt / 230);
            break;
          }
        }
        ctx.fillStyle = glow > 0.03 ? KIT_COLOR[kit] : 'rgba(23,23,28,0.08)';
        ctx.globalAlpha = glow > 0.03 ? 0.35 + glow * 0.65 : 1;
        ctx.beginPath();
        ctx.roundRect(x, padY, padW, 12, 4);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(23,23,28,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      /* 频谱条 */
      const spec = engine.getSpectrum();
      const bars = 32;
      const bw = (w - 8) / bars;
      for (let i = 0; i < bars; i++) {
        const db = spec[Math.floor((i / bars) * spec.length)] ?? -100;
        const v = Math.max(0, Math.min(1, (db + 92) / 78));
        const bh = 2 + v * 18;
        ctx.fillStyle = `rgba(0,229,255,${0.25 + v * 0.65})`;
        ctx.beginPath();
        ctx.roundRect(4 + i * bw, h - 4 - bh, Math.max(2, bw - 2.5), bh, 2);
        ctx.fill();
      }

      /* 段落横幅 */
      const sec = viz!.sections.find((s) => {
        const from = s.startBar * 16;
        return pos >= from && pos < from + s.bars * 16;
      });
      if (sec && sec.name !== lastSection) {
        lastSection = sec.name;
        sectionAt = now;
        banner = sec.name;
      }
      const fade = Math.max(0, 1 - (now - sectionAt) / 1500);
      if (fade > 0 && banner) {
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.fillStyle = 'rgba(23,23,28,0.9)';
        ctx.font = '800 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(banner.toUpperCase(), w / 2, 22 + (1 - fade) * 6);
        ctx.restore();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [flat, getPos, t, viz]);

  return (
    <div ref={wrapRef} className={`relative min-h-0 flex-1 ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />
    </div>
  );
}
