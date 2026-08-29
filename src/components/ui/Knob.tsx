import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export interface KnobProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  label?: string;
  /** 荧光通道色（弧线 + 中心点高光） */
  color?: string;
  /** 旋钮直径 px */
  size?: number;
  /** 量化步进（默认 1） */
  step?: number;
  /** 双击重置目标值（缺省回挂载时初值） */
  defaultValue?: number;
  format?: (value: number) => string;
  /** 是否显示数值文本（通道行等紧凑场景可关闭） */
  showValue?: boolean;
  className?: string;
  disabled?: boolean;
}

const clamp = (min: number, max: number, v: number) =>
  Math.min(max, Math.max(min, v));

/** SVG 极坐标（deg：0 朝上，顺时针为正） */
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
};

/** 旋钮弧线路径：从 -135° 扫到 -135° + 270° * t */
const arcPath = (t: number, r = 28, cx = 32, cy = 32) => {
  const start = -135;
  const end = -135 + 270 * clamp(0, 1, t);
  const p0 = polar(cx, cy, r, start);
  const p1 = polar(cx, cy, r, end);
  const large = 270 * clamp(0, 1, t) > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
};

/**
 * 旋钮：垂直拖动调参（150px 拖满量程）、滚轮微调、双击重置
 * 三明治法则：白底圆体 + 黑描边 + 硬阴影 + 荧光弧小面积高光
 */
export function Knob({
  value,
  min = 0,
  max = 100,
  onChange,
  label,
  color = '#00E5FF',
  size = 56,
  step = 1,
  defaultValue,
  format,
  showValue = true,
  className = '',
  disabled = false,
}: KnobProps) {
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);
  /** 挂载时初值（双击重置回退目标） */
  const initialRef = useRef<number | null>(null);
  if (initialRef.current === null) initialRef.current = value;

  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const quantize = useCallback(
    (v: number) => {
      const q = Math.round((v - min) / step) * step + min;
      // 消除浮点误差
      return clamp(min, max, Math.round(q * 1e6) / 1e6);
    },
    [min, max, step],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startValue: value };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = drag.startY - e.clientY;
    const sensitivity = (max - min) / 150; // 150px 拖满量程
    onChange(quantize(drag.startValue + dy * sensitivity));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const onDoubleClick = () => {
    if (disabled) return;
    onChange(quantize(defaultValue ?? initialRef.current ?? min));
  };

  /* 滚轮调参（BPM 等数值编辑场景） */
  useEffect(() => {
    const el = rootRef.current;
    if (!el || disabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      onChange(quantize(value + delta * step * (e.shiftKey ? 10 : 1)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [value, onChange, quantize, step, disabled]);

  const t = clamp(0, 1, (value - min) / (max - min));
  const angle = -135 + 270 * t;
  const display = format
    ? format(value)
    : `${Math.round(value * 100) / 100}`;

  return (
    <div
      ref={rootRef}
      className={`flex flex-col items-center gap-1 select-none ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={disabled ? -1 : 0}
        className={`relative touch-none ${
          disabled ? '' : 'cursor-grab'
        } ${dragging ? 'cursor-grabbing' : ''}`}
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight')
            onChange(quantize(value + step));
          else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft')
            onChange(quantize(value - step));
        }}
      >
        {/* 荧光值弧（小面积高光） */}
        <svg
          className="pointer-events-none absolute inset-0"
          viewBox="0 0 64 64"
          style={{ width: size, height: size }}
        >
          <path
            d={arcPath(1)}
            fill="none"
            stroke="#A8A8B2"
            strokeWidth={3.5}
            strokeLinecap="round"
            opacity={0.45}
          />
          {t > 0.004 && (
            <path
              d={arcPath(t)}
              fill="none"
              stroke={color}
              strokeWidth={3.5}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 3px ${color})` }}
            />
          )}
        </svg>

        {/* 旋钮体 */}
        <motion.div
          initial={false}
          whileTap={disabled ? undefined : { scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="absolute rounded-full border-2 border-ink bg-card"
          style={{
            inset: size * 0.17,
            boxShadow: '2px 2px 0 #17171C',
          }}
        >
          {/* 指针 */}
          <div
            className="absolute inset-0"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            <div className="absolute top-[8%] left-1/2 h-[32%] w-[3px] -translate-x-1/2 rounded-full bg-ink" />
          </div>
          {/* 中心荧光点 */}
          <div
            className="absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: color, boxShadow: `0 0 4px ${color}` }}
          />
        </motion.div>
      </div>

      {label !== undefined && <span className="label-caps">{label}</span>}
      {showValue && (
        <span className="text-sm font-bold text-ink tabular-nums">{display}</span>
      )}
    </div>
  );
}
