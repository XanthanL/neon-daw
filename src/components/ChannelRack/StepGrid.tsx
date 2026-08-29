/**
 * Channel Rack 步进网格
 * - 点击格子切换触发（toggle），开启瞬间预览对应鼓声
 * - Alt+拖动 / 右键拖动 / 「力度模式」下直接拖动：按指针在格内的纵向位置涂抹力度（0-127），
 *   填充色深浅映射力度；拖动期间只写 ref + 单次重渲染，pointerup 批量提交（一条历史）
 * - 行高与步宽由父级按视口传入（手机端更矮、最小 24px），左侧通道列表严格同高
 * - 每 4 步分组底纹 + 小节分割线；播放时当前列荧光瞬闪 + 激活格爆闪
 * - StepCell memo 化：播放步进变化时仅两列格子重渲染
 */
import { memo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { engine } from '../../audio/engine';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import type { Channel, Pattern } from '../../types/project';

const GAP = 3;
const INK = '#17171C';

const clamp = (min: number, max: number, v: number) =>
  Math.min(max, Math.max(min, v));

const cellWidthFor = (bars: number) =>
  bars === 1 ? 34 : bars === 2 ? 30 : bars === 4 ? 28 : 26;

/* ============================================================
 * 单步格（memo：props 全为原始值）
 * ============================================================ */

const StepCell = memo(function StepCell({
  ch,
  i,
  w,
  h,
  on,
  velocity,
  isPlay,
  color,
}: {
  ch: string;
  i: number;
  w: number;
  h: number;
  on: boolean;
  velocity: number;
  isPlay: boolean;
  color: string;
}) {
  const pct = Math.round(35 + 65 * (velocity / 127));
  const background = on
    ? `color-mix(in srgb, ${color} ${pct}%, #ffffff)`
    : isPlay
      ? '#D8F7FD'
      : '#F0F0F5';
  return (
    <div
      data-cell
      data-ch={ch}
      data-i={i}
      className={`relative z-10 shrink-0 rounded-lg border-2 transition-colors select-none ${
        on ? 'border-ink' : 'border-ink/15 hover:border-ink/45'
      } ${on && isPlay ? 'step-flash' : ''}`}
      style={{
        width: w,
        height: h,
        background,
        boxShadow: on
          ? `1.5px 1.5px 0 ${INK}, 0 0 7px ${color}80`
          : undefined,
      }}
    />
  );
});

/* ============================================================
 * 步进网格
 * ============================================================ */

export function StepGrid({
  channels,
  pattern,
  rowH,
  velMode = false,
}: {
  channels: Channel[];
  pattern: Pattern;
  /** 单行高度（与左侧通道列表严格对齐，手机端更矮） */
  rowH: number;
  /** 力度绘制模式：点击/拖动即直接涂抹力度（替代桌面 Alt / 右键） */
  velMode?: boolean;
}) {
  const totalSteps = pattern.bars * 16;
  const cellW = Math.max(24, cellWidthFor(pattern.bars));
  const pitch = cellW + GAP;
  const toggleStep = useProjectStore((s) => s.toggleStep);
  const setStepsVelocity = useProjectStore((s) => s.setStepsVelocity);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const currentStep = useUiStore((s) => s.currentStep);
  /* 走带步进计的是整个循环区间（Pattern 长度 × 重复遍数），回绕到本网格列 */
  const playStep = currentStep % totalSteps;

  const bodyRef = useRef<HTMLDivElement>(null);
  /** 力度涂抹进行中的状态（拖动只写 ref，指针结束时一次性提交 → 不重渲染整表） */
  const paintRef = useRef<{
    anchor: { ch: string; i: number } | null;
    v: number;
    over: Record<string, number>;
  }>({ anchor: null, v: 100, over: {} });
  const [paintVersion, setPaintVersion] = useState(0);

  /** 由指针坐标换算（通道行, 步列, 力度）—— 仅作用于已激活步 */
  const hitFromPoint = (clientX: number, clientY: number) => {
    const body = bodyRef.current;
    if (!body) return null;
    const rect = body.getBoundingClientRect();
    const col = Math.floor((clientX - rect.left) / pitch);
    const row = Math.floor((clientY - rect.top) / rowH);
    if (col < 0 || col >= totalSteps || row < 0 || row >= channels.length)
      return null;
    const ch = channels[row];
    if (!pattern.steps[ch.id]?.[col]?.on) return null;
    const localY = clientY - rect.top - row * rowH;
    const v = clamp(0, 127, Math.round(127 * (1 - localY / rowH)));
    return { ch: ch.id, i: col, v };
  };

  /** 绘制中的单元格显示力度（ref 写入 → paintVersion 触发一次重渲染） */
  const displayVelocity = (ch: string, i: number, base: number) => {
    if (paintVersion === 0) return base;
    const paint = paintRef.current;
    const over = paint.over[`${ch}:${i}`];
    if (over !== undefined) return over;
    if (paint.anchor && paint.anchor.ch === ch && paint.anchor.i === i) {
      return paint.v;
    }
    return base;
  };

  /** 右键 / Alt / 力度模式：拖动涂抹力度（纵向位置 = 力度，横向扫过连续涂抹） */
  const startVelPaint = (e: RPointerEvent) => {
    const hit = hitFromPoint(e.clientX, e.clientY);
    if (!hit) return;

    const paint = paintRef.current;
    paint.anchor = { ch: hit.ch, i: hit.i };
    paint.v = hit.v;
    paint.over = {};
    setPaintVersion((n) => n + 1);

    const onMove = (ev: PointerEvent) => {
      const hit = hitFromPoint(ev.clientX, ev.clientY);
      if (!hit) return;
      const p = paintRef.current;
      if (p.anchor && p.anchor.ch === hit.ch && p.anchor.i === hit.i) {
        p.v = hit.v;
      } else {
        p.over[`${hit.ch}:${hit.i}`] = hit.v;
      }
      setPaintVersion((n) => n + 1);
    };
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      const p = paintRef.current;
      // 按通道分批提交（一次涂抹 = 每通道一条撤销历史）
      const byCh = new Map<string, { index: number; velocity: number }[]>();
      const push = (key: string, velocity: number) => {
        const idx = key.indexOf(':');
        const cid = key.slice(0, idx);
        const list = byCh.get(cid) ?? [];
        list.push({ index: Number(key.slice(idx + 1)), velocity });
        byCh.set(cid, list);
      };
      if (p.anchor) push(`${p.anchor.ch}:${p.anchor.i}`, p.v);
      for (const [key, v] of Object.entries(p.over)) push(key, v);
      byCh.forEach((list, cid) => setStepsVelocity(cid, list));
      paintRef.current = { anchor: null, v: 100, over: {} };
      setPaintVersion(0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  /** 网格统一指针分发（data 属性委托，保证 StepCell memo 生效） */
  const onBodyPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    const cell = (e.target as HTMLElement).closest('[data-cell]');
    if (!cell) return;
    const ch = cell.getAttribute('data-ch');
    const i = Number(cell.getAttribute('data-i'));
    if (!ch || Number.isNaN(i)) return;

    if (e.button === 2 || e.altKey || velMode) {
      e.preventDefault();
      startVelPaint(e);
      return;
    }
    if (e.button !== 0) return;

    const sd = pattern.steps[ch]?.[i];
    toggleStep(ch, i);
    // 由关变开时预览一次对应鼓声
    if (!sd?.on) void engine.previewChannel(ch, sd?.velocity ?? 100);
  };

  const groups = Math.ceil(totalSteps / 4);

  return (
    <div className="relative">
      {/* 步序表头（sticky top）：小节号加粗 / 拍号次级 / 其余圆点 */}
      <div
        className="sticky top-0 z-20 flex h-7 items-end border-b-2 border-ink bg-bg-warm pr-3 pb-1 select-none"
        style={{ gap: GAP }}
      >
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            style={{ width: cellW }}
            className="shrink-0 text-center text-[10px] leading-none font-extrabold"
          >
            {i % 16 === 0 ? (
              <span className="text-ink tabular-nums">{i / 16 + 1}</span>
            ) : i % 4 === 0 ? (
              <span className="text-fg-muted tabular-nums">
                {(i % 16) / 4 + 1}
              </span>
            ) : (
              <span className="text-fg-faint/50">·</span>
            )}
          </div>
        ))}
      </div>

      {/* 网格主体 */}
      <div
        ref={bodyRef}
        className="relative pr-3 pb-2 select-none"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onBodyPointerDown}
      >
        <div className="relative" style={{ width: totalSteps * pitch - GAP }}>
          {/* 每 4 步分组底纹 */}
          <div className="pointer-events-none absolute inset-0 z-0">
            {Array.from({ length: groups }, (_, g) => (
              <div
                key={g}
                className="absolute top-0 bottom-0"
                style={{
                  left: g * 4 * pitch,
                  width: 4 * pitch - GAP,
                  background: g % 2 === 0 ? 'transparent' : 'rgba(23,23,28,0.05)',
                }}
              />
            ))}
            {/* 小节分割线 */}
            {Array.from({ length: pattern.bars - 1 }, (_, b) => (
              <div
                key={`bar-${b}`}
                className="absolute top-0 bottom-0 w-[2px] bg-ink/25"
                style={{ left: (b + 1) * 16 * pitch - GAP / 2 - 1 }}
              />
            ))}
          </div>

          {/* 播放列荧光瞬闪（key 重挂触发动画） */}
          {isPlaying && (
            <div
              key={playStep}
              className="play-col pointer-events-none absolute top-0 bottom-0 z-0 rounded-md"
              style={{ left: playStep * pitch, width: cellW }}
            />
          )}

          {/* 通道步进行 */}
          {channels.map((ch) => (
            <div
              key={ch.id}
              className="flex cursor-pointer items-center"
              style={{ gap: GAP, height: rowH }}
            >
              {Array.from({ length: totalSteps }, (_, i) => {
                const sd = pattern.steps[ch.id]?.[i];
                return (
                  <StepCell
                    key={i}
                    ch={ch.id}
                    i={i}
                    w={cellW}
                    h={rowH - 8}
                    color={ch.color}
                    on={!!sd?.on}
                    velocity={displayVelocity(ch.id, i, sd?.velocity ?? 100)}
                    isPlay={isPlaying && playStep === i}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
