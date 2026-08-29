import { create } from 'zustand';

/** 全局视图模块 */
export type ViewModule =
  | 'home'
  | 'channelRack'
  | 'pianoRoll'
  | 'mixer'
  | 'synth'
  | 'song'
  | 'keyboard'
  | 'random'
  | 'files';

/** 播放模式：单 Pattern 循环 / 整曲编排 */
export type PlayMode = 'pattern' | 'song';

interface UiState {
  /** 当前视图模块（首页总览 / 五大模块） */
  view: ViewModule;
  /** 走带播放状态（由音频引擎驱动） */
  isPlaying: boolean;
  /** 播放模式 */
  playMode: PlayMode;
  /** 循环开关 */
  loopOn: boolean;
  /** 循环长度（小节） */
  loopBars: 1 | 2 | 4;
  /** 节拍器开关 */
  metronomeOn: boolean;
  /** 当前播放步进索引（由音频引擎每步派发，驱动 UI 播放头与时间码） */
  currentStep: number;
  /** 当前编辑目标通道（Synth 面板 / Piano Roll 通道选择） */
  selectedChannelId: string | null;
  /** 移动端抽屉式竖栏是否展开（桌面端常驻竖栏，与此状态无关） */
  mobileNavOpen: boolean;
  /** Pattern 管理器浮层是否打开（顶栏与 ChannelRack 的入口共用） */
  patternManagerOpen: boolean;
  /** Mixer 当前选中轨道（提升到全局，切模块后不丢选中） */
  selectedMixerTrackId: string | null;

  setView: (view: ViewModule) => void;
  goHome: () => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setPlayMode: (mode: PlayMode) => void;
  togglePlayMode: () => void;
  setLoopOn: (on: boolean) => void;
  setLoopBars: (bars: 1 | 2 | 4) => void;
  toggleMetronome: () => void;
  setCurrentStep: (step: number) => void;
  selectChannel: (channelId: string | null) => void;
  setMobileNavOpen: (open: boolean) => void;
  toggleMobileNav: () => void;
  setPatternManagerOpen: (open: boolean) => void;
  selectMixerTrack: (trackId: string | null) => void;
}

/**
 * UI 状态（与可持久化的工程数据分离，刷新不恢复播放态）
 */
export const useUiStore = create<UiState>()((set) => ({
  view: 'home',
  isPlaying: false,
  playMode: 'pattern',
  loopOn: true,
  loopBars: 1,
  metronomeOn: false,
  currentStep: 0,
  selectedChannelId: null,
  mobileNavOpen: false,
  patternManagerOpen: false,
  selectedMixerTrackId: null,

  setView: (view) => set({ view, mobileNavOpen: false }),
  goHome: () => set({ view: 'home', mobileNavOpen: false }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  togglePlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlayMode: (playMode) => set({ playMode }),
  togglePlayMode: () =>
    set((s) => ({ playMode: s.playMode === 'pattern' ? 'song' : 'pattern' })),
  setLoopOn: (loopOn) => set({ loopOn }),
  setLoopBars: (loopBars) => set({ loopBars }),
  toggleMetronome: () => set((s) => ({ metronomeOn: !s.metronomeOn })),
  setCurrentStep: (currentStep) => set({ currentStep }),
  selectChannel: (selectedChannelId) => set({ selectedChannelId }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
  setPatternManagerOpen: (patternManagerOpen) => set({ patternManagerOpen }),
  selectMixerTrack: (selectedMixerTrackId) => set({ selectedMixerTrackId }),
}));
