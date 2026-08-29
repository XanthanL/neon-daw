/**
 * Song 编曲区（Task 9）：
 * 6 条编排轨道 × 小节时间线；点击空格放置当前 Pattern 片段（按小节对齐），
 * 拖动片段移动（可跨轨）、复制、删除；播放头随 song 模式步进发光移动。
 * Pattern / Song 模式在顶栏切换（见 TopBar / 溢出菜单）。
 * 手机端：行高与小节宽收窄、片段复制/删除常驻可见、幽灵预览只在鼠标下出现。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { engine } from '../../audio/engine';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import { useIsCompact } from '../ui/useIsCompact';

const BAR_W_DESKTOP = 64; // 每小节像素宽（桌面）
const ROW_H_DESKTOP = 54; // 轨道行高（桌面）
const CLIP_COLORS = [
  '#00E5FF',
  '#FF3DBE',
  '#FFE600',
  '#39FF88',
  '#A78BFA',
  '#4D9FFF',
  '#FF9F1C',
  '#FF5CA8',
];

/** 按 patternId 稳定取色 */
function patternColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CLIP_COLORS[h % CLIP_COLORS.length];
}

export function Song() {
  const patterns = useProjectStore((s) => s.patterns);
  const song = useProjectStore((s) => s.song);
  const currentPatternId = useProjectStore((s) => s.currentPatternId);
  const addClip = useProjectStore((s) => s.addClip);
  const moveClip = useProjectStore((s) => s.moveClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const copyClip = useProjectStore((s) => s.copyClip);

  const playMode = useUiStore((s) => s.playMode);
  const currentStep = useUiStore((s) => s.currentStep);

  /* 手机端收窄小节宽与行高，一屏能看到更多编排 */
  const compact = useIsCompact();
  const tx = useT();
  const BAR_W = compact ? 48 : BAR_W_DESKTOP;
  const ROW_H = compact ? 44 : ROW_H_DESKTOP;

  /* 绘制目标恒等于当前 Pattern（顶栏 / Pattern 管理切换后此处自动跟随） */
  const paintPatternId = currentPatternId;
  const setCurrentPatternId = useProjectStore((s) => s.setCurrentPatternId);
  const [selectedClip, setSelectedClip] = useState<{ trackId: string; clipId: string } | null>(
    null,
  );
  const [hover, setHover] = useState<{ trackId: string; bar: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  // 拖拽预览：{ clipId, fromTrackId, origStartBar, dx, dy }
  const [drag, setDrag] = useState<{
    trackId: string;
    clipId: string;
    origStartBar: number;
    dx: number;
    dy: number;
  } | null>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  const patternById = useMemo(
    () => Object.fromEntries(patterns.map((p) => [p.id, p])),
    [patterns],
  );

  const totalBars = useMemo(() => {
    let end = 16;
    for (const t of song.tracks)
      for (const c of t.clips) {
        const bars = patternById[c.patternId]?.bars ?? 1;
        end = Math.max(end, c.startBar + bars + 2);
      }
    return end;
  }, [song.tracks, patternById]);

  // 播放头位置（song 模式、16 分步进 → 像素）
  const playheadX =
    playMode === 'song' ? (currentStep / 16) * BAR_W : null;

  /* 点击 / 拖动标尺或播放头 → 换算成 16 分步并 seek（播放中即时生效） */
  const seekFromClientX = (clientX: number) => {
    const el = tlRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const step = Math.round(((clientX - rect.left) / BAR_W) * 16);
    engine.seekStep(step);
  };

  // Delete 键删除选中片段
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClip) {
        e.preventDefault();
        removeClip(selectedClip.trackId, selectedClip.clipId);
        setSelectedClip(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedClip, removeClip]);

  const bars = Array.from({ length: totalBars }, (_, i) => i);

  const handleTrackClick = (trackId: string, e: React.MouseEvent) => {
    void e;
    // 点到片段本身时不放置（片段 stopPropagation）
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const bar = Math.floor((e.clientX - rect.left) / BAR_W);
    addClip(trackId, paintPatternId, bar);
  };

  const handleTrackMove = (trackId: string, e: React.PointerEvent) => {
    /* 幽灵预览只服务鼠标：手指点击即放置，拖动则交给容器滚动 */
    if (e.pointerType !== 'mouse') return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const bar = Math.floor((e.clientX - rect.left) / BAR_W);
    if (!hover || hover.trackId !== trackId || hover.bar !== bar) {
      setHover({ trackId, bar });
    }
  };

  const handleTrackLeave = (trackId: string, e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (hover?.trackId === trackId) setHover(null);
  };

  const startDrag = (
    trackId: string,
    clipId: string,
    origStartBar: number,
    e: React.PointerEvent,
  ) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragOrigin.current = { x: e.clientX, y: e.clientY };
    setSelectedClip({ trackId, clipId });
    setDrag({ trackId, clipId, origStartBar, dx: 0, dy: 0 });
  };

  const onDragMove = (e: React.PointerEvent) => {
    if (!drag || !dragOrigin.current) return;
    setDrag((d) =>
      d
        ? {
            ...d,
            dx: e.clientX - dragOrigin.current!.x,
            dy: e.clientY - dragOrigin.current!.y,
          }
        : d,
    );
  };

  const endDrag = () => {
    if (!drag || !dragOrigin.current) return;
    const barDelta = Math.round(drag.dx / BAR_W);
    const rowDelta = Math.round(drag.dy / ROW_H);
    const tracks = song.tracks;
    const fromIdx = tracks.findIndex((t) => t.id === drag.trackId);
    const toIdx = Math.min(
      tracks.length - 1,
      Math.max(0, fromIdx + rowDelta),
    );
    const toTrackId = tracks[toIdx].id;
    const newStart = Math.max(0, drag.origStartBar + barDelta);
    moveClip(drag.trackId, drag.clipId, newStart, toTrackId);
    dragOrigin.current = null;
    setDrag(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b-2 border-ink/10 bg-bg-warm/60 px-3 py-2 md:px-4">
        <span className="label-caps">{tx.song.paint}</span>
        <select
          value={paintPatternId}
          onChange={(e) => setCurrentPatternId(e.target.value)}
          className="max-w-[52vw] rounded-lg border-2 border-ink bg-card px-2 py-1.5 text-xs font-bold text-ink shadow-hard-sm md:max-w-none md:py-1"
        >
          {patterns.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {tx.song.barsUnit(p.bars)}
            </option>
          ))}
        </select>
        {selectedClip && (
          <div className="flex items-center gap-1.5 md:hidden">
            <button
              type="button"
              onClick={() => copyClip(selectedClip.trackId, selectedClip.clipId)}
              className="flex h-9 cursor-pointer items-center gap-1 rounded-lg border-2 border-ink bg-card px-2.5 text-[11px] font-extrabold text-ink shadow-hard-sm transition-all active:-translate-y-0.5"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2.8} />
              {tx.common.copy}
            </button>
            <button
              type="button"
              onClick={() => {
                removeClip(selectedClip.trackId, selectedClip.clipId);
                setSelectedClip(null);
              }}
              className="flex h-9 cursor-pointer items-center gap-1 rounded-lg border-2 border-ink bg-neon-pink px-2.5 text-[11px] font-extrabold text-ink transition-all active:-translate-y-0.5"
              style={{ boxShadow: '1.5px 1.5px 0 #17171C' }}
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.8} />
              {tx.common.delete}
            </button>
          </div>
        )}
        <span className="ml-auto label-caps">
          {compact ? tx.song.hintTouch : tx.song.hintDesktop}
        </span>
      </div>

      {/* 滚动区：左侧轨道名 + 右侧时间线 */}
      <div className="flex min-h-0 flex-1 overflow-auto">
        {/* 轨道名 */}
        <div className="sticky left-0 z-20 shrink-0 bg-bg-warm/80">
          <div className="h-7 border-b-2 border-ink/10" />
          {song.tracks.map((tr, i) => (
            <div
              key={tr.id}
              className="flex w-[76px] items-center border-b border-ink/10 px-2 md:w-[120px] md:px-3"
              style={{ height: ROW_H }}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: CLIP_COLORS[i % CLIP_COLORS.length] }}
              />
              <span className="ml-2 truncate text-xs font-extrabold text-ink">
                {tx.song.track(i + 1)}
              </span>
            </div>
          ))}
        </div>

        {/* 时间线 */}
        <div ref={tlRef} className="relative" style={{ width: totalBars * BAR_W }}>
          {/* 小节刻度（点击 / 拖动 → 跳转播放头） */}
          <div
            className="relative h-7 cursor-pointer touch-none border-b-2 border-ink/10 hover:bg-panel/40"
            title={tx.song.ruler}
            role="slider"
            aria-label={tx.song.ruler}
            aria-valuemin={0}
            aria-valuemax={totalBars}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setScrubbing(true);
              seekFromClientX(e.clientX);
            }}
            onPointerMove={(e) => {
              if (scrubbing) seekFromClientX(e.clientX);
            }}
            onPointerUp={(e) => {
              setScrubbing(false);
              const el = e.currentTarget as HTMLElement;
              if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => setScrubbing(false)}
          >
            {bars.map((b) => (
              <div
                key={b}
                className="pointer-events-none absolute top-0 flex h-full items-center justify-center border-l border-ink/10 text-[9px] font-bold text-fg-faint"
                style={{ left: b * BAR_W, width: BAR_W }}
              >
                {b + 1}
              </div>
            ))}
          </div>

          {/* 轨道行（可点击放置） */}
          <div ref={gridRef} className="relative">
            {song.tracks.map((t) => (
              <div
                key={t.id}
                onClick={(e) => handleTrackClick(t.id, e)}
                onPointerMove={(e) => handleTrackMove(t.id, e)}
                onPointerLeave={(e) => handleTrackLeave(t.id, e)}
                className="relative border-b border-ink/10"
                style={{ height: ROW_H }}
              >
                {/* 小节网格背景 */}
                {bars.map((b) => (
                  <div
                    key={b}
                    className="absolute top-0 h-full border-l border-ink/5"
                    style={{ left: b * BAR_W, width: BAR_W }}
                  />
                ))}
                {/* 悬停 ghost 预览（指示点击会放置在哪个小节、用哪种 pattern） */}
                {hover?.trackId === t.id && (() => {
                  const pat = patternById[paintPatternId];
                  const ghostColor = patternColor(paintPatternId);
                  return (
                    <div
                      className="pointer-events-none absolute top-1 flex items-center gap-1 overflow-hidden rounded-md border-2 border-dashed border-ink/50 px-1.5 py-0.5"
                      style={{
                        left: hover.bar * BAR_W,
                        width: (pat?.bars ?? 1) * BAR_W - 4,
                        height: ROW_H - 8,
                        background: `${ghostColor}55`,
                      }}
                    >
                      <span className="truncate text-[10px] font-black text-ink/70">
                        {pat?.name ?? 'Pattern'}
                      </span>
                    </div>
                  );
                })()}
                {/* 片段 */}
                {t.clips.map((c) => {
                  const pat = patternById[c.patternId];
                  const barsLen = pat?.bars ?? 1;
                  const color = patternColor(c.patternId);
                  const isDragging =
                    drag?.clipId === c.id && drag.trackId === t.id;
                  const isSel =
                    selectedClip?.clipId === c.id &&
                    selectedClip.trackId === t.id;
                  return (
                    <div
                      key={c.id}
                      onPointerDown={(e) => startDrag(t.id, c.id, c.startBar, e)}
                      onPointerMove={onDragMove}
                      onPointerUp={endDrag}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClip({ trackId: t.id, clipId: c.id });
                      }}
                      className={`group absolute top-1 flex cursor-grab touch-none items-center gap-1 overflow-hidden rounded-md border-2 border-ink px-1.5 py-0.5 active:cursor-grabbing ${
                        isSel ? 'ring-2 ring-ink' : ''
                      }`}
                      style={{
                        left: c.startBar * BAR_W + (isDragging ? drag!.dx : 0),
                        top: isDragging ? drag!.dy : 0,
                        width: barsLen * BAR_W - 4,
                        height: ROW_H - 8,
                        background: color,
                        boxShadow: `1.5px 1.5px 0 #17171C, 0 0 8px ${color}80`,
                      }}
                      title={tx.song.clipTitle(pat?.name ?? c.patternId, c.startBar + 1)}
                    >
                      <span className="truncate text-[10px] font-black text-ink">
                        {pat?.name ?? 'Pattern'}
                      </span>
                      {/* 悬停操作 */}
                      <div className="absolute right-0.5 top-0.5 z-10 hidden gap-1 group-hover:flex">
                        <button
                          type="button"
                          aria-label={tx.song.copyClip}
                          onClick={(e) => {
                            e.stopPropagation();
                            copyClip(t.id, c.id);
                          }}
                          className="rounded border-2 border-ink bg-white p-0.5 text-ink"
                        >
                          <Copy className="h-2.5 w-2.5" strokeWidth={3} />
                        </button>
                        <button
                          type="button"
                          aria-label={tx.song.deleteClip}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeClip(t.id, c.id);
                            setSelectedClip(null);
                          }}
                          className="rounded border-2 border-ink bg-white p-0.5 text-neon-pink"
                        >
                          <Trash2 className="h-2.5 w-2.5" strokeWidth={3} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 播放头（song 模式常驻；顶部把手可拖动跳转） */}
          {playMode === 'song' && playheadX !== null && (
            <div
              className="pointer-events-none absolute top-0 z-30 w-[3px]"
              style={{
                left: playheadX,
                height: 7 + song.tracks.length * ROW_H,
                background: '#00E5FF',
                boxShadow: '0 0 10px #00E5FF',
              }}
            >
              <div
                className="pointer-events-auto absolute -top-0.5 left-1/2 h-4 w-4 -translate-x-1/2 cursor-ew-resize touch-none rounded-sm border-2 border-ink bg-neon-cyan"
                style={{ boxShadow: '0 0 8px rgba(0,229,255,0.8)' }}
                title={tx.song.ruler}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  setScrubbing(true);
                }}
                onPointerMove={(e) => {
                  if (scrubbing) seekFromClientX(e.clientX);
                }}
                onPointerUp={(e) => {
                  setScrubbing(false);
                  const el = e.currentTarget as HTMLElement;
                  if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
                }}
                onPointerCancel={() => setScrubbing(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
