import type { ReactNode } from 'react';

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

interface TooltipProps {
  content: ReactNode;
  side?: TooltipSide;
  children: ReactNode;
  /** 是否启用（默认启用；禁用时直接透传 children） */
  enabled?: boolean;
  className?: string;
}

/** 定位 + 初始滑入偏移（hover 时归位） */
const sideClasses: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2 -translate-y-1 group-hover/tip:translate-y-0',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2 -translate-x-1 group-hover/tip:translate-x-0',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2 translate-y-1 group-hover/tip:translate-y-0',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2 translate-x-1 group-hover/tip:translate-x-0',
};

/**
 * hover 提示气泡（三明治法则：黑底白字小贴纸）
 * 纯 CSS group-hover 实现，带 120ms 延迟避免误触
 */
export function Tooltip({
  content,
  side = 'top',
  children,
  enabled = true,
  className = '',
}: TooltipProps) {
  if (!enabled) return <>{children}</>;

  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 ${sideClasses[side]}`}
      >
        <span className="rounded-lg border-2 border-ink bg-ink px-2 py-1 text-xs font-semibold whitespace-nowrap text-white opacity-0 transition-[opacity,translate] duration-150 delay-120 group-hover/tip:opacity-100">
          {content}
        </span>
      </span>
    </span>
  );
}
