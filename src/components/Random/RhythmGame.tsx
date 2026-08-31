/**
 * 节奏挑战（Random 模块右栏 / 移动端卡片下）
 * · 抽到的曲子化成 4 轨下落音符：桌面 / 平板按 A S W D（或点键帽），手机切全屏演奏层用底部大打击块
 * · 一局的状态与计时在 useRhythmRun 里，画布与打击块都只是宿主 → 卡片 ⇄ 全屏换层不会重开歌曲
 * · 演奏期间 grabInput(true) 接管全局快捷键，避免 Space 停曲 / 数字键切模块把一局打断
 * · 放完一遍（或循环回绕）弹结算：分数 / 准度 / 全计数 / 评级 S~D；Esc 或撤销则直接退出本局
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Gamepad2, Maximize2, X } from 'lucide-react';
import { useT } from '../../i18n/ui';
import type { VizSong } from '../../utils/music/types';
import { grabInput } from '../ui/OverlaySheet';
import { useIsCompact } from '../ui/useIsCompact';
import { RhythmCanvas } from './RhythmCanvas';
import { RhythmPads } from './RhythmPads';
import { JUDGE_COLOR, JUDGE_LABEL, useRhythmRun } from './useRhythmRun';

export function RhythmGame({ viz, className = '' }: { viz: VizSong | null; className?: string }) {
  const t = useT();
  const compact = useIsCompact();
  const {
    phase,
    phaseRef,
    result,
    notes,
    totalSteps,
    runRef,
    subscribeLanes,
    start,
    bail,
    press,
    release,
  } = useRhythmRun(viz);
  const [stage, setStage] = useState(false);

  /* 演奏期间全局快捷键一律不穿透（App.tsx 据此短路 1-8 / Space / Esc） */
  useEffect(() => {
    if (phase !== 'run') return;
    grabInput(true);
    return () => grabInput(false);
  }, [phase]);

  /* 手机一进演奏就铺满全屏，收尾 / 退出即收回卡片 */
  useEffect(() => {
    setStage(compact && phase === 'run');
  }, [compact, phase]);

  const canStart = !!viz && notes.length > 0;
  const hintText = compact ? t.random.rhythmHintTouch : t.random.rhythmHint;

  const canvas = () => (
    <RhythmCanvas
      runRef={runRef}
      phaseRef={phaseRef}
      viz={viz}
      totalSteps={totalSteps}
      ariaLabel={t.random.rhythm}
      hintText={hintText}
      emptyText={t.random.rhythmIdle}
    />
  );

  const pads = (variant: 'compact' | 'stage') => (
    <RhythmPads variant={variant} subscribeLanes={subscribeLanes} press={press} release={release} />
  );

  return (
    <>
      <section className={`card-sandwich flex min-h-0 flex-col p-3 ${className}`}>
        <div className="label-caps mb-1.5 flex items-center gap-1.5">
          <Gamepad2 className="h-3.5 w-3.5" strokeWidth={2.6} />
          {t.random.rhythm}
          {phase === 'run' && (
            <button
              type="button"
              onClick={bail}
              className="ml-auto flex h-6 cursor-pointer items-center gap-1 rounded-md border-2 border-ink bg-card px-1.5 text-[9px] font-black text-ink shadow-hard-sm select-none active:translate-y-0.5 active:shadow-none"
            >
              <X className="h-2.5 w-2.5" strokeWidth={3} />
              {t.random.stageExit}
            </button>
          )}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* 全屏层亮起时卡片画布收起：演奏状态在 hook 里，换宿主不会重开歌 */}
          {!stage && (
            <>
              {canvas()}
              {!compact && canStart && <div className="mt-1.5">{pads('compact')}</div>}
            </>
          )}

          {/* 开局按钮 */}
          {phase === 'idle' && canStart && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={start}
              whileTap={{ scale: 0.94 }}
              className="absolute inset-x-0 top-[36%] mx-auto flex w-max cursor-pointer items-center gap-2 rounded-2xl border-2 border-ink bg-neon-cyan px-5 py-2.5 text-sm font-black text-ink shadow-hard select-none"
            >
              <Maximize2 className="h-3.5 w-3.5" strokeWidth={3} />
              {compact ? t.random.rhythmStartStage : t.random.rhythmStart}
            </motion.button>
          )}
          {phase === 'idle' && !canStart && (
            <p className="absolute inset-x-0 bottom-2 text-center text-[10px] font-bold text-fg-muted">
              {t.random.rhythmNeedsDraw}
            </p>
          )}

          {/* 结算面板 */}
          <AnimatePresence>
            {phase === 'result' && result && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-bg-warm/92 p-3 text-center backdrop-blur-[2px]"
              >
                <span
                  className="grid h-12 w-12 place-items-center rounded-xl border-2 border-ink text-2xl font-black text-ink"
                  style={{
                    background: result.rankColor,
                    boxShadow: `2px 2px 0 #17171C, 0 0 16px ${result.rankColor}90`,
                  }}
                >
                  {result.rank}
                </span>
                <span className="text-xl leading-none font-black text-ink tabular-nums">
                  {result.score.toLocaleString()}
                </span>
                <span className="text-xs font-extrabold text-fg-muted tabular-nums">
                  {t.random.accuracy} {result.acc.toFixed(1)}% · {t.random.maxCombo} ×{result.maxCombo}
                </span>
                <div className="mt-1 flex flex-wrap justify-center gap-1 text-[10px] font-black tabular-nums">
                  {JUDGE_LABEL.map((label, i) => (
                    <span
                      key={label}
                      className="rounded-md border border-ink/50 bg-white/70 px-1.5 py-0.5"
                      style={{ color: JUDGE_COLOR[i] }}
                    >
                      {label} {result.counts[i]}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={start}
                    className="cursor-pointer rounded-lg border-2 border-ink bg-neon-cyan px-3 py-1.5 text-xs font-black text-ink shadow-hard-sm select-none active:translate-y-0.5 active:shadow-none"
                  >
                    {t.random.again2}
                  </button>
                  <button
                    type="button"
                    onClick={bail}
                    className="cursor-pointer rounded-lg border-2 border-ink bg-card px-3 py-1.5 text-xs font-black text-ink shadow-hard-sm select-none active:translate-y-0.5 active:shadow-none"
                  >
                    {t.random.close}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* 手机全屏演奏层：portal 到 body（模块外壳的 layoutId + overflow-hidden 会困住 fixed） */}
      {createPortal(
        <AnimatePresence>
          {stage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="fixed inset-0 z-[85] flex flex-col bg-bg-warm"
            >
              <div className="flex shrink-0 items-center gap-2 border-b-2 border-ink px-3 py-2">
                <Gamepad2 className="h-4 w-4 shrink-0 text-ink" strokeWidth={2.6} />
                <span className="label-caps truncate text-ink">{t.random.rhythm}</span>
                <button
                  type="button"
                  aria-label={t.random.stageExit}
                  onClick={bail}
                  className="ml-auto grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg border-2 border-ink bg-card text-ink shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  <X className="h-4 w-4" strokeWidth={2.8} />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-2">
                {canvas()}
                <div
                  className="h-[26vh] min-h-[112px] shrink-0 pt-2"
                  style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
                >
                  {pads('stage')}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
