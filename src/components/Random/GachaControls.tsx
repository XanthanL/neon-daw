/**
 * 抽卡控件：Pattern 数 + 纯律动开关 + 抽卡按钮
 * 两个子模块共用，只有按钮文案随 mode 变化（全池抽 / 在选定风格内抽）
 */
import { AnimatePresence, motion } from 'framer-motion';
import {
  Dice5,
  Dice6,
  Dices,
  Disc3,
  Drum,
  Guitar,
  Piano,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useT } from '../../i18n/ui';
import { MIN_PATTERNS, MAX_PATTERNS } from '../../utils/music/compose';

const ROLL_FRAMES = [Dices, Dice5, Dice6, Sparkles, Drum, Piano, Guitar, Disc3];

export function GachaControls({
  mode,
  patternCount,
  setPatternCount,
  beatAndChords,
  setBeatAndChords,
  rolling,
  hasResult,
  error,
  frame,
  onDraw,
}: {
  mode: 'gacha' | 'style';
  patternCount: number;
  setPatternCount: (n: number) => void;
  beatAndChords: boolean;
  setBeatAndChords: (v: boolean) => void;
  rolling: boolean;
  hasResult: boolean;
  error: string | null;
  frame: number;
  onDraw: () => void;
}) {
  const t = useT();
  const RollIcon = ROLL_FRAMES[frame % ROLL_FRAMES.length];
  const label = rolling
    ? t.random.rolling
    : mode === 'style'
      ? hasResult
        ? t.random.again
        : t.random.drawInStyle
      : hasResult
        ? t.random.again
        : t.random.draw;

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Pattern 数（越大越长越丰富） */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="label-caps">{t.random.patterns}</span>
          <span className="ml-auto rounded-full border border-ink/40 bg-white/70 px-2 py-0.5 text-[10px] font-black tracking-wider text-ink uppercase">
            {t.random.patternsTier(patternCount)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: MAX_PATTERNS - MIN_PATTERNS + 1 }, (_, i) => MIN_PATTERNS + i).map(
            (n) => {
              const on = n === patternCount;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPatternCount(n)}
                  className={`h-9 flex-1 cursor-pointer rounded-lg border-2 border-ink text-sm font-extrabold text-ink tabular-nums transition-all select-none ${
                    on
                      ? 'bg-neon-cyan shadow-[1.5px_1.5px_0_#17171C,0_0_8px_rgba(0,229,255,0.5)]'
                      : 'bg-card shadow-hard-sm hover:-translate-y-0.5 active:translate-y-0 active:shadow-none'
                  }`}
                >
                  {n}
                </button>
              );
            },
          )}
        </div>
        <span className="label-caps text-[9px]">{t.random.patternsHint}</span>
      </div>

      {/* 纯律动开关：抽掉主旋律，只留鼓组 + 和声 */}
      <button
        type="button"
        aria-pressed={beatAndChords}
        onClick={() => setBeatAndChords(!beatAndChords)}
        className={`flex w-full items-center gap-2.5 rounded-xl border-2 border-ink px-3 py-2 text-left select-none transition-all ${
          beatAndChords
            ? 'bg-neon-cyan shadow-[1.5px_1.5px_0_#17171C,0_0_8px_rgba(0,229,255,0.5)]'
            : 'bg-card shadow-hard-sm hover:-translate-y-0.5 active:translate-y-0 active:shadow-none'
        }`}
      >
        <Drum
          className={`h-4 w-4 shrink-0 text-ink ${beatAndChords ? '' : 'opacity-50'}`}
          strokeWidth={2.6}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-tight font-extrabold text-ink">
            {t.random.beatChords}
          </span>
          <span className="block text-[10px] leading-tight font-semibold text-fg-muted">
            {t.random.beatChordsHint}
          </span>
        </span>
        <span
          className={`grid h-5 w-9 shrink-0 place-items-start rounded-full border-2 border-ink p-[3px] transition-colors ${
            beatAndChords ? 'bg-ink' : 'bg-white/70'
          }`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full transition-transform ${
              beatAndChords ? 'translate-x-4 bg-neon-cyan' : 'bg-ink/40'
            }`}
          />
        </span>
      </button>

      {/* 抽卡按钮 */}
      <motion.button
        type="button"
        onClick={onDraw}
        disabled={rolling}
        whileHover={rolling ? undefined : { y: -3, boxShadow: '5px 5px 0 #17171C' }}
        whileTap={rolling ? undefined : { x: 2, y: 2, boxShadow: '1px 1px 0 #17171C' }}
        className="flex items-center justify-center gap-3 rounded-2xl border-2 border-ink bg-ink px-7 py-4 text-lg font-extrabold text-white shadow-hard select-none disabled:opacity-70"
      >
        <AnimatePresence mode="wait" initial={false}>
          {rolling ? (
            <motion.span
              key="rolling"
              className="inline-flex"
              animate={{ rotate: 360, scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 0.5, ease: 'linear' }}
            >
              <RollIcon className="h-6 w-6 text-neon-cyan" strokeWidth={2.4} />
            </motion.span>
          ) : (
            <motion.span key="idle" className="inline-flex animate-[spin_2.4s_linear_infinite]">
              <Wand2 className="h-6 w-6 text-neon-cyan" strokeWidth={2.4} />
            </motion.span>
          )}
        </AnimatePresence>
        {label}
      </motion.button>

      {error && <p className="text-center text-sm font-bold text-neon-pink">{error}</p>}
    </div>
  );
}
