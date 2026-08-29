import { useEffect, useRef, useState } from 'react';

export interface LevelMeterProps {
  /** 实时电平 0 ~ 1 */
  value: number;
  orientation?: 'vertical' | 'horizontal';
  /** 主轴长度 px */
  length?: number;
  /** 短轴粗细 px */
  thickness?: number;
  /** 峰值保持线（默认开启） */
  showPeak?: boolean;
  className?: string;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 荧光绿 → 荧光黄 → 荧光粉（电平表专用渐变） */
const GRADIENT_VERTICAL = 'linear-gradient(to top, #39FF88 0%, #39FF88 52%, #FFE600 74%, #FF3DBE 100%)';
const GRADIENT_HORIZONTAL = 'linear-gradient(to right, #39FF88 0%, #39FF88 52%, #FFE600 74%, #FF3DBE 100%)';

/** 峰值衰减速率（值/秒） */
const PEAK_DECAY = 0.28;

/**
 * 电平表：荧光绿→黄→粉渐变细条，接受 0-1 实时值
 * 内置峰值保持（黑色峰值线缓慢回落）
 */
export function LevelMeter({
  value,
  orientation = 'vertical',
  length = 140,
  thickness = 10,
  showPeak = true,
  className = '',
}: LevelMeterProps) {
  const [peak, setPeak] = useState(0);
  const peakRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  /* 峰值保持：随时间缓慢衰减，被新值顶起 */
  useEffect(() => {
    const now = performance.now();
    const dt = lastTimeRef.current === null ? 0 : (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;
    const next = Math.max(peakRef.current - PEAK_DECAY * dt, clamp01(value));
    if (next !== peakRef.current) {
      peakRef.current = next;
      setPeak(next);
    }
  }, [value]);

  const v = clamp01(value);
  const vertical = orientation === 'vertical';
  const fillStyle = vertical
    ? { height: `${v * 100}%`, width: '100%', bottom: 0, left: 0 }
    : { width: `${v * 100}%`, height: '100%', left: 0, top: 0 };

  const peakStyle = vertical
    ? { bottom: `${peak * 100}%`, left: 0, right: 0, height: 2 }
    : { left: `${peak * 100}%`, top: 0, bottom: 0, width: 2 };

  return (
    <div
      aria-hidden
      className={`relative overflow-hidden rounded-full border-2 border-ink bg-panel ${className}`}
      style={
        vertical
          ? { width: thickness, height: length }
          : { width: length, height: thickness }
      }
    >
      {/* 荧光渐变填充 */}
      <div
        className="absolute transition-[height,width] duration-75 ease-linear"
        style={{
          ...fillStyle,
          background: vertical ? GRADIENT_VERTICAL : GRADIENT_HORIZONTAL,
          boxShadow: '0 0 6px rgba(57, 255, 136, 0.55)',
        }}
      />
      {/* 峰值保持线 */}
      {showPeak && (
        <div
          className="absolute bg-ink transition-[bottom,left] duration-100 ease-linear"
          style={peakStyle}
        />
      )}
    </div>
  );
}
