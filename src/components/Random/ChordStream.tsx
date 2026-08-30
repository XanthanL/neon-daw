/**
 * 和声轨：全曲和弦事件时间轴，当前和弦自动居中缓动跟随播放头
 * · vertical = 桌面侧栏：罗马数字 + 实际排列圆点 + 段落标签
 * · horizontal = 移动端卡片下横条：同数据换轴向 + 边缘渐隐
 * · 底部曲式条：段落按小节数成比例铺开，播放头沿行进扫过
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { VizSong } from '../../utils/music/types';
import { flattenChords, locateIndex, useVizClock } from './viz';

const ITEM_H = 54;
const ITEM_W = 96;

const PASTEL = ['#00E5FF', '#FF3DBE', '#FFE600', '#39FF88', '#A78BFA', '#4D9FFF', '#FF9F1C'];

export function ChordStream({
  viz,
  orientation = 'vertical',
  className = '',
}: {
  viz: VizSong | null;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}) {
  const getPos = useVizClock(viz);
  const chords = useMemo(() => flattenChords(viz), [viz]);
  const absList = useMemo(() => chords.map((c) => c.abs), [chords]);
  const [idx, setIdx] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [mainAxis, setMainAxis] = useState(260);
  const vertical = orientation === 'vertical';

  /* 主轴尺寸测量（居中偏移用） */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setMainAxis(vertical ? el.clientHeight : el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vertical]);

  /* 当前和弦下标轮询：仅在变化时 setState；同时命令式推播放头 */
  useEffect(() => {
    if (!chords.length || !viz) return;
    let raf = 0;
    const total = viz.totalBars * 16;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const pos = getPos();
      const i = locateIndex(absList, pos);
      setIdx((p) => (p === i ? p : i));
      const head = headRef.current;
      if (head) head.style.left = `${Math.min(100, (pos / total) * 100)}%`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [chords, absList, getPos, viz]);

  /* ---------- 空态：通用流行四和弦占位 ---------- */
  if (!viz || !chords.length) {
    return (
      <div className={`flex min-h-0 flex-1 items-center justify-center gap-2 ${className}`}>
        {['I', 'V', 'vi', 'IV'].map((r, i) => (
          <motion.span
            key={r}
            className="rounded-lg border-2 border-ink bg-card px-3 py-1.5 text-sm font-black text-ink/35 shadow-hard-sm"
            animate={{ opacity: [0.45, 1, 0.45] }}
            transition={{ repeat: Infinity, duration: 2.6, delay: i * 0.35 }}
          >
            {r}
          </motion.span>
        ))}
      </div>
    );
  }

  const offset = (vertical ? idx * ITEM_H : idx * ITEM_W) - mainAxis / 2 + (vertical ? ITEM_H : ITEM_W) / 2;
  const currentSection = chords[idx]?.section;

  /* ---------- 曲式条 ---------- */
  const formBar = (
    <div className="relative mt-2 h-3 shrink-0 overflow-hidden rounded-full border-2 border-ink bg-card">
      <div className="flex h-full w-full">
        {viz.sections.map((s, i) => (
          <div
            key={`${s.name}-${i}`}
            style={{ flexGrow: s.bars }}
            className={`border-r border-ink/20 last:border-r-0 ${
              s.name === currentSection ? 'bg-neon-cyan/70' : 'bg-transparent'
            }`}
          />
        ))}
      </div>
      <div ref={headRef} className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-ink" style={{ left: 0 }} />
    </div>
  );

  /* ---------- 和弦片 ---------- */
  const chip = (c: (typeof chords)[number], i: number) => {
    const current = i === idx;
    const past = i < idx;
    const newSection = i === 0 || chords[i - 1].section !== c.section;
    return (
      <div
        key={`${c.roman}-${c.abs}-${i}`}
        style={vertical ? { height: ITEM_H - 4 } : { width: ITEM_W - 6 }}
        className={`shrink-0 select-none rounded-lg border-2 border-ink px-2 py-1 transition-opacity ${
          current
            ? 'bg-neon-cyan shadow-[1.5px_1.5px_0_#17171C,0_0_10px_rgba(0,229,255,0.55)]'
            : 'bg-card shadow-hard-sm'
        } ${past ? 'opacity-40' : ''} ${vertical ? 'flex items-center gap-2' : 'flex flex-col items-start justify-center'}`}
      >
        <div className="flex w-11 shrink-0 flex-col leading-none">
          <span className={`text-[15px] font-black text-ink ${current ? 'scale-105' : ''}`}>{c.roman}</span>
          {vertical && newSection && <span className="mt-0.5 text-[8px] font-extrabold uppercase tracking-wider text-ink/50">{c.section}</span>}
          {!vertical && <span className="mt-0.5 truncate text-[8px] font-bold uppercase tracking-wide text-ink/50">{c.section}</span>}
        </div>
        {/* 实际排列：每个和弦音一粒，横轴 = 半音位置 */}
        <div className={`relative ${vertical ? 'h-6 min-w-0 flex-1' : 'h-3 w-full'} rounded bg-ink/5`}>
          {c.voicing.map((m, vi) => (
            <span
              key={vi}
              className="absolute rounded-full border border-ink bg-neon-pink"
              style={
                vertical
                  ? {
                      left: `${Math.max(0, Math.min(96, ((m - 36) / (84 - 36)) * 100))}%`,
                      top: '50%',
                      width: 8,
                      height: 8,
                      transform: 'translateY(-50%)',
                      background: PASTEL[vi % PASTEL.length],
                    }
                  : {
                      bottom: 1,
                      left: `${Math.max(0, Math.min(92, ((m - 36) / (84 - 36)) * 100))}%`,
                      width: 6,
                      height: 6,
                      background: PASTEL[vi % PASTEL.length],
                    }
              }
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <div
        ref={trackRef}
        className={`relative min-h-0 flex-1 overflow-hidden ${!vertical ? 'flex items-center [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]' : ''}`}
      >
        <motion.div
          className={vertical ? 'absolute inset-x-0 top-0 flex flex-col gap-1 py-0.5' : 'absolute inset-y-0 left-0 flex flex-row items-stretch gap-1.5 px-0.5'}
          initial={false}
          animate={vertical ? { y: -offset } : { x: -offset }}
          transition={{ type: 'spring', stiffness: 150, damping: 21 }}
        >
          {chords.map((c, i) => chip(c, i))}
        </motion.div>
      </div>
      {formBar}
    </div>
  );
}
