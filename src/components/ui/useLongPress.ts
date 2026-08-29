/**
 * 长按手势（触屏补位 hover / 右键才有的操作：删除音符、重置参数等）
 * · 位移超过 8px 或提前抬起则取消计时
 * · 触发后置 longPressedRef，消费方在 onClick 首行短路，避免同一次点击又选中/落笔
 * · 拦截 contextmenu，阻止浏览器自己的长按菜单抢占
 */
import { useEffect, useRef } from 'react';

export interface LongPressBinding {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  /** 本次手势已触发长按：随后的 click 应忽略 */
  longPressedRef: { current: boolean };
}

const CANCEL_DISTANCE = 8;

export function useLongPress(onLongPress: () => void, delay = 450): LongPressBinding {
  const actionRef = useRef(onLongPress);
  actionRef.current = onLongPress;

  const timerRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const longPressedRef = useRef(false);

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
  };

  useEffect(() => clear, []);

  return {
    longPressedRef,
    onPointerDown: (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      clear();
      longPressedRef.current = false;
      originRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        originRef.current = null;
        longPressedRef.current = true;
        actionRef.current();
      }, delay);
    },
    onPointerMove: (e) => {
      const origin = originRef.current;
      if (!origin || timerRef.current === null) return;
      if (
        Math.abs(e.clientX - origin.x) > CANCEL_DISTANCE ||
        Math.abs(e.clientY - origin.y) > CANCEL_DISTANCE
      ) {
        clear();
      }
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (e) => e.preventDefault(),
  };
}
