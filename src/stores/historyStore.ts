import { create } from 'zustand';
import type { Project } from '../types/project';
import { useProjectStore } from './projectStore';

/**
 * 撤销/重做历史栈（快照式框架）
 * - 编辑操作（步进/音符）在 projectStore 中通过 record() push 快照
 * - undo/redo 直接将快照写回 projectStore（浅合并，保留 actions）
 */
export interface HistoryEntry {
  label: string;
  before: Project; // 操作前工程快照
  after: Project; // 操作后工程快照
}

const HISTORY_LIMIT = 50;

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** 记录一次可撤销的编辑（新编辑会清空 redo 分支） */
  record: (label: string, before: Project, after: Project) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  past: [],
  future: [],

  record: (label, before, after) =>
    set((s) => ({
      past: [...s.past, { label, before, after }].slice(-HISTORY_LIMIT),
      future: [],
    })),

  undo: () => {
    const { past } = get();
    if (past.length === 0) return null;
    const entry = past[past.length - 1];
    // 快照浅合并回 projectStore（只覆盖数据字段，actions 保留）
    useProjectStore.setState({ ...entry.before });
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [...s.future, entry],
    }));
    return entry;
  },

  redo: () => {
    const { future } = get();
    if (future.length === 0) return null;
    const entry = future[future.length - 1];
    useProjectStore.setState({ ...entry.after });
    set((s) => ({
      past: [...s.past, entry],
      future: s.future.slice(0, -1),
    }));
    return entry;
  },

  clear: () => set({ past: [], future: [] }),
}));
