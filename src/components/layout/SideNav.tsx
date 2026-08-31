/**
 * 左侧竖直导航栏（56-64px）：
 * 顶部光盘全局 Logo（黑描边光盘 + 中心荧光环，播放时旋转 + 呼吸脉动，点击回首页）
 * + 五个模块图标竖排（hover Tooltip、当前模块黑底白图标高亮）
 */
import { motion } from 'framer-motion';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import { Tooltip } from '../ui/Tooltip';
import { MODULES } from './modules';

const SPRING = { type: 'spring', stiffness: 300, damping: 20 } as const;

/** 光盘 Logo：播放时旋转 + 中心荧光环呼吸脉动（桌面竖栏 / 移动抽屉 / 移动顶栏共用） */
export function DiscLogo({
  onClick,
  label,
  tooltipSide = 'right',
  className = '',
}: {
  /** 点击行为；默认回首页（桌面竖栏），移动端顶栏用它开合抽屉 */
  onClick?: () => void;
  label?: string;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}) {
  const isPlaying = useUiStore((s) => s.isPlaying);
  const goHome = useUiStore((s) => s.goHome);
  const t = useT();
  const handleClick = onClick ?? goHome;
  const aria = label ?? t.nav.home;

  return (
    <Tooltip content={aria} side={tooltipSide}>
      <motion.button
        type="button"
        aria-label={aria}
        onClick={handleClick}
        initial={false}
        animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
        transition={
          isPlaying
            ? { repeat: Infinity, duration: 2.4, ease: 'linear' }
            : SPRING
        }
        whileTap={{ scale: 0.92 }}
        className={`relative h-11 w-11 shrink-0 cursor-pointer rounded-full border-[3px] border-ink bg-card shadow-hard-sm select-none ${className}`}
      >
        {/* 光盘纹路 */}
        <div className="absolute inset-[12%] rounded-full border-2 border-ink/15" />
        <div className="absolute inset-[26%] rounded-full border-2 border-ink/25" />
        {/* 旋转标记点（让旋转可见） */}
        <div className="absolute top-[14%] left-[30%] h-1.5 w-1.5 rounded-full bg-ink/45" />
        {/* 中心盘 */}
        <div className="absolute inset-[34%] rounded-full border-2 border-ink bg-bg" />
        {/* 中心荧光环：呼吸脉动 */}
        <motion.div
          initial={false}
          animate={isPlaying ? { scale: [1, 1.45, 1] } : { scale: 1 }}
          transition={
            isPlaying
              ? { repeat: Infinity, duration: 1.1, ease: 'easeInOut' }
              : { duration: 0.2 }
          }
          className="absolute top-1/2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-neon-cyan"
          style={{ boxShadow: '0 0 8px rgba(0, 229, 255, 0.8)' }}
        />
      </motion.button>
    </Tooltip>
  );
}

export function SideNav() {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const t = useT();

  return (
    <aside className="z-20 hidden w-[60px] shrink-0 flex-col items-center gap-3 border-r-2 border-ink bg-bg-warm py-3 md:flex">
      <DiscLogo />
      <div className="h-0.5 w-8 rounded-full bg-ink/15" />

      <nav
        className="rail-nav flex min-h-0 w-full flex-1 flex-col items-center gap-2"
        aria-label={t.nav.moduleNav}
      >
        {MODULES.map((m, i) => {
          const Icon = m.icon;
          const active = view === m.id;
          return (
            <Tooltip key={m.id} content={`${m.label} · ${i + 1}`} side="right">
              <motion.button
                type="button"
                aria-label={m.label}
                aria-current={active ? 'page' : undefined}
                onClick={() => setView(m.id)}
                initial={false}
                whileTap={{ x: 2, y: 2, boxShadow: '1px 1px 0 #17171C' }}
                transition={SPRING}
                className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-ink transition-shadow select-none ${
                  active
                    ? 'bg-ink text-white shadow-hard-sm'
                    : 'bg-card text-ink shadow-hard-sm hover:-translate-y-0.5 hover:shadow-hard'
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={2.4} />
              </motion.button>
            </Tooltip>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1 pb-1">
        <span
          className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-neon-cyan"
          style={{ boxShadow: '0 0 6px rgba(0,229,255,0.7)' }}
        />
        <span className="text-[9px] font-bold tracking-widest text-fg-faint uppercase">
          v0.1
        </span>
      </div>
    </aside>
  );
}
