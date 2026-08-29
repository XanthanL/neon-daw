import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type {
  Channel,
  DrumTuneParams,
  DrumType,
  FxType,
  MixerTrack,
  Note,
  Pattern,
  Project,
  StepData,
  SynthParams,
} from '../types/project';
import { useHistoryStore } from './historyStore';
import { SAMPLE_INSTRUMENTS } from '../audio/samples';

/* ============================================================
 * 工具
 * ============================================================ */

let idCounter = 0;
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

const clamp = (min: number, max: number, v: number) =>
  Math.min(max, Math.max(min, v));

const emptyStep = (): StepData => ({ on: false, velocity: 100 });

/** 生成某 pattern 下所有通道的空步进 */
const makeEmptySteps = (channelIds: string[], barCount: number): Record<string, StepData[]> => {
  const steps: Record<string, StepData[]> = {};
  for (const id of channelIds) {
    steps[id] = Array.from({ length: barCount * 16 }, emptyStep);
  }
  return steps;
};

/** 截断/补齐步进数组到目标长度 */
const resizeSteps = (steps: StepData[], target: number): StepData[] => {
  if (steps.length > target) return steps.slice(0, target);
  const out = [...steps];
  while (out.length < target) out.push(emptyStep());
  return out;
};

/** 从 store state 提取纯 Project 数据（历史快照 / 持久化共用） */
const toProject = (s: ProjectState): Project => ({
  bpm: s.bpm,
  currentPatternId: s.currentPatternId,
  patterns: s.patterns,
  channels: s.channels,
  mixerTracks: s.mixerTracks,
  song: s.song,
});

/* ============================================================
 * 通道功能色（荧光家族 8 色）
 * ============================================================ */

const CHANNEL_COLORS = {
  cyan: '#00E5FF',
  pink: '#FF3DBE',
  yellow: '#FFE600',
  green: '#39FF88',
  purple: '#A78BFA',
  blue: '#4D9FFF',
  orange: '#FF9F1C',
  magenta: '#FF5CA8',
} as const;

/* ============================================================
 * 效果器默认参数（添加效果器时的初始 params）
 * ============================================================ */

const FX_DEFAULT_PARAMS: Record<FxType, Record<string, number>> = {
  reverb: { decay: 2, preDelay: 0.02, wet: 0.3 },
  feedbackDelay: { delayTime: 0.25, feedback: 0.35, wet: 0.3 },
  pingPongDelay: { delayTime: 0.25, feedback: 0.3, wet: 0.3 },
  eq3: { low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 },
  filter: { type: 0, frequency: 1000, q: 1 },
  autoFilter: { frequency: 1, depth: 0.5, baseFrequency: 500, octaves: 2, wet: 0.5 },
  compressor: { threshold: -24, knee: 12, ratio: 4, attack: 0.003, release: 0.1 },
  chorus: { frequency: 2, delayTime: 0.004, depth: 0.6, wet: 0.4 },
  phaser: { frequency: 0.5, octaves: 3, wet: 0.4 },
  distortion: { distortion: 0.3, wet: 0.2 },
  bitCrusher: { bits: 6, wet: 0.2 },
  tremolo: { frequency: 5, depth: 0.6 },
  limiter: { threshold: -1 },
  stereoWidener: { width: 0.7 },
};

/* ============================================================
 * 合成器默认音色
 * ============================================================ */

/** 干净钢琴（减法合成近似）：triangle 基音 + 高通亮泛音、快起音、长衰减无持续 */
const pianoSynthParams = (): SynthParams => ({
  osc1Waveform: 'triangle',
  osc1Octave: 0,
  osc1Level: 0.9,
  osc2Waveform: 'sine',
  osc2Octave: 1,
  osc2Detune: 3,
  osc2Level: 0.2,
  filterType: 'lowpass',
  filterCutoff: 4500,
  filterQ: 0.6,
  filterEnvAmount: 0.12,
  attack: 0.002,
  decay: 1.8,
  sustain: 0.0,
  release: 1.4,
  volume: 0.8,
});

const bassSynthParams = (): SynthParams => ({
  osc1Waveform: 'sine',
  osc1Octave: -1,
  osc1Level: 0.9,
  osc2Waveform: 'triangle',
  osc2Octave: 0,
  osc2Detune: 3,
  osc2Level: 0.4,
  filterType: 'lowpass',
  filterCutoff: 900,
  filterQ: 2,
  filterEnvAmount: 0.4,
  attack: 0.005,
  decay: 0.3,
  sustain: 0.5,
  release: 0.3,
  volume: 0.85,
});

/* ============================================================
 * 默认工程：1 个 Pattern + 6 鼓组通道 + 2 合成器通道 + 对应混音轨 + Master
 * ============================================================ */

const buildDefaultProject = (): Project => {
  /* 鼓组通道定义（合成式 808 风格） */
  const drumDefs: { drumType: DrumType; name: string; color: string }[] = [
    { drumType: 'kick', name: 'Kick', color: CHANNEL_COLORS.cyan },
    { drumType: 'snare', name: 'Snare', color: CHANNEL_COLORS.pink },
    { drumType: 'clap', name: 'Clap', color: CHANNEL_COLORS.yellow },
    { drumType: 'closedHat', name: 'Closed Hat', color: CHANNEL_COLORS.green },
    { drumType: 'openHat', name: 'Open Hat', color: CHANNEL_COLORS.purple },
    { drumType: 'tom', name: 'Tom', color: CHANNEL_COLORS.blue },
  ];

  /* 合成器通道定义 */
  const synthDefs: {
    name: string;
    color: string;
    params: () => SynthParams;
    sample: string;
  }[] = [
    { name: 'Clean Piano', color: CHANNEL_COLORS.yellow, params: pianoSynthParams, sample: SAMPLE_INSTRUMENTS.piano },
    { name: 'Deep Bass', color: CHANNEL_COLORS.magenta, params: bassSynthParams, sample: SAMPLE_INSTRUMENTS.bass },
  ];

  const channels: Channel[] = [];
  const mixerTracks: MixerTrack[] = [];

  for (const d of drumDefs) {
    const id = `ch-${d.drumType}`;
    channels.push({
      id,
      name: d.name,
      kind: 'drum',
      color: d.color,
      drumType: d.drumType,
      mixerTrackId: `track-${d.drumType}`,
    });
    mixerTracks.push({
      id: `track-${d.drumType}`,
      name: d.name,
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      effects: [],
    });
  }

  for (let i = 0; i < synthDefs.length; i++) {
    const d = synthDefs[i];
    const id = `ch-synth-${i + 1}`;
    channels.push({
      id,
      name: d.name,
      kind: 'synth',
      color: d.color,
      synthParams: d.params(),
      sampleInstrument: d.sample,
      mixerTrackId: `track-synth-${i + 1}`,
    });
    mixerTracks.push({
      id: `track-synth-${i + 1}`,
      name: d.name,
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      effects: [],
    });
  }

  /* Master 轨（默认挂 Limiter） */
  mixerTracks.push({
    id: 'track-master',
    name: 'Master',
    volume: 0.85,
    pan: 0,
    mute: false,
    solo: false,
    effects: [
      {
        id: 'fx-master-limiter',
        type: 'limiter',
        params: { ...FX_DEFAULT_PARAMS.limiter },
        bypass: false,
      },
    ],
  });

  /* 默认 Pattern：基础鼓花（4/4 Kick + 军鼓反拍 + 闭镲 offbeat） */
  const patternId = 'pattern-1';
  const steps = makeEmptySteps(channels.map((c) => c.id), 1);
  const trigger: [string, number[]][] = [
    ['ch-kick', [0, 4, 8, 12]],
    ['ch-snare', [4, 12]],
    ['ch-closedHat', [2, 6, 10, 14]],
  ];
  for (const [channelId, indices] of trigger) {
    for (const i of indices) {
      steps[channelId][i] = { on: true, velocity: 100 };
    }
  }

  const patterns: Pattern[] = [
    { id: patternId, name: 'Pattern 1', bars: 1, steps, notes: [] },
  ];

  return {
    bpm: 120,
    currentPatternId: patternId,
    patterns,
    channels,
    mixerTracks,
    song: {
      tracks: Array.from({ length: 6 }, (_, i) => ({
        id: `song-track-${i + 1}`,
        clips: [],
      })),
    },
  };
};

/* ============================================================
 * 持久化：localStorage + 防抖自动保存（500ms）
 * ============================================================ */

const SAVE_DEBOUNCE_MS = 500;
const pendingWrites = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();

const flushPendingWrites = () => {
  for (const [name, { value, timer }] of pendingWrites) {
    clearTimeout(timer);
    try {
      localStorage.setItem(name, value);
    } catch {
      /* 存储配额/隐私模式失败时静默 */
    }
    pendingWrites.delete(name);
  }
};

/* 页面卸载前强制落盘，防止防抖窗口内丢失最后一次编辑 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPendingWrites);
}

const debouncedStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    const existing = pendingWrites.get(name);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => {
      const entry = pendingWrites.get(name);
      if (entry) {
        try {
          localStorage.setItem(name, entry.value);
        } catch {
          /* ignore */
        }
        pendingWrites.delete(name);
      }
    }, SAVE_DEBOUNCE_MS);
    pendingWrites.set(name, { value, timer });
  },
  removeItem: (name) => {
    const existing = pendingWrites.get(name);
    if (existing) {
      clearTimeout(existing.timer);
      pendingWrites.delete(name);
    }
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

/* ============================================================
 * Store
 * ============================================================ */

export interface ProjectState extends Project {
  /* 走带 */
  setBpm: (bpm: number) => void;
  /* Pattern 管理 */
  setCurrentPatternId: (patternId: string) => void;
  addPattern: (name?: string) => string;
  duplicatePattern: (patternId: string) => string;
  renamePattern: (patternId: string, name: string) => void;
  setPatternBars: (patternId: string, bars: Pattern['bars']) => void;
  /** 删除 Pattern：同时级联删除引用它的 Song 片段；最后一个不可删 */
  removePattern: (patternId: string) => void;
  /** 清空 Pattern 的步进与音符（保留长度与名称） */
  clearPattern: (patternId: string) => void;
  /* 步进编辑（作用于当前 Pattern，进撤销历史） */
  toggleStep: (channelId: string, stepIndex: number) => void;
  setStepVelocity: (channelId: string, stepIndex: number, velocity: number) => void;
  /** 批量调整同一通道多个步的力度（一次涂抹手势只记一条历史） */
  setStepsVelocity: (channelId: string, updates: { index: number; velocity: number }[]) => void;
  /* 音符 CRUD（作用于当前 Pattern，进撤销历史） */
  addNote: (note: Omit<Note, 'id'>) => string;
  updateNote: (noteId: string, patch: Partial<Omit<Note, 'id' | 'channelId'>>) => void;
  removeNote: (noteId: string) => void;
  /** 批量更新多个音符（一次拖拽手势只记一条历史） */
  updateNotes: (updates: { id: string; patch: Partial<Omit<Note, 'id' | 'channelId'>> }[]) => void;
  /** 批量删除音符 */
  removeNotes: (noteIds: string[]) => void;
  /* 通道合成器参数 */
  setChannelSynthParams: (channelId: string, patch: Partial<SynthParams>) => void;
  /* 通道鼓调音参数（音高/衰减） */
  setChannelDrumParams: (channelId: string, patch: Partial<DrumTuneParams>) => void;
  /* 混音 */
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  setMasterVolume: (volume: number) => void;
  /* 导入 / 新建 */
  /** 导入工程：校验失败返回 false 且不改动 state；成功则清空历史并替换工程数据 */
  importProject: (data: unknown) => boolean;
  /** 重置为空白默认工程（清空历史） */
  newProject: () => void;
  /* 效果器管理 */
  addEffect: (trackId: string, type: FxType) => string;
  removeEffect: (trackId: string, fxId: string) => void;
  toggleEffectBypass: (trackId: string, fxId: string) => void;
  setEffectParam: (trackId: string, fxId: string, key: string, value: number) => void;
  /* 编曲（Song） */
  addClip: (trackId: string, patternId: string, startBar: number) => string;
  moveClip: (trackId: string, clipId: string, startBar: number, toTrackId?: string) => void;
  removeClip: (trackId: string, clipId: string) => void;
  copyClip: (trackId: string, clipId: string) => string;
}

export const PROJECT_STORAGE_KEY = 'web-music-studio:project';

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => {
      /** 编辑操作完成后记录历史（before = 操作前快照） */
      const recordHistory = (label: string, before: Project) => {
        const after = toProject(get());
        useHistoryStore.getState().record(label, before, after);
      };

      /** 对当前 Pattern 应用步进变更 */
      const mutateCurrentPattern = (
        fn: (p: Pattern) => Pattern,
      ) => {
        set((s) => ({
          patterns: s.patterns.map((p) =>
            p.id === s.currentPatternId ? fn(p) : p,
          ),
        }));
      };

      /** 读当前通道步进（自动补齐长度） */
      const readChannelSteps = (p: Pattern, channelId: string): StepData[] =>
        resizeSteps(p.steps[channelId] ?? [], p.bars * 16);

      /** 更新某条混音轨 */
      const updateTrack = (trackId: string, patch: Partial<MixerTrack>) => {
        set((s) => ({
          mixerTracks: s.mixerTracks.map((t) =>
            t.id === trackId ? { ...t, ...patch } : t,
          ),
        }));
      };

      return {
        ...buildDefaultProject(),

        /* ---------------- 走带 ---------------- */
        setBpm: (bpm) => set({ bpm: clamp(60, 200, Math.round(bpm)) }),

        /* ---------------- Pattern 管理 ---------------- */
        setCurrentPatternId: (patternId) => set({ currentPatternId: patternId }),

        addPattern: (name) => {
          const before = toProject(get());
          const s = get();
          const id = nextId('pattern');
          const taken = new Set(s.patterns.map((p) => p.name));
          let n = s.patterns.length + 1;
          while (taken.has(`Pattern ${n}`)) n++;
          const pattern: Pattern = {
            id,
            name: name?.trim() || `Pattern ${n}`,
            bars: 1,
            steps: makeEmptySteps(s.channels.map((c) => c.id), 1),
            notes: [],
          };
          set({ patterns: [...s.patterns, pattern], currentPatternId: id });
          recordHistory('新增 Pattern', before);
          return id;
        },

        duplicatePattern: (patternId) => {
          const before = toProject(get());
          const s = get();
          const source = s.patterns.find((p) => p.id === patternId);
          if (!source) return '';
          const id = nextId('pattern');
          const copy: Pattern = {
            id,
            name: `${source.name} 副本`,
            bars: source.bars,
            steps: Object.fromEntries(
              Object.entries(source.steps).map(([chId, arr]) => [
                chId,
                arr.map((st) => ({ ...st })),
              ]),
            ),
            notes: source.notes.map((n) => ({ ...n, id: nextId('note') })),
          };
          set({ patterns: [...s.patterns, copy], currentPatternId: id });
          recordHistory('复制 Pattern', before);
          return id;
        },

        renamePattern: (patternId, name) => {
          const before = toProject(get());
          set((s) => ({
            patterns: s.patterns.map((p) =>
              p.id === patternId ? { ...p, name } : p,
            ),
          }));
          recordHistory('重命名 Pattern', before);
        },

        setPatternBars: (patternId, bars) => {
          const before = toProject(get());
          set((s) => ({
            patterns: s.patterns.map((p) => {
              if (p.id !== patternId || p.bars === bars) return p;
              const stepCount = bars * 16;
              /* steps 逐通道裁到位，缺失通道补齐；越界音符裁短或丢弃 */
              const steps: Record<string, StepData[]> = {};
              for (const c of s.channels) {
                steps[c.id] = resizeSteps(p.steps[c.id] ?? [], stepCount);
              }
              for (const chId of Object.keys(p.steps)) {
                if (!steps[chId]) steps[chId] = resizeSteps(p.steps[chId], stepCount);
              }
              return {
                ...p,
                bars,
                steps,
                notes: p.notes.flatMap((n) =>
                  n.startStep >= stepCount
                    ? []
                    : [
                        {
                          ...n,
                          lengthSteps: Math.min(
                            n.lengthSteps,
                            stepCount - n.startStep,
                          ),
                        },
                      ],
                ),
              };
            }),
          }));
          recordHistory('修改 Pattern 长度', before);
        },

        removePattern: (patternId) => {
          const s = get();
          if (s.patterns.length <= 1) return;
          const before = toProject(s);
          const patterns = s.patterns.filter((p) => p.id !== patternId);
          set({
            patterns,
            /* 级联清掉引用该 Pattern 的编排片段，避免留下静音孤儿 clip */
            song: {
              tracks: s.song.tracks.map((t) => ({
                ...t,
                clips: t.clips.filter((c) => c.patternId !== patternId),
              })),
            },
            currentPatternId:
              s.currentPatternId === patternId
                ? patterns[0].id
                : s.currentPatternId,
          });
          recordHistory('删除 Pattern', before);
        },

        clearPattern: (patternId) => {
          const before = toProject(get());
          set((s) => ({
            patterns: s.patterns.map((p) => {
              if (p.id !== patternId) return p;
              /* 通道全集 ∪ 已有步进键：懒创建过的通道不能被我清空时丢掉 */
              const ids = [...new Set([...s.channels.map((c) => c.id), ...Object.keys(p.steps)])];
              return {
                ...p,
                steps: makeEmptySteps(ids, p.bars),
                notes: [],
              };
            }),
          }));
          recordHistory('清空 Pattern', before);
        },

        /* ---------------- 步进编辑 ---------------- */
        toggleStep: (channelId, stepIndex) => {
          const before = toProject(get());
          mutateCurrentPattern((p) => {
            const steps = readChannelSteps(p, channelId).map((st, i) =>
              i === stepIndex ? { ...st, on: !st.on } : st,
            );
            return { ...p, steps: { ...p.steps, [channelId]: steps } };
          });
          recordHistory('切换步进', before);
        },

        setStepVelocity: (channelId, stepIndex, velocity) => {
          const before = toProject(get());
          const v = clamp(0, 127, Math.round(velocity));
          mutateCurrentPattern((p) => {
            const steps = readChannelSteps(p, channelId).map((st, i) =>
              i === stepIndex ? { ...st, velocity: v } : st,
            );
            return { ...p, steps: { ...p.steps, [channelId]: steps } };
          });
          recordHistory('调整步进力度', before);
        },

        setStepsVelocity: (channelId, updates) => {
          if (updates.length === 0) return;
          const before = toProject(get());
          const velByIndex = new Map(
            updates.map((u) => [u.index, clamp(0, 127, Math.round(u.velocity))]),
          );
          mutateCurrentPattern((p) => {
            const steps = readChannelSteps(p, channelId).map((st, i) => {
              const v = velByIndex.get(i);
              return v === undefined ? st : { ...st, velocity: v };
            });
            return { ...p, steps: { ...p.steps, [channelId]: steps } };
          });
          recordHistory('调整步进力度', before);
        },

        /* ---------------- 音符 CRUD ---------------- */
        addNote: (note) => {
          const before = toProject(get());
          const id = nextId('note');
          mutateCurrentPattern((p) => ({
            ...p,
            notes: [...p.notes, { ...note, id }],
          }));
          recordHistory('添加音符', before);
          return id;
        },

        updateNote: (noteId, patch) => {
          const before = toProject(get());
          mutateCurrentPattern((p) => ({
            ...p,
            notes: p.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
          }));
          recordHistory('编辑音符', before);
        },

        removeNote: (noteId) => {
          const before = toProject(get());
          mutateCurrentPattern((p) => ({
            ...p,
            notes: p.notes.filter((n) => n.id !== noteId),
          }));
          recordHistory('删除音符', before);
        },

        updateNotes: (updates) => {
          if (updates.length === 0) return;
          const before = toProject(get());
          const patchById = new Map(updates.map((u) => [u.id, u.patch]));
          mutateCurrentPattern((p) => ({
            ...p,
            notes: p.notes.map((n) => {
              const patch = patchById.get(n.id);
              return patch ? { ...n, ...patch } : n;
            }),
          }));
          recordHistory('编辑音符', before);
        },

        removeNotes: (noteIds) => {
          if (noteIds.length === 0) return;
          const before = toProject(get());
          const ids = new Set(noteIds);
          mutateCurrentPattern((p) => ({
            ...p,
            notes: p.notes.filter((n) => !ids.has(n.id)),
          }));
          recordHistory('删除音符', before);
        },

        /* ---------------- 通道合成器参数 ---------------- */
        setChannelSynthParams: (channelId, patch) => {
          set((s) => ({
            channels: s.channels.map((c) =>
              c.id === channelId && c.kind === 'synth' && c.synthParams
                ? { ...c, synthParams: { ...c.synthParams, ...patch } }
                : c,
            ),
          }));
        },

        /* ---------------- 通道鼓调音参数 ---------------- */
        setChannelDrumParams: (channelId, patch) => {
          set((s) => ({
            channels: s.channels.map((c) =>
              c.id === channelId && c.kind === 'drum'
                ? {
                    ...c,
                    drumParams: {
                      tune: c.drumParams?.tune ?? 0,
                      decay: c.drumParams?.decay ?? 0.3,
                      ...patch,
                    },
                  }
                : c,
            ),
          }));
        },

        /* ---------------- 混音 ---------------- */
        setTrackVolume: (trackId, volume) =>
          updateTrack(trackId, { volume: clamp(0, 1, volume) }),

        setTrackPan: (trackId, pan) =>
          updateTrack(trackId, { pan: clamp(-1, 1, pan) }),

        toggleTrackMute: (trackId) => {
          const track = get().mixerTracks.find((t) => t.id === trackId);
          if (track) updateTrack(trackId, { mute: !track.mute });
        },

        toggleTrackSolo: (trackId) => {
          const track = get().mixerTracks.find((t) => t.id === trackId);
          if (track) updateTrack(trackId, { solo: !track.solo });
        },

        setMasterVolume: (volume) =>
          updateTrack('track-master', { volume: clamp(0, 1, volume) }),

        /* ---------------- 导入 / 新建 ---------------- */
        importProject: (data) => {
          if (!data || typeof data !== 'object') return false;
          const p = data as Partial<Project>;
          if (
            !Array.isArray(p.patterns) ||
            !Array.isArray(p.channels) ||
            !Array.isArray(p.mixerTracks) ||
            !p.song ||
            !Array.isArray((p.song as { tracks?: unknown }).tracks)
          ) {
            return false;
          }
          const project: Project = {
            bpm: clamp(60, 200, typeof p.bpm === 'number' ? p.bpm : 120),
            currentPatternId:
              typeof p.currentPatternId === 'string' && p.currentPatternId
                ? p.currentPatternId
                : (p.patterns as Pattern[])[0]?.id ?? '',
            patterns: p.patterns as Pattern[],
            channels: p.channels as Project['channels'],
            mixerTracks: p.mixerTracks as MixerTrack[],
            song: p.song as Project['song'],
          };
          useHistoryStore.getState().clear();
          set(project);
          return true;
        },

        newProject: () => {
          useHistoryStore.getState().clear();
          set(buildDefaultProject());
        },

        /* ---------------- 效果器管理 ---------------- */
        addEffect: (trackId, type) => {
          const id = nextId('fx');
          set((s) => ({
            mixerTracks: s.mixerTracks.map((t) =>
              t.id === trackId
                ? {
                    ...t,
                    effects: [
                      ...t.effects,
                      { id, type, params: { ...FX_DEFAULT_PARAMS[type] }, bypass: false },
                    ],
                  }
                : t,
            ),
          }));
          return id;
        },

        removeEffect: (trackId, fxId) => {
          set((s) => ({
            mixerTracks: s.mixerTracks.map((t) =>
              t.id === trackId
                ? { ...t, effects: t.effects.filter((f) => f.id !== fxId) }
                : t,
            ),
          }));
        },

        toggleEffectBypass: (trackId, fxId) => {
          set((s) => ({
            mixerTracks: s.mixerTracks.map((t) =>
              t.id === trackId
                ? {
                    ...t,
                    effects: t.effects.map((f) =>
                      f.id === fxId ? { ...f, bypass: !f.bypass } : f,
                    ),
                  }
                : t,
            ),
          }));
        },

        setEffectParam: (trackId, fxId, key, value) => {
          set((s) => ({
            mixerTracks: s.mixerTracks.map((t) =>
              t.id === trackId
                ? {
                    ...t,
                    effects: t.effects.map((f) =>
                      f.id === fxId
                        ? { ...f, params: { ...f.params, [key]: value } }
                        : f,
                    ),
                  }
                : t,
            ),
          }));
        },

        /* ---------------- 编曲（Song） ---------------- */
        addClip: (trackId, patternId, startBar) => {
          const before = toProject(get());
          const id = nextId('clip');
          set((s) => ({
            song: {
              tracks: s.song.tracks.map((t) =>
                t.id === trackId
                  ? {
                      ...t,
                      clips: [
                        ...t.clips,
                        { id, patternId, startBar: Math.max(0, Math.round(startBar)) },
                      ],
                    }
                  : t,
              ),
            },
          }));
          recordHistory('添加片段', before);
          return id;
        },

        moveClip: (trackId, clipId, startBar, toTrackId) => {
          const before = toProject(get());
          const s = get();
          const clip = s.song.tracks
            .find((t) => t.id === trackId)
            ?.clips.find((c) => c.id === clipId);
          if (!clip) return;
          const newStart = Math.max(0, Math.round(startBar));
          set({
            song: {
              tracks: s.song.tracks.map((t) => {
                if (t.id === trackId) {
                  const rest = t.clips.filter((c) => c.id !== clipId);
                  if (toTrackId && toTrackId !== trackId) return { ...t, clips: rest };
                  return {
                    ...t,
                    clips: t.clips.map((c) =>
                      c.id === clipId ? { ...c, startBar: newStart } : c,
                    ),
                  };
                }
                if (toTrackId && t.id === toTrackId) {
                  return {
                    ...t,
                    clips: [...t.clips, { ...clip, startBar: newStart }],
                  };
                }
                return t;
              }),
            },
          });
          recordHistory('移动片段', before);
        },

        removeClip: (trackId, clipId) => {
          const before = toProject(get());
          set((s) => ({
            song: {
              tracks: s.song.tracks.map((t) =>
                t.id === trackId
                  ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
                  : t,
              ),
            },
          }));
          recordHistory('删除片段', before);
        },

        copyClip: (trackId, clipId) => {
          const before = toProject(get());
          const s = get();
          const clip = s.song.tracks
            .find((t) => t.id === trackId)
            ?.clips.find((c) => c.id === clipId);
          const id = nextId('clip');
          if (!clip) return '';
          set({
            song: {
              tracks: s.song.tracks.map((t) =>
                t.id === trackId
                  ? {
                      ...t,
                      clips: [
                        ...t.clips,
                        {
                          id,
                          patternId: clip.patternId,
                          startBar: clip.startBar + 1,
                        },
                      ],
                    }
                  : t,
              ),
            },
          });
          recordHistory('复制片段', before);
          return id;
        },
      };
    },
    {
      name: PROJECT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (state) => toProject(state),
    },
  ),
);

/** 供开发调试/后续导入导出使用：读取当前工程纯数据 */
export const getProjectSnapshot = (): Project => toProject(useProjectStore.getState());
