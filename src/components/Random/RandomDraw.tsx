/**
 * 随机抽卡（键 7）：两个子模块共用一条管线
 * · 「全池抽」：一次抽卡落在 28 种命名风格之一（行为与历史完全一致）
 * · 「风格内抽」：先在风格墙里选定一种，只在该风格内重掷调式 / BPM / 和声进行 / 动机 / 鼓花 / 音色
 * · 两个子模块共享 Pattern 数与「纯律动」开关（抽掉主旋律，只留鼓组 + 贝斯 + 和声）
 * · 抽卡会重置工程内全部安排，但补记一步历史，生成后 Ctrl+Z 可回到上一首
 * · 桌面两栏：左为子模块内容 + 结果卡（可滚动），右为整高的节奏挑战；手机单列从上到下
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Dices, Palette, Wand2 } from 'lucide-react';
import { useT } from '../../i18n/ui';
import { STYLES } from '../../utils/music/styles';
import type { StyleId } from '../../utils/music/types';
import { GachaControls } from './GachaControls';
import { RandomResultCard } from './RandomResultCard';
import { RhythmGame } from './RhythmGame';
import { StyleGacha } from './StyleGacha';
import { useGacha } from './useGacha';

type Tab = 'gacha' | 'style';

export function RandomDraw() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('gacha');
  const [patternCount, setPatternCount] = useState(5);
  /** 纯律动：抽掉主旋律，只出鼓组 + 贝斯 + 和声 */
  const [beatAndChords, setBeatAndChords] = useState(false);
  const [styleId, setStyleId] = useState<StyleId>(
    () => STYLES[Math.floor(Math.random() * STYLES.length)].id,
  );

  const { draw, rolling, result, error, frame, seq } = useGacha({
    patternCount,
    beatAndChords,
    styleId: tab === 'style' ? styleId : null,
  });

  const controls = (mode: Tab) => (
    <GachaControls
      mode={mode}
      patternCount={patternCount}
      setPatternCount={setPatternCount}
      beatAndChords={beatAndChords}
      setBeatAndChords={setBeatAndChords}
      rolling={rolling}
      hasResult={!!result}
      error={error}
      frame={frame}
      onDraw={draw}
    />
  );

  const tabBtn = (id: Tab, icon: typeof Dices, label: string) => {
    const on = tab === id;
    const Icon = icon;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => setTab(id)}
        className={`flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 px-3 text-[12px] font-black text-ink transition-colors select-none ${
          on ? 'bg-neon-cyan' : 'bg-card text-fg-muted hover:text-ink'
        }`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.6} />
        {label}
      </button>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 子模块切换条 */}
      <div className="flex shrink-0 items-center gap-2 border-b-2 border-ink/10 bg-bg-warm/60 px-3 py-2 md:px-4">
        <div
          role="tablist"
          className="flex w-full items-stretch overflow-hidden rounded-lg border-2 border-ink shadow-hard-sm sm:max-w-[380px]"
        >
          {tabBtn('gacha', Dices, t.random.tabGacha)}
          {tabBtn('style', Palette, t.random.tabStyle)}
        </div>
        {result && (
          <span className="label-caps ml-auto hidden shrink-0 items-center gap-1.5 rounded-full border border-ink/40 bg-white/70 px-2 py-1 text-ink md:flex">
            <Wand2 className="h-3 w-3" strokeWidth={2.8} />
            {result.styleName} · {result.bpm}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        <div className="mx-auto grid h-full w-full max-w-[1380px] grid-cols-1 gap-3 p-3 md:p-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
          {/* 左栏：子模块内容 */}
          <div className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
            <AnimatePresence mode="wait" initial={false}>
              {tab === 'gacha' ? (
                <motion.div
                  key="gacha"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.16 }}
                  className="mx-auto flex w-full max-w-lg flex-col gap-4"
                >
                  <div className="text-center">
                    <h4 className="label-caps mb-1">Gacha Compose</h4>
                    <p className="text-sm leading-snug font-semibold text-fg-muted">
                      {t.random.intro(STYLES.length)}
                    </p>
                  </div>
                  {controls('gacha')}
                </motion.div>
              ) : (
                <motion.div
                  key="style"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.16 }}
                  className="flex w-full flex-col gap-3"
                >
                  <StyleGacha
                    styleId={styleId}
                    setStyleId={setStyleId}
                    wallClassName="max-h-[44vh] overflow-y-auto overscroll-contain pr-1 lg:max-h-none lg:overflow-visible lg:pr-0"
                    controls={controls('style')}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* 结果卡：紧跟抽卡控件，抽完就在手边 */}
            <div className="mx-auto w-full max-w-xl">
              <AnimatePresence mode="popLayout">
                {result && !rolling ? (
                  <RandomResultCard key={`${result.styleId}-${seq}`} info={result} />
                ) : (
                  <motion.p
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="rounded-xl border-2 border-dashed border-ink/25 px-3 py-4 text-center text-xs font-semibold text-fg-muted"
                  >
                    {t.random.resultPlaceholder}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* 警告贴纸 */}
            <div className="mt-auto flex w-full items-center gap-2 rounded-xl border-2 border-ink bg-neon-yellow/25 px-3 py-1.5 shadow-hard-sm">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-ink" strokeWidth={2.6} />
              <p className="text-[11px] leading-snug font-bold text-ink">{t.random.warning}</p>
            </div>
          </div>

          {/* 右栏：节奏挑战独占整高，抽卡后无需再滚动找它 */}
          <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-3 lg:max-w-none lg:min-h-0">
            <RhythmGame viz={result?.viz ?? null} className="min-h-[420px] md:min-h-[460px] lg:h-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
