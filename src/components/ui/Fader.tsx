import { useRef } from 'react';

export interface FaderProps {
  /** 0 ~ 1 */
  value: number;
  onChange: (value: number) => void;
  label?: string;
  /** 推子帽上的荧光条颜色 */
  color?: string;
  /** 轨道高度 px */
  height?: number;
  /** 双击重置目标值 */
  defaultValue?: number;
  format?: (value: number) => string;
  className?: string;
  disabled?: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const CAP_H = 22;
const CAP_W = 42;
const TICKS = [1, 0.75, 0.5, 0.25, 0];

/**
 * 垂直推子：点击/拖动调值，双击重置
 * 三明治法则：白帽黑描边 + 硬阴影 + 荧光条小面积高光
 */
export function Fader({
  value,
  onChange,
  label,
  color = '#00E5FF',
  height = 180,
  defaultValue,
  format,
  className = '',
  disabled = false,
}: FaderProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const initialRef = useRef<number | null>(null);
  if (initialRef.current === null) initialRef.current = value;

  /** 指针事件 → 值（含推子帽高度补偿） */
  const valueFromPointer = (clientY: number) => {
    const rail = railRef.current;
    if (!rail) return value;
    const rect = rail.getBoundingClientRect();
    const innerTop = rect.top + rail.clientTop; // 跳过上边框
    const innerH = rail.clientHeight;
    const y = clientY - innerTop - CAP_H / 2;
    return clamp01(1 - y / (innerH - CAP_H));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    onChange(valueFromPointer(e.clientY));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || disabled) return;
    onChange(valueFromPointer(e.clientY));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const rail = railRef.current;
  const innerH = rail ? rail.clientHeight : height - 4;
  /* 直觉语义：值大（大声）→ 帽在顶。鼠标上拖 = 值上 = 帽上 */
  const capTop = (1 - clamp01(value)) * (innerH - CAP_H);

  const display = format
    ? format(value)
    : `${Math.round(clamp01(value) * 100)}%`;

  return (
    <div
      className={`flex flex-col items-center gap-2 select-none ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      <span className="text-sm font-bold text-ink tabular-nums">{display}</span>

      <div
        ref={railRef}
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        tabIndex={disabled ? -1 : 0}
        className={`relative w-7 touch-none rounded-full border-2 border-ink bg-panel ${
          disabled ? '' : 'cursor-grab'
        }`}
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => {
          if (!disabled) onChange(defaultValue ?? initialRef.current ?? 0.8);
        }}
      >
        {/* 中央凹槽 */}
        <div className="absolute top-2 bottom-2 left-1/2 w-[4px] -translate-x-1/2 rounded-full bg-fg-faint/40" />

        {/* 刻度 */}
        <div className="absolute top-2 right-full mr-1.5 flex h-[calc(100%-16px)] flex-col justify-between">
          {TICKS.map((t) => (
            <span key={t} className="h-px w-1.5 bg-ink/40" />
          ))}
        </div>

        {/* 推子帽：纯 div + 单 transform 同时表达居中和 Y 位置
            （避免 framer whileTap 用 transform 覆盖 translateX(-50%) 导致横向漂移） */}
        <div
          className="absolute flex items-center justify-center rounded-lg border-2 border-ink bg-card"
          style={{
            top: 0,
            left: '50%',
            width: CAP_W,
            height: CAP_H,
            transform: `translate(-50%, ${capTop}px)`,
            boxShadow: '2px 2px 0 #17171C',
          }}
        >
          <div
            className="h-[3px] w-[58%] rounded-full"
            style={{ background: color, boxShadow: `0 0 4px ${color}` }}
          />
        </div>
      </div>

      {label !== undefined && <span className="label-caps">{label}</span>}
    </div>
  );
}
