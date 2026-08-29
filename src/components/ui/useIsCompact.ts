/**
 * 紧凑视口判定（与 Tailwind md = 768px 断点对齐）
 * 专用于纯 class 改不动的 JS 数值：网格行高、缩放常量、面板尺寸等
 */
import { useEffect, useState } from 'react';

const COMPACT_QUERY = '(max-width: 767px)';

export function useIsCompact(): boolean {
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const onChange = () => setCompact(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return compact;
}
