/**
 * 横向滚动容器：符合三明治风格的细滑条 + 左右「边界感」渐隐遮罩。
 * 仅在对应方向还有内容可滚时才显示该侧渐隐，避免内容在边缘生硬消失。
 * 背景色用 header 的米白（from-bg-warm），与放置它的顶栏一致。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export function EdgeScroll({
  children,
  className = '',
  listClassName = '',
  fade = 24,
}: {
  children: ReactNode;
  /** 外层定位容器 class（是父 flex 里的可变宽度项，用 min-w-0 / flex-1 / max-w） */
  className?: string;
  /** 内层滚动元素 class（排布：flex / gap 等） */
  listClassName?: string;
  /** 单侧渐隐宽度 px */
  fade?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [measure, children]);

  return (
    <div className={`relative min-w-0 ${className}`}>
      <div ref={ref} className={`hscroll min-w-0 overflow-x-auto ${listClassName}`}>
        {children}
      </div>
      {edge.left && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 rounded-l-xl bg-gradient-to-r from-bg-warm to-transparent"
          style={{ width: fade }}
        />
      )}
      {edge.right && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 rounded-r-xl bg-gradient-to-l from-bg-warm to-transparent"
          style={{ width: fade }}
        />
      )}
    </div>
  );
}
