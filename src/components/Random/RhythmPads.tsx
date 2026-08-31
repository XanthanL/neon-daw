/**
 * 节奏挑战打击输入（DOM 按钮，画布只管显示）
 * · compact：桌面/平板卡片下方一排键帽，鼠标可点
 * · stage：手机全屏演奏层底部的四块大打击区（≥96px 高，拇指热区）
 * · 按下态从内核订阅（press/release 才回调，不逐帧 setState）
 * · 不调 setPointerCapture：手指在自身按钮上隐式捕获到抬起，天然无泄漏
 */
import { useEffect, useRef, useState } from 'react';
import { KEY_LABELS, LANES, LANE_COLOR } from './useRhythmRun';

const INK = '#17171C';

export function RhythmPads({
  variant,
  subscribeLanes,
  press,
  release,
}: {
  variant: 'compact' | 'stage';
  subscribeLanes: (cb: (held: boolean[]) => void) => () => void;
  press: (lane: number) => void;
  release: (lane: number) => void;
}) {
  const [held, setHeld] = useState<boolean[]>([false, false, false, false]);
  const stage = variant === 'stage';
  /** 每个按钮当前的 pointerId：多指各按各的轨，抬起不误伤 */
  const owners = useRef<(number | null)[]>([null, null, null, null]);

  useEffect(() => subscribeLanes((next) => setHeld([...next])), [subscribeLanes]);

  const down = (lane: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    owners.current[lane] = e.pointerId;
    press(lane);
  };
  const up = (lane: number) => (e: React.PointerEvent) => {
    const owner = owners.current[lane];
    if (owner !== null && owner !== e.pointerId) return;
    owners.current[lane] = null;
    release(lane);
  };

  return (
    <div className={`grid shrink-0 grid-cols-4 gap-1.5 ${stage ? 'h-full' : ''}`} style={{ touchAction: 'none' }}>
      {Array.from({ length: LANES }, (_, l) => (
        <button
          key={l}
          type="button"
          aria-label={`Lane ${l + 1} · ${KEY_LABELS[l]}`}
          onPointerDown={down(l)}
          onPointerUp={up(l)}
          onPointerCancel={up(l)}
          className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 border-ink font-black select-none transition-all ${
            stage ? 'min-h-[96px] text-2xl' : 'h-11 text-sm'
          }`}
          style={{
            background: held[l] ? LANE_COLOR[l] : 'var(--color-card)',
            color: held[l] ? INK : 'rgba(23,23,28,0.7)',
            boxShadow: held[l]
              ? `1px 1px 0 ${INK}, 0 0 14px ${LANE_COLOR[l]}80`
              : stage
                ? `3px 3px 0 ${INK}`
                : `2px 2px 0 ${INK}`,
            transform: held[l] ? 'translateY(2px)' : undefined,
          }}
        >
          <span
            className={`grid place-items-center rounded-md border-2 border-ink text-[10px] ${
              stage ? 'h-8 w-8' : 'h-5 w-5'
            }`}
            style={{ background: held[l] ? '#ffffff' : LANE_COLOR[l], boxShadow: '1px 1px 0 #17171C' }}
          >
            {l + 1}
          </span>
          {KEY_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
