/**
 * 移动端导航抽屉（替代桌面常驻竖栏，md 以下专用）
 * · 顶栏左上角 Menu 键呼出，默认收起；选中模块后自动关闭（setView 内在 store 收起）
 * · 卷轴动效：面板本身 height 0→auto 用一根 spring 展开，底部卷轴杆贴在面板下沿随行下沉，
 *   视觉上即「铺开 / 卷回」，字形零变形（scaleY 会拉糊文字，两根 spring 还易失步）
 * · 行 = 竖栏同款图标盒（白底黑描边 + 硬阴影，当前模块黑底白图标）+ 名称 + 描述 + 键号
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import { DiscLogo } from './SideNav';
import { MODULES } from './modules';

const SPRING = { type: 'spring', stiffness: 300, damping: 24 } as const;

const ROW = {
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0 },
} as const;

const LIST = {
  initial: {},
  animate: { transition: { staggerChildren: 0.032 } },
  exit: {},
} as const;

export function MobileNavDrawer() {
  const open = useUiStore((s) => s.mobileNavOpen);
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useT();

  /* 关闭途径：左上角光盘锚点 / 遮罩点击 / Esc（捕获阶段吞掉，避免底层同时回首页） */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    /* document click 必须延后一个任务挂载：否则呼出抽屉的那一次 click 继续冒泡到
       document 时被判定为「点击外部」，抽屉刚打开就自己关掉（真机实测打不开） */
    const timer = setTimeout(() => document.addEventListener('click', onClick), 0);
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, setOpen]);

  return createPortal(
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] md:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div className="absolute inset-0 bg-ink/45" aria-hidden />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label={t.nav.moduleNav}
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transitionEnd: { overflow: 'visible' },
              transition: SPRING,
            }}
            exit={{ height: 0, opacity: 0, transition: { duration: 0.22, ease: 'easeIn' } }}
            className="absolute top-0 left-0 flex max-h-[calc(100%-16px)] w-[276px] flex-col overflow-hidden border-r-2 border-ink bg-bg-warm"
          >
            <div className="flex shrink-0 items-center gap-3 px-3.5 pt-3 pb-2.5">
              {/* 与顶栏同一枚光盘：开抽屉用它、关抽屉也用它（单一锚点） */}
              <DiscLogo
                onClick={() => setOpen(false)}
                label={t.nav.close}
                tooltipSide="bottom"
              />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-extrabold tracking-tight text-ink">
                  NeonDAW
                </span>
                <span className="label-caps">{t.nav.select}</span>
              </div>
            </div>
            <div className="mx-3.5 h-0.5 shrink-0 rounded-full bg-ink/15" />

            <motion.ul
              variants={LIST}
              initial="initial"
              animate="animate"
              exit="exit"
              className="min-h-0 flex-1 overflow-y-auto px-3.5 pt-2.5 pb-5"
            >
              {MODULES.map((m, i) => {
                const Icon = m.icon;
                const active = view === m.id;
                return (
                  <motion.li key={m.id} variants={ROW} transition={SPRING}>
                    <button
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setView(m.id)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border-2 border-ink px-2 py-2 text-left transition-all select-none ${
                        active
                          ? 'bg-ink text-white'
                          : 'bg-card text-ink shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
                      }`}
                      style={
                        active
                          ? { boxShadow: `1.5px 1.5px 0 #17171C, 0 0 12px ${m.color}66` }
                          : undefined
                      }
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink ${
                          active ? 'bg-white/10' : 'bg-card'
                        }`}
                      >
                        <Icon className="h-5 w-5" strokeWidth={2.4} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-extrabold">{m.label}</span>
                        <span
                          className={`truncate text-[11px] font-semibold ${
                            active ? 'text-white/70' : 'text-fg-muted'
                          }`}
                        >
                          {t.modules.desc[m.id]}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-lg border-2 px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                          active
                            ? 'border-white/40 bg-white/10 text-white'
                            : 'border-ink/25 bg-panel text-fg-muted'
                        }`}
                      >
                        {i + 1}
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </motion.ul>

            {/* 卷轴杆：贴面板下沿，随铺开自然下行 */}
            <div className="relative h-2.5 w-full shrink-0 border-2 border-ink bg-ink">
              <span className="absolute top-px left-0 h-3.5 w-2 rounded-sm border-2 border-ink bg-neon-cyan" />
              <span className="absolute top-px right-0 h-3.5 w-2 rounded-sm border-2 border-ink bg-neon-cyan" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
