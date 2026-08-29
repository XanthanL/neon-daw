/**
 * Piano Roll 网格区
 * - 背景层：黑键行浅底 / C 行粗线 / 16 分·节拍·小节分割线（粗细区分）
 * - 音符编辑：空白创建（吸附对齐 + 预览发声，默认时值 = 吸附档位）；
 *   拖拽移动（水平改时间 + 垂直改音高，吸附，支持多选整组移动）；
 *   左右边缘拉伸时值（最短 1/32）
 * - 删除入口：桌面右键（按住可沿路径连擦）/ Delete；触屏长按音符、或选中后点工具条橡皮擦
 * - 触屏与鼠标分工：空白处鼠标拖动=连续落笔，手指拖动=滚动网格、轻点才创建；
 *   音符本身保持 touch-none，拖动音符始终改位置而不带动滚动
 * - 拖拽期间以本地覆盖态（overrides / ghost）预览，pointerup 一次性经
 *   projectStore actions 提交 → 一次手势恰好一条撤销历史
 * - 播放联动：荧光青播放头 + 命中音符 note-hit 爆闪
 */
import { memo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { engine } from '../../audio/engine';
import { useProjectStore } from '../../stores/projectStore';
import type { Note } from '../../types/project';
import { useLongPress } from '../ui/useLongPress';
import { MIN_LEN, PITCH_MAX, PITCH_MIN, ROW_H, isBlackKey } from './constants';
import type { ChannelInfo } from './constants';

const INK = '#17171C';
const clamp = (min: number, max: number, v: number) =>
  Math.min(max, Math.max(min, v));

/* ============================================================
 * 音符（memo：props 全原始值，播放命中只重渲染受影响音符）
 * ============================================================ */

const NoteView = memo(function NoteView({
  id,
  left,
  top,
  width,
  velocity,
  color,
  selected,
  hit,
}: {
  id: string;
  left: number;
  top: number;
  width: number;
  velocity: number;
  color: string;
  selected: boolean;
  hit: boolean;
}) {
  const pct = Math.round(40 + 60 * (velocity / 127));
  return (
    <div
      data-note
      data-id={id}
      className={`absolute z-10 cursor-grab touch-none rounded-[5px] border-2 border-ink ${hit ? 'note-hit' : ''}`}
      style={{
        left,
        top,
        width: Math.max(5, width),
        height: ROW_H - 3,
        background: `color-mix(in srgb, ${color} ${pct}%, #ffffff)`,
        boxShadow: selected
          ? `1.5px 1.5px 0 ${INK}, 0 0 8px ${color}`
          : `1.5px 1.5px 0 rgba(23,23,28,0.85)`,
      }}
    />
  );
});

/* ============================================================
 * 网格区
 * ============================================================ */

export function GridArea({
  notes,
  totalSteps,
  stepW,
  snapSteps,
  channelMap,
  selectedChannelId,
  selectedIds,
  onSelect,
  playStep,
}: {
  notes: Note[];
  totalSteps: number;
  stepW: number;
  snapSteps: number;
  channelMap: Record<string, ChannelInfo>;
  selectedChannelId: string;
  selectedIds: Set<string>;
  onSelect: (ids: Set<string>) => void;
  playStep: number | null;
}) {
  const addNote = useProjectStore((s) => s.addNote);
  const updateNotes = useProjectStore((s) => s.updateNotes);
  const removeNote = useProjectStore((s) => s.removeNote);
  const removeNotes = useProjectStore((s) => s.removeNotes);

  const [ghost, setGhost] = useState<{
    startStep: number;
    pitch: number;
    lengthSteps: number;
  } | null>(null);
  const ghostRef = useRef(ghost);
  const [overrides, setOverrides] = useState<Map<string, Partial<Note>>>(
    new Map(),
  );
  const ovRef = useRef(overrides);

  const gridRef = useRef<HTMLDivElement>(null);
  const lastPitchRef = useRef<number | null>(null);

  const chInfo = channelMap[selectedChannelId];
  const ghostColor = chInfo?.color ?? '#00E5FF';

  const setGhostBoth = (g: typeof ghost) => {
    ghostRef.current = g;
    setGhost(g);
  };
  const setOvBoth = (m: Map<string, Partial<Note>>) => {
    ovRef.current = m;
    setOverrides(m);
  };

  const preview = (pitch: number) => {
    if (!chInfo) return;
    if (chInfo.kind === 'drum') void engine.previewChannel(selectedChannelId, 100);
    else void engine.previewNote(selectedChannelId, pitch, 100);
  };

  /* ---------- 删除（右键连擦 / 长按 / 橡皮擦共用：多选时整组删） ---------- */
  const eraseNote = (id: string) => {
    if (selectedIds.has(id) && selectedIds.size > 1) removeNotes([...selectedIds]);
    else removeNote(id);
    onSelect(new Set());
  };

  /* ---------- 触屏长按音符 = 删除（替代桌面右键 / Delete） ---------- */
  const lpTargetRef = useRef<string | null>(null);
  const lp = useLongPress(() => {
    const id = lpTargetRef.current;
    lpTargetRef.current = null;
    if (id) eraseNote(id);
  });

  /* ---------- 吸附 ---------- */
  const snapRound = (v: number) =>
    Math.round((Math.round(v / snapSteps) * snapSteps) * 1e6) / 1e6;
  const snapFloor = (v: number) =>
    Math.round((Math.floor(v / snapSteps + 1e-6) * snapSteps) * 1e6) / 1e6;

  /* ---------- 坐标 → 网格 ---------- */
  const posToGrid = (clientX: number, clientY: number) => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  /* ---------- 创建音符（鼠标拖动连续落笔 / 触屏轻点，吸附对齐 + 预览） ---------- */
  const startCreate = (e: RPointerEvent) => {
    const pt = posToGrid(e.clientX, e.clientY);
    if (!pt) return;
    const start = clamp(0, totalSteps - snapSteps, snapFloor(pt.x / stepW));
    const pitch = clamp(
      PITCH_MIN,
      PITCH_MAX,
      PITCH_MAX - Math.floor(pt.y / ROW_H),
    );
    /* 手指按下先不落笔：位移超阈值或被浏览器接管滚动 = 用户想滚网格 */
    const tapMode = e.pointerType !== 'mouse';
    const origin = { x: e.clientX, y: e.clientY };
    let abandoned = false;
    lastPitchRef.current = pitch;

    if (!tapMode) {
      preview(pitch);
      setGhostBoth({
        startStep: start,
        pitch,
        lengthSteps: Math.min(snapSteps, totalSteps - start),
      });
    }

    const onMove = (ev: PointerEvent) => {
      if (tapMode) {
        if (
          Math.abs(ev.clientX - origin.x) > 10 ||
          Math.abs(ev.clientY - origin.y) > 10
        ) {
          abandoned = true;
        }
        return;
      }
      const p = posToGrid(ev.clientX, ev.clientY);
      if (!p) return;
      const s = clamp(0, totalSteps - snapSteps, snapFloor(p.x / stepW));
      const pi = clamp(
        PITCH_MIN,
        PITCH_MAX,
        PITCH_MAX - Math.floor(p.y / ROW_H),
      );
      if (pi !== lastPitchRef.current) {
        lastPitchRef.current = pi;
        preview(pi);
      }
      setGhostBoth({
        startStep: s,
        pitch: pi,
        lengthSteps: Math.min(snapSteps, totalSteps - s),
      });
    };
    let done = false;
    const commit = (at: { startStep: number; pitch: number } | null) => {
      setGhostBoth(null);
      if (!at) return;
      const id = addNote({
        channelId: selectedChannelId,
        pitch: at.pitch,
        startStep: at.startStep,
        lengthSteps: Math.min(snapSteps, totalSteps - at.startStep),
        velocity: 100,
      });
      onSelect(new Set([id]));
    };
    const finish = (cancelled: boolean) => {
      if (done) return;
      done = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onFinish);
      window.removeEventListener('pointercancel', onCancel);
      if (cancelled) {
        abandoned = true;
      }
      if (abandoned) {
        setGhostBoth(null);
        return;
      }
      if (tapMode) {
        preview(pitch);
        commit({ startStep: start, pitch });
        return;
      }
      const g = ghostRef.current;
      commit(g ? { startStep: g.startStep, pitch: g.pitch } : null);
    };
    const onFinish = () => finish(false);
    const onCancel = () => finish(true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onFinish);
    window.addEventListener('pointercancel', onCancel);
  };

  /* ---------- 音符拖拽（移动 / 边缘拉伸 / 右键或长按删除） ---------- */
  const startNoteDrag = (
    e: RPointerEvent,
    note: Note,
    edge: 'l' | 'r' | null,
  ) => {
    e.stopPropagation();
    e.preventDefault();

    if (e.button === 2) {
      eraseNote(note.id);
      return;
    }
    if (e.button !== 0) return;

    /* 选择逻辑：Ctrl/Shift 多选切换，普通点击单选 */
    let moving: Note[];
    if (e.ctrlKey || e.shiftKey) {
      const next = new Set(selectedIds);
      if (next.has(note.id)) next.delete(note.id);
      else next.add(note.id);
      onSelect(next);
      if (!next.has(note.id)) return; // 取消选择则不进入拖拽
      moving = notes.filter((n) => next.has(n.id));
    } else if (selectedIds.has(note.id)) {
      moving = notes.filter((n) => selectedIds.has(n.id));
    } else {
      onSelect(new Set([note.id]));
      moving = [note];
    }

    const startX = e.clientX;
    const startY = e.clientY;
    const mode = edge === 'l' ? 'resizeL' : edge === 'r' ? 'resizeR' : 'move';
    lastPitchRef.current = note.pitch;

    const onMove = (ev: PointerEvent) => {
      if (lp.longPressedRef.current) return;
      const dxSteps = (ev.clientX - startX) / stepW;
      const dyRows = Math.round((ev.clientY - startY) / ROW_H);

      if (mode === 'move') {
        const ov = new Map<string, Partial<Note>>();
        let previewPitch: number | null = null;
        for (const n of moving) {
          const start = clamp(
            0,
            totalSteps - n.lengthSteps,
            snapRound(n.startStep + dxSteps),
          );
          const pitch = clamp(PITCH_MIN, PITCH_MAX, n.pitch - dyRows);
          if (n.id === note.id && pitch !== lastPitchRef.current) {
            lastPitchRef.current = pitch;
            previewPitch = pitch;
          }
          ov.set(n.id, { startStep: start, pitch });
        }
        setOvBoth(ov);
        if (previewPitch !== null) preview(previewPitch);
      } else if (mode === 'resizeL') {
        const start = clamp(
          0,
          note.startStep + note.lengthSteps - MIN_LEN,
          snapRound(note.startStep + dxSteps),
        );
        const len = Math.round(
          (note.startStep + note.lengthSteps - start) * 1e6,
        ) / 1e6;
        setOvBoth(
          new Map([[note.id, { startStep: start, lengthSteps: len }]]),
        );
      } else {
        const len = clamp(
          MIN_LEN,
          totalSteps - note.startStep,
          Math.max(MIN_LEN, snapRound(note.lengthSteps + dxSteps)),
        );
        setOvBoth(new Map([[note.id, { lengthSteps: len }]]));
      }
    };
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      const pressed = lp.longPressedRef.current;
      const updates = pressed
        ? []
        : [...ovRef.current.entries()].map(([id, patch]) => ({
            id,
            patch,
          }));
      setOvBoth(new Map());
      if (updates.length > 0) updateNotes(updates);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  /* ---------- 网格统一指针分发 ---------- */
  const onGridPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    /* 右键：单击立即删除鼠标下的音符；按住拖动则沿路径连续擦除经过的音符 */
    if (e.button === 2) {
      e.preventDefault();
      const noteEl = (e.target as HTMLElement).closest('[data-note]');
      let lastErasedId: string | null =
        noteEl?.getAttribute('data-id') ?? null;
      if (lastErasedId) eraseNote(lastErasedId);

      const onMove = (ev: PointerEvent) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        /* 鼠标离开网格区域则暂停擦除 */
        if (!el || !gridRef.current?.contains(el)) {
          lastErasedId = null;
          return;
        }
        const noteEl2 = el.closest('[data-note]');
        const id2 = noteEl2?.getAttribute('data-id') ?? null;
        if (id2 && id2 !== lastErasedId) {
          eraseNote(id2);
          lastErasedId = id2;
        } else if (!id2) {
          lastErasedId = null;
        }
      };
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
      return;
    }

    if (e.button !== 0) return;

    const noteEl = (e.target as HTMLElement).closest('[data-note]');
    if (noteEl) {
      const id = noteEl.getAttribute('data-id') ?? '';
      lpTargetRef.current = id || null;
      if (id && e.pointerType !== 'mouse') lp.onPointerDown(e);
      const note = notes.find((n) => n.id === id);
      if (!note) return;
      const w = (noteEl as HTMLElement).offsetWidth;
      const ox = e.nativeEvent.offsetX;
      const edge: 'l' | 'r' | null =
        ox <= 6 ? 'l' : ox >= w - 6 ? 'r' : null;
      startNoteDrag(e, note, edge);
      return;
    }
    lpTargetRef.current = null;
    startCreate(e);
  };

  const bars = Math.ceil(totalSteps / 16);

  return (
    <div
      ref={gridRef}
      className="relative cursor-crosshair touch-pan-x touch-pan-y select-none"
      style={{ width: totalSteps * stepW, height: (PITCH_MAX - PITCH_MIN + 1) * ROW_H }}
      onPointerDown={onGridPointerDown}
      onPointerMove={lp.onPointerMove}
      onPointerUp={lp.onPointerUp}
      onPointerCancel={lp.onPointerCancel}
      onPointerLeave={lp.onPointerUp}
      onContextMenu={lp.onContextMenu}
    >
      {/* 横向行底纹：黑键行浅底 + C 行粗线（inset 阴影不占布局） */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {Array.from({ length: PITCH_MAX - PITCH_MIN + 1 }, (_, r) => {
          const midi = PITCH_MAX - r;
          return (
            <div
              key={midi}
              className="absolute right-0 left-0"
              style={{
                top: r * ROW_H,
                height: ROW_H,
                background: isBlackKey(midi)
                  ? 'rgba(23,23,28,0.05)'
                  : undefined,
                boxShadow:
                  midi % 12 === 0
                    ? 'inset 0 -2px 0 rgba(23,23,28,0.28)'
                    : 'inset 0 -1px 0 rgba(23,23,28,0.08)',
              }}
            />
          );
        })}
      </div>

      {/* 纵向分割线：节拍（4 步）次级 + 16 分细分 */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, rgba(23,23,28,0.22) 0 1px, transparent 1px ${stepW * 4}px), repeating-linear-gradient(90deg, rgba(23,23,28,0.09) 0 1px, transparent 1px ${stepW}px)`,
        }}
      />
      {/* 小节分割线（粗） */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {Array.from({ length: bars + 1 }, (_, b) => (
          <div
            key={b}
            className="absolute top-0 bottom-0 w-[2px] bg-ink/60"
            style={{ left: b * 16 * stepW - 1 }}
          />
        ))}
      </div>

      {/* 音符（超界音符不渲染，防止 bars 缩短后溢出） */}
      {notes.map((n) => {
        const ov = overrides.get(n.id);
        const start = ov?.startStep ?? n.startStep;
        if (start >= totalSteps) return null;
        const pitch = ov?.pitch ?? n.pitch;
        const len = ov?.lengthSteps ?? n.lengthSteps;
        const vel = ov?.velocity ?? n.velocity;
        const hit =
          playStep !== null && playStep >= start && playStep < start + len;
        return (
          <NoteView
            key={n.id}
            id={n.id}
            left={start * stepW}
            top={(PITCH_MAX - pitch) * ROW_H + 1.5}
            width={len * stepW - 2}
            velocity={vel}
            color={channelMap[n.channelId]?.color ?? '#00E5FF'}
            selected={selectedIds.has(n.id)}
            hit={hit}
          />
        );
      })}

      {/* 创建拖拽中的幽灵音符 */}
      {ghost && (
        <div
          className="pointer-events-none absolute z-10 rounded-[5px] border-2 border-dashed border-ink"
          style={{
            left: ghost.startStep * stepW,
            top: (PITCH_MAX - ghost.pitch) * ROW_H + 1.5,
            width: Math.max(5, ghost.lengthSteps * stepW - 2),
            height: ROW_H - 3,
            background: `color-mix(in srgb, ${ghostColor} 55%, #ffffff)`,
          }}
        />
      )}

      {/* 播放头：荧光青发光竖线 */}
      {playStep !== null && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-20 w-[2px] bg-neon-cyan"
          style={{
            left: playStep * stepW - 1,
            boxShadow:
              '0 0 8px rgba(0,229,255,0.9), 0 0 2px rgba(0,229,255,1)',
          }}
        />
      )}
    </div>
  );
}
