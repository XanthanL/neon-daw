/**
 * 语言状态：默认英文，localStorage 持久化（key `neon-daw:lang`）。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Lang = 'en' | 'zh';

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggle: () => void;
}

export const useLang = create<LangState>()(
  persist(
    (set, get) => ({
      lang: 'en',
      setLang: (lang) => set({ lang }),
      toggle: () => set({ lang: get().lang === 'en' ? 'zh' : 'en' }),
    }),
    { name: 'neon-daw:lang', version: 1 },
  ),
);
