/**
 * 选择条：桌面（md+）保持横向滚动，手机端收成一行触发按钮（显示当前项/标题），
 * 点一下展开把所有选项铺开换行显示再选择 —— 比在小屏上来回滑好找。
 * dropdown = true 时展开面板悬挂为浮层（顶栏用，不挤压单行布局）。
 */
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function ExpandStrip({
  summary,
  icon,
  children,
  className = '',
  listClassName = '',
  dropdown = false,
}: {
  /** 手机收起时触发按钮上的文字（一般是当前选中项名称） */
  summary: ReactNode;
  /** 触发按钮上的小图标（可选） */
  icon?: ReactNode;
  children: ReactNode;
  /** 外层定位容器 class（在父 flex 里的伸缩：min-w-0 / flex-1 等） */
  className?: string;
  /** 选项排布 class（gap 等） */
  listClassName?: string;
  dropdown?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /* 点击外部收起；延迟一帧挂监听，避免本次展开的点击立刻把自己关掉（React 18 同步副作用） */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const tid = window.setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
    return () => {
      window.clearTimeout(tid);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  /* 点到面板内任意按钮（选中一项）即收起。必须是冒泡 onClick 而不是 capture：
     React 18 离散事件同步 flush，capture 里收起会先卸载面板 DOM，
     子按钮自己的 onClick 就永远收不到这个事件（实测踩过） */
  const closeOnPick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border-2 border-ink bg-card px-2.5 py-1.5 text-xs font-extrabold text-ink shadow-hard-sm transition-all select-none md:hidden ${
          open ? '' : 'active:translate-y-0.5 active:shadow-none'
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {icon}
          <span className="truncate">{summary}</span>
        </span>
        <ChevronDown
          strokeWidth={2.6}
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          onClick={closeOnPick}
          className={
            dropdown
              ? `absolute top-full right-0 z-30 mt-1.5 flex max-h-56 w-64 max-w-[calc(100vw-6rem)] flex-wrap gap-1.5 overflow-y-auto rounded-xl border-2 border-ink bg-bg-warm p-2 shadow-hard md:hidden ${listClassName}`
              : `mt-1.5 flex flex-wrap gap-1.5 md:hidden ${listClassName}`
          }
        >
          {children}
        </div>
      )}

      {/* 桌面：原样横向滚动 */}
      <div className={`hscroll hidden min-w-0 items-center overflow-x-auto md:flex ${listClassName}`}>
        {children}
      </div>
    </div>
  );
}
