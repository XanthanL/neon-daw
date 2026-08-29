import { useEffect, useState } from 'react';
import { engine } from '../../audio/engine';

/**
 * 轨道实时电平（requestAnimationFrame 驱动，~30fps 采样，
 * LevelMeter 自带 CSS 平滑 + 峰值保持）
 */
export function useTrackLevel(trackId: string): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last >= 33) {
        last = t;
        setLevel(engine.getTrackLevel(trackId));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [trackId]);

  return level;
}
