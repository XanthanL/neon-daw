/**
 * 浮层抽屉（portal 挂 body）
 * · 默认形态：`md:hidden` 的移动端底部上滑面板（Mixer 效果器链 / Synth 音色库 / 顶栏溢出菜单）
 * · desktopCentered：手机仍是底部抽屉，桌面额外渲染为居中弹窗（md:inset-0 + m-auto 的自动边距居中，
 *   刻意不用 -translate-x/y-1/2 —— 那会和 framer-motion 写入的 transform 抢同一层合成属性）
 * · 遮罩点击 / 面板内 X / Esc 均可关闭
 * · Esc 在捕获阶段吞掉事件（焦点在文本框时例外，交给输入框自己取消编辑），并导出 isOverlayOpen() 供全局快捷键判定，
 *   避免抽屉打开时底层仍响应 1-8 切模块 / Esc 回首页
 * · 关闭判定用 document click（冒泡阶段）而非 pointerdown，且必须延后一个任务才挂载：
 *   同一轮 click 里挂上会把「打开」那次点击判成点击外部而立刻自关（见 useEffect 内注释）
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useT } from '../../i18n/ui';

let openCount = 0;

/** 是否有浮层抽屉处于打开态（全局快捷键据此短路） */
export const isOverlayOpen = () => openCount > 0;

const SPRING = { type: 'spring', stiffness: 380, damping: 34 } as const;

export function OverlaySheet({
  open,
  onClose,
  title,
  children,
  desktopCentered = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** 桌面端也渲染，并改为居中弹窗（手机端始终是底部抽屉） */
  desktopCentered?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    openCount += 1;
    return () => {
      openCount -= 1;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      /* 焦点在文本框时 Esc 归该输入框（取消编辑），不连带关掉整个浮层 */
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      )
        return;
      e.stopPropagation();
      onClose();
    };
    /* 必须延后一个任务再挂 document click：React 18 在离散事件的同步 commit 末尾就会
       flush passive effect，若此刻直接挂上，打开浮层的那一次 click 继续冒泡到 document
       会被当成「点了浮层外面」→ 刚打开就自己关掉（真机/桌面实测浮层永远打不开） */
    const timer = setTimeout(() => document.addEventListener('click', onClick), 0);
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className={`fixed inset-0 z-[80]${desktopCentered ? '' : ' md:hidden'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <div className="absolute inset-0 bg-ink/45" aria-hidden />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0, transition: SPRING }}
            exit={{ y: '100%', transition: { duration: 0.22, ease: 'easeIn' } }}
            className={`absolute inset-x-0 bottom-0 flex max-h-[76vh] flex-col rounded-t-2xl border-2 border-ink bg-bg-warm shadow-hard ${
              desktopCentered
                ? 'md:inset-0 md:h-fit md:max-h-[82vh] md:w-[min(620px,92vw)] md:rounded-2xl md:m-auto'
                : ''
            }`}
          >
            <div className="flex shrink-0 items-center gap-2 border-b-2 border-ink/10 px-4 py-2.5">
              <h3 className="label-caps text-ink">{title}</h3>
              <button
                type="button"
                aria-label={t.overlay.close(title)}
                onClick={onClose}
                className="ml-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-2 border-ink bg-card text-ink shadow-hard-sm transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <X className="h-4 w-4" strokeWidth={2.8} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
