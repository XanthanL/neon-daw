import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Tooltip, type TooltipSide } from './Tooltip';

export interface IconButtonProps {
  children: ReactNode;
  /** aria-label 与默认 tooltip 文案 */
  label: string;
  onClick?: () => void;
  /** 激活态：荧光填充 + 黑描边 + 辉光 */
  active?: boolean;
  /** 激活荧光色（CSS color） */
  activeColor?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  tooltipSide?: TooltipSide;
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8 [&>svg]:h-4 [&>svg]:w-4',
  md: 'h-10 w-10 [&>svg]:h-5 [&>svg]:w-5',
  lg: 'h-12 w-12 [&>svg]:h-6 [&>svg]:w-6',
} as const;

const INK = '#17171C';
const SPRING = { type: 'spring', stiffness: 300, damping: 20 } as const;

/**
 * 三明治法则图标按钮：
 * 白底 + 2px 黑描边 + 硬阴影（3px 3px 0 不模糊）
 * 按压物理：按下位移 (2,2) 且阴影缩至 1px 1px 贴合，释放 spring 回弹
 */
export function IconButton({
  children,
  label,
  onClick,
  active = false,
  activeColor = '#00E5FF',
  size = 'md',
  disabled = false,
  tooltipSide = 'top',
  className = '',
}: IconButtonProps) {
  const glow = `color-mix(in srgb, ${activeColor} 65%, transparent)`;
  const restShadow = active
    ? `${INK} 3px 3px 0, ${glow} 0 0 10px`
    : `${INK} 3px 3px 0`;
  const hoverShadow = active
    ? `${INK} 5px 5px 0, ${glow} 0 0 12px`
    : `${INK} 5px 5px 0`;
  const tapShadow = active
    ? `${INK} 1px 1px 0, ${glow} 0 0 8px`
    : `${INK} 1px 1px 0`;

  return (
    <Tooltip content={label} side={tooltipSide} enabled={!disabled} className="shrink-0">
      <motion.button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        initial={false}
        style={{ boxShadow: restShadow, backgroundColor: active ? activeColor : '#FFFFFF' }}
        whileHover={disabled ? undefined : { y: -2, boxShadow: hoverShadow }}
        whileTap={
          disabled
            ? undefined
            : { x: 2, y: 2, boxShadow: tapShadow, transition: { duration: 0.06 } }
        }
        transition={SPRING}
        className={`${sizeClasses[size]} ${
          disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
        } inline-flex items-center justify-center rounded-xl border-2 border-ink text-ink transition-colors select-none active:cursor-grabbing ${className}`}
      >
        {children}
      </motion.button>
    </Tooltip>
  );
}
