/**
 * Piano Roll 底部力度编辑条
 * 当前 Pattern 全部音符的力度竖条（与网格时间对位 / 通道色深浅映射力度），
 * 纵向拖动调整；拖拽期间本地覆盖预览，pointerup 一次性提交（一条历史）
 * 手机端条身加宽到拇指可命中，其余交互不变
 */
import { useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import type { Note } from '../../types/project';
import { useIsCompact } from '../ui/useIsCompact';
import { VEL_H } from './constants';
import type { ChannelInfo } from './constants';

const clamp = (min: number, max: number, v: number) =>
  Math.min(max, Math.max(min, v));

export function VelocityStrip({
  notes,
  stepW,
  totalSteps,
  channelMap,
}: {
  notes: Note[];
  stepW: number;
  totalSteps: number;
  channelMap: Record<string, ChannelInfo>;
}) {
  const updateNotes = useProjectStore((s) => s.updateNotes);
  const compact = useIsCompact();

  const [ov, setOv] = useState<Map<string, number>>(new Map());
  const ovRef = useRef(ov);
  const areaRef = useRef<HTMLDivElement>(null);

  const startDrag = (e: RPointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const apply = (clientY: number) => {
      const el = areaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const v = clamp(
        1,
        127,
        Math.round((1 - (clientY - rect.top) / rect.height) * 127),
      );
      ovRef.current = new Map(ovRef.current).set(id, v);
      setOv(ovRef.current);
    };
    apply(e.clientY);
    const onMove = (ev: PointerEvent) => apply(ev.clientY);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      const updates = [...ovRef.current.entries()].map(([nid, velocity]) => ({
        id: nid,
        patch: { velocity },
      }));
      ovRef.current = new Map();
      setOv(ovRef.current);
      if (updates.length > 0) updateNotes(updates);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  return (
    <div
      className="relative shrink-0 border-t-2 border-ink bg-panel select-none"
      style={{ width: totalSteps * stepW, height: VEL_H }}
    >
      {/* 节拍对位参考线 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, rgba(23,23,28,0.18) 0 1px, transparent 1px ${stepW * 4}px)`,
        }}
      />
      <div ref={areaRef} className="absolute inset-x-0 top-1 bottom-1">
        {notes.map((n) => {
          if (n.startStep >= totalSteps) return null;
          const v = ov.get(n.id) ?? n.velocity;
          const pct = Math.round(40 + 60 * (v / 127));
          const color = channelMap[n.channelId]?.color ?? '#00E5FF';
          return (
            <div
              key={n.id}
              onPointerDown={(e) => startDrag(e, n.id)}
              className="absolute cursor-ns-resize touch-none rounded-t-[3px] border-2 border-ink"
              style={{
                left: n.startStep * stepW + 1,
                bottom: 0,
                width: compact
                  ? Math.max(16, stepW / 2)
                  : Math.max(4, Math.min(8, stepW / 4)),
                height: `${(v / 127) * 100}%`,
                background: `color-mix(in srgb, ${color} ${pct}%, #ffffff)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
