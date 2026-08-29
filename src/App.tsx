/**
 * 全局框架：左侧竖直导航 + 顶栏 + 内容区（首页总览 / 模块工作区）+ 状态栏
 * 快捷键：空格 = 播放/停止；1-8 = 切换模块；Esc = 回总览
 * 首次用户交互解锁音频上下文（浏览器自动播放策略）
 */
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { engine } from './audio/engine';
import { HomeGrid } from './components/layout/HomeGrid';
import { MobileNavDrawer } from './components/layout/MobileNavDrawer';
import { ModuleWorkspace } from './components/layout/ModuleWorkspace';
import { PatternManagerSheet } from './components/PatternManager/PatternManagerSheet';
import { SideNav } from './components/layout/SideNav';
import { StatusBar } from './components/layout/StatusBar';
import { MODULES } from './components/layout/modules';
import { isOverlayOpen } from './components/ui/OverlaySheet';
import { TopBar } from './components/layout/TopBar';
import { useUiStore } from './stores/uiStore';
import { useHistoryStore } from './stores/historyStore';
import { useLang } from './i18n/lang';
import { useT } from './i18n/ui';

export default function App() {
  const view = useUiStore((s) => s.view);
  const lang = useLang((s) => s.lang);
  const dict = useT();

  /* 语言 → 文档标题 / <html lang> */
  useEffect(() => {
    document.title = dict.app.title;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang, dict.app.title]);

  /* 音频引擎初始化（幂等，StrictMode 双挂载安全） */
  useEffect(() => {
    engine.init();
  }, []);

  /* 首次用户交互解锁音频 */
  useEffect(() => {
    const unlock = () => {
      void engine.unlock();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  /* 全局快捷键（输入框聚焦时不劫持） */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      /* 撤销 / 重做：浮层内的编辑也要能回退，所以放在浮层短路之前 */
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
        e.preventDefault();
        const redo = k === 'y' || (k === 'z' && e.shiftKey);
        if (redo) useHistoryStore.getState().redo();
        else useHistoryStore.getState().undo();
        return;
      }
      /* 其余快捷键在浮层 / 导航抽屉打开时交给它自己（Esc 关闭），不穿透到底层视图 */
      if (isOverlayOpen() || useUiStore.getState().mobileNavOpen) return;
      if (e.code === 'Space') {
        if (e.repeat) return;
        e.preventDefault();
        void engine.togglePlay();
      } else if (e.key >= '1' && e.key <= '8') {
        const m = MODULES[Number(e.key) - 1];
        if (m) useUiStore.getState().setView(m.id);
      } else if (e.key === 'Escape') {
        useUiStore.getState().goHome();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex h-screen supports-[height:100dvh]:h-dvh overflow-hidden">
      <SideNav />
      <MobileNavDrawer />
      <PatternManagerSheet />

      {/* isolate：把顶栏/内容/状态栏收进同一层叠上下文，确保任何模块内的 z-index
          都不会盖过挂到 body 的浮层（OverlaySheet z-80 / 抽屉 z-95） */}
      <div className="flex min-w-0 flex-1 flex-col isolate">
        <TopBar />

        {/* 内容区：首页总览 ⇄ 模块工作区
            两视图绝对定位叠放（交叉淡入期间不分离、不被推出视口），
            wrapper 用固定时长 tween（spring 退场会等 settle 拖出 ~1s 空挡）；
            卡片本体仍由 layoutId + spring 做共享元素弹性放大/收缩 */}
        <main className="relative flex-1 overflow-hidden p-4 md:p-6">
          <AnimatePresence initial={false}>
            {view === 'home' ? (
              <motion.div
                key="home"
                className="absolute inset-4 md:inset-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, pointerEvents: 'none' }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                <HomeGrid />
              </motion.div>
            ) : (
              <motion.div
                key="workspace"
                className="absolute inset-4 md:inset-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, pointerEvents: 'none' }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                <ModuleWorkspace module={view} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <StatusBar />
      </div>
    </div>
  );
}
