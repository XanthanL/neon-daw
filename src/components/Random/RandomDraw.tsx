/**
 * 随机抽卡（键 7）：一个按钮，从风格池里抽一种并生成整曲
 * · 每次抽卡落在一个命名风格上（City Pop / Bossa / Trap / DnB …），
 *   乐理由和声引擎（扩展音·转位·声部平滑）、动机发展（起承转合）与曲式编排保证
 * · 抽卡会重置工程内全部安排（Pattern / 音符 / 音色 / 混音 / Song 编排），
 *   但会记录一步历史，生成后 Ctrl+Z 即可回到上一首
 * · 生成后自动切到 Song 模式播放试听
 * · 「纯律动」开关：跳过主旋律声部，只抽鼓组 + 贝斯 + 和声，卡片同时把动机手法一栏换成织体说明
 * · 桌面两侧是和声轨 / 节奏挑战实时可视化；移动端同款降级为卡片下的横条 + 游戏模块
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  AudioWaveform,
  Dice5,
  Dice6,
  Dices,
  Disc3,
  Drum,
  Guitar,
  ListMusic,
  Piano,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { engine } from '../../audio/engine';
import { getProjectSnapshot, useProjectStore } from '../../stores/projectStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import { generateRandomSong, MIN_PATTERNS, MAX_PATTERNS } from '../../utils/music/compose';
import { STYLES } from '../../utils/music/styles';
import type { GeneratedInfo, StyleId } from '../../utils/music/types';
import { ChordStream } from './ChordStream';
import { RhythmGame } from './RhythmGame';

const ROLL_FRAMES = [Dices, Dice5, Dice6, Sparkles, Drum, Piano, Guitar, Disc3];

function ResultCard({ info }: { info: GeneratedInfo }) {
  const t = useT();
  const StyleIcon = info.icon;
  const rows: [string, string][] = [
    [t.random.key, info.keyName],
    ['BPM', String(info.bpm)],
    [t.random.progression, info.progression],
    [t.random.cadence, info.cadenceLabel],
    /* 纯律动模式没有主旋律，动机手法一栏换成织体说明 */
    info.beatAndChords
      ? [t.random.texture, t.random.textureBeat]
      : [t.random.motif, info.motifLabel],
  ];
  return (
    <motion.div
      initial={{ scale: 0.7, rotate: -3, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="card-sandwich w-full max-w-md p-4"
    >
      {/* 风格徽标 */}
      <div className="flex items-center gap-3">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-ink"
          style={{ background: info.color, boxShadow: `2px 2px 0 #17171C, 0 0 14px ${info.color}80` }}
        >
          <StyleIcon className="h-6 w-6 text-ink" strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg leading-tight font-extrabold text-ink">{info.styleNameZh}</h3>
          <p className="label-caps truncate">{info.styleName}</p>
        </div>
      </div>
      <p className="mt-2 text-xs font-semibold text-fg-muted">{info.tagline}</p>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-bold whitespace-nowrap text-fg-muted">{k}</dt>
            <dd className="text-right font-extrabold text-ink tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      {/* 配器：各角色音色 */}
      <div className="mt-3">
        <h4 className="label-caps mb-1.5">{t.random.arrangement}</h4>
        <div className="flex flex-wrap gap-1.5">
          {info.roles.map((r) => (
            <span
              key={r.role}
              className="rounded-full border border-ink/50 bg-white/70 px-2 py-0.5 text-[11px] font-bold text-ink"
            >
              {r.label} · {r.preset}
            </span>
          ))}
        </div>
      </div>

      {/* 曲式：段落与长度 */}
      <div className="mt-3">
        <h4 className="label-caps mb-1.5">{t.random.form(info.bars)}</h4>
        <div className="flex flex-wrap gap-1.5">
          {info.sections.map((s, i) => (
            <span
              key={`${s.name}-${i}`}
              className="rounded-lg border border-ink/50 bg-neon-cyan/20 px-2 py-0.5 text-[11px] font-black text-ink tabular-nums"
            >
              {s.name} ×{s.bars}b
            </span>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs font-semibold text-fg-muted">
        {t.random.resetNote}
      </p>
    </motion.div>
  );
}

export function RandomDraw() {
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState<GeneratedInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [patternCount, setPatternCount] = useState(5);
  /** 纯律动：抽掉主旋律，只出鼓组 + 贝斯 + 和声 */
  const [beatAndChords, setBeatAndChords] = useState(false);
  const rollTimer = useRef<number | null>(null);
  /** 上一次抽中的风格，避免连抽同一种 */
  const lastStyle = useRef<StyleId | null>(null);

  /* 洗牌动效逐帧推进（render 期取时间不会重绘，必须靠 interval 驱动 state） */
  useEffect(() => {
    if (!rolling) return;
    const id = window.setInterval(() => setFrame((f) => f + 1), 90);
    return () => window.clearInterval(id);
  }, [rolling]);

  /* 卸载时收回未触发的生成定时器 */
  useEffect(
    () => () => {
      if (rollTimer.current !== null) window.clearTimeout(rollTimer.current);
    },
    [],
  );

  const importProject = useProjectStore((s) => s.importProject);

  const setPlayMode = useUiStore((s) => s.setPlayMode);
  const t = useT();

  const draw = () => {
    if (rolling) return;
    setError(null);
    setRolling(true);
    /* 抽卡悬念动效 → 生成并整工程替换 */
    rollTimer.current = window.setTimeout(() => {
      rollTimer.current = null;
      try {
        const before = getProjectSnapshot();
        const { project, info } = generateRandomSong({
          excludeStyleId: lastStyle.current,
          patternCount,
          beatAndChords,
        });
        engine.stop();
        const ok = importProject(project);
        if (!ok) {
          setError(t.random.validationFail);
          setRolling(false);
          return;
        }
        /* importProject 会清空历史，这里手动补一步记录让抽卡可撤销 */
        useHistoryStore
          .getState()
          .record(t.random.record(info.styleName), before, getProjectSnapshot());
        lastStyle.current = info.styleId;
        setPlayMode('song');
        setResult(info);
        setRolling(false);
        void engine.play();
      } catch (err) {
        setError(err instanceof Error ? err.message : t.random.genFail);
        setRolling(false);
      }
    }, 640);
  };

  const RollIcon = ROLL_FRAMES[frame % ROLL_FRAMES.length];
  const viz = result?.viz ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1380px] flex-1 items-stretch gap-3 p-3 md:p-4 lg:gap-4">
        {/* 桌面左栏：和声轨（当前和弦居中跟随播放头） */}
        <aside className="card-sandwich sticky top-3 hidden h-[520px] w-[250px] shrink-0 flex-col self-start p-3 lg:flex">
          <div className="label-caps mb-1.5 flex items-center gap-1.5">
            <ListMusic className="h-3.5 w-3.5" strokeWidth={2.6} />
            {t.random.vizChords}
          </div>
          <ChordStream viz={viz} />
        </aside>

        {/* 中栏：抽卡主流程 */}
        <main className="mx-auto flex w-full min-w-0 max-w-md flex-col items-center gap-4">
          {/* 一句话说明 */}
          <div className="w-full max-w-md text-center">
            <h4 className="label-caps mb-1">Gacha Compose</h4>
            <p className="text-sm leading-snug font-semibold text-fg-muted">
              {t.random.intro(STYLES.length)}
            </p>
          </div>

          {/* Pattern 数（越大越长越丰富） */}
          <div className="flex w-full max-w-md flex-col gap-1.5">
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
            onClick={() => setBeatAndChords((v) => !v)}
            className={`flex w-full max-w-md items-center gap-2.5 rounded-xl border-2 border-ink px-3 py-2 text-left select-none transition-all ${
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
            onClick={draw}
            disabled={rolling}
            whileHover={rolling ? undefined : { y: -3, boxShadow: '5px 5px 0 #17171C' }}
            whileTap={rolling ? undefined : { x: 2, y: 2, boxShadow: '1px 1px 0 #17171C' }}
            className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-ink px-7 py-4 text-lg font-extrabold text-white shadow-hard select-none disabled:opacity-70"
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
                <motion.span
                  key="idle"
                  className="inline-flex animate-[spin_2.4s_linear_infinite]"
                >
                  <Wand2 className="h-6 w-6 text-neon-cyan" strokeWidth={2.4} />
                </motion.span>
              )}
            </AnimatePresence>
            {rolling ? t.random.rolling : result ? t.random.again : t.random.draw}
          </motion.button>

          {error && <p className="text-sm font-bold text-neon-pink">{error}</p>}

          {/* 移动端可视化：和声横条（桌面挪到左栏） */}
          <section className="card-sandwich flex w-full flex-col gap-2 p-2.5 lg:hidden">
            <div className="label-caps flex items-center gap-1.5 px-0.5">
              <ListMusic className="h-3.5 w-3.5" strokeWidth={2.6} />
              {t.random.vizChords}
            </div>
            <div className="flex h-14">
              <ChordStream viz={viz} orientation="horizontal" />
            </div>
          </section>

          <AnimatePresence>
            {result && !rolling && (
              <ResultCard
                key={`${result.styleId}${result.bpm}${Date.now()}`}
                info={result}
              />
            )}
          </AnimatePresence>

          {/* 节奏挑战：紧跟抽出的音乐卡片下方 */}
          <section className="card-sandwich flex h-[420px] w-full flex-col p-3 md:h-[460px]">
            <div className="label-caps mb-1.5 flex items-center gap-1.5">
              <AudioWaveform className="h-3.5 w-3.5" strokeWidth={2.6} />
              {t.random.rhythm}
            </div>
            <RhythmGame viz={viz} />
          </section>

          {/* 警告贴纸 */}
          <div className="flex w-full items-center gap-2 rounded-xl border-2 border-ink bg-neon-yellow/25 px-3 py-2 shadow-hard-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-ink" strokeWidth={2.6} />
            <p className="text-xs font-bold text-ink">
              {t.random.warning}
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
