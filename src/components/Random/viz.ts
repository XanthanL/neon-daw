/**
 * Random 可视化共享层：播放头时钟 + 定位工具 + 调色板
 * · uiStore.currentStep 每 16 分才跳一次，直接驱动动画会一顿一顿；
 *   这里锚定「最近一次 step 变更的本地时刻」，rAF 里插值出连续浮点步位
 * · Song 模式之外引擎的 step 语义不同 → 冻结返回锚点步，雨幕停在原位
 */
import { useCallback, useEffect, useRef } from 'react';
import { useUiStore } from '../../stores/uiStore';
import type { DrumType } from '../../types/project';
import type { RoleId, VizSong } from '../../utils/music/types';

/** 浮点绝对步位时钟（0 .. totalBars*16，循环） */
export function useVizClock(viz: VizSong | null): () => number {
  const currentStep = useUiStore((s) => s.currentStep);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const playMode = useUiStore((s) => s.playMode);
  const anchor = useRef({ step: 0, at: 0 });

  useEffect(() => {
    anchor.current = { step: currentStep, at: performance.now() };
  }, [currentStep]);

  const stepMs = viz ? 60000 / viz.bpm / 4 : 250;
  const totalSteps = viz ? viz.totalBars * 16 : 1;

  return useCallback(() => {
    if (!viz) return 0;
    let pos = anchor.current.step;
    if (isPlaying && playMode === 'song') pos += (performance.now() - anchor.current.at) / stepMs;
    return ((pos % totalSteps) + totalSteps) % totalSteps;
  }, [viz, isPlaying, playMode, stepMs, totalSteps]);
}

/** 浮点步 → 全曲和弦序列里的下标（配合 flattenChords 使用） */
export function locateIndex(absSteps: number[], pos: number): number {
  let lo = 0;
  let hi = absSteps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (absSteps[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface FlatChord {
  abs: number;
  lengthSteps: number;
  roman: string;
  voicing: number[];
  section: string;
}

/** 把分段和弦摊平成全曲时间轴（升序），供和声轨/定位共用 */
export function flattenChords(viz: VizSong | null): FlatChord[] {
  if (!viz) return [];
  const out: FlatChord[] = [];
  for (const sec of viz.sections) {
    const base = sec.startBar * 16;
    for (const c of sec.chords) {
      out.push({ abs: base + c.step, lengthSteps: c.lengthSteps, roman: c.roman, voicing: c.voicing, section: sec.name });
    }
  }
  return out;
}

export const ROLE_COLOR: Record<RoleId, string> = {
  bass: '#FF5CA8',
  lead: '#00E5FF',
  keys: '#FFE600',
  pad: '#A78BFA',
  arp: '#39FF88',
};

export const KIT_ORDER: DrumType[] = ['kick', 'snare', 'clap', 'closedHat', 'openHat', 'tom'];

export const KIT_COLOR: Record<DrumType, string> = {
  kick: '#00E5FF',
  snare: '#FF3DBE',
  clap: '#FFE600',
  closedHat: '#39FF88',
  openHat: '#A78BFA',
  tom: '#4D9FFF',
};
