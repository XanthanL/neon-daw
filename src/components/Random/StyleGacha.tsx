/**
 * 「风格内随机」子模块：先在一面风格墙里选定一种，再在该风格内抽卡
 * · 锁风格后仍每抽重掷调式 / BPM / 和声进行 / 动机发展 / 鼓花 / 音色，只是不再换风格
 * · 每张卡底部的彩色格子是该风格的鼓格 16 分预览（颜色 = 乐器），一眼看出律动疏密
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Dices } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useT } from '../../i18n/ui';
import { ROLE_LABEL } from '../../utils/music/compose';
import { STYLES } from '../../utils/music/styles';
import type { DrumType } from '../../types/project';
import type { StyleDef, StyleId } from '../../utils/music/types';

/* 鼓格预览配色：与引擎里的鼓通道一致 */
const KIT_COLOR: Record<DrumType, string> = {
  kick: '#00E5FF',
  snare: '#FF3DBE',
  clap: '#FFE600',
  closedHat: '#39FF88',
  openHat: '#A78BFA',
  tom: '#4D9FFF',
};
/** 一格多件乐器时的显示优先级：低频骨架压过踩镲 */
const KIT_PRIORITY: DrumType[] = ['kick', 'snare', 'clap', 'tom', 'closedHat', 'openHat'];

function useGrooveCells(style: StyleDef) {
  return useMemo(() => {
    const sets = KIT_PRIORITY.map((kit) => ({ kit, steps: new Set(style.groove[kit]) }));
    return Array.from({ length: 16 }, (_, step) => {
      const hit = sets.find((s) => s.steps.has(step));
      return hit ? { color: KIT_COLOR[hit.kit], accent: style.accent.includes(step) } : null;
    });
  }, [style]);
}

function GrooveCells({ style }: { style: StyleDef }) {
  const cells = useGrooveCells(style);
  return (
    <div
      className="grid h-3 gap-[2px]"
      style={{ gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}
      aria-hidden
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className="rounded-[2px]"
          style={{
            background: c ? c.color : 'rgba(23,23,28,0.09)',
            opacity: c ? (c.accent ? 1 : 0.5) : 1,
          }}
        />
      ))}
    </div>
  );
}

function StyleCard({
  style,
  selected,
  onSelect,
}: {
  style: StyleDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = style.icon as LucideIcon;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex cursor-pointer flex-col gap-1.5 rounded-xl border-2 border-ink p-2 text-left select-none transition-all ${
        selected
          ? 'bg-neon-cyan shadow-[1.5px_1.5px_0_#17171C,0_0_10px_rgba(0,229,255,0.5)]'
          : 'bg-card shadow-hard-sm hover:-translate-y-0.5 active:translate-y-0 active:shadow-none'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-ink"
          style={{ background: style.color, boxShadow: selected ? undefined : '1.5px 1.5px 0 #17171C' }}
        >
          <Icon className="h-4 w-4 text-ink" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-tight font-extrabold text-ink">
            {style.nameZh}
          </span>
          <span className="label-caps block truncate">{style.name}</span>
        </span>
        <span className="shrink-0 text-[10px] font-black text-ink tabular-nums">
          {style.bpm[0]}–{style.bpm[1]}
        </span>
      </div>
      <GrooveCells style={style} />
    </button>
  );
}

export function StyleGacha({
  styleId,
  setStyleId,
  controls,
  wallClassName = '',
}: {
  styleId: StyleId;
  setStyleId: (id: StyleId) => void;
  controls: React.ReactNode;
  /** 手机端把风格墙收成一个自带滚动条的选取区 */
  wallClassName?: string;
}) {
  const t = useT();
  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0];

  /* 换一换：整面墙里随机落一个（与当前不同的概率由池子大小自然保证） */
  const shuffle = () => {
    const i = Math.floor(Math.random() * STYLES.length);
    setStyleId(STYLES[i].id);
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <h4 className="label-caps mb-0.5">{t.random.pickStyle}</h4>
          <p className="text-xs leading-snug font-semibold text-fg-muted">{t.random.pickStyleHint}</p>
        </div>
        <button
          type="button"
          aria-label={t.random.shuffleStyle}
          onClick={shuffle}
          className="ml-auto flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-2 border-ink bg-card px-2.5 text-[11px] font-black text-ink shadow-hard-sm transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
        >
          <Dices className="h-4 w-4" strokeWidth={2.6} />
          {t.random.shuffleStyle}
        </button>
      </div>

      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4 ${wallClassName}`}>
        {STYLES.map((s) => (
          <StyleCard
            key={s.id}
            style={s}
            selected={s.id === styleId}
            onSelect={() => setStyleId(s.id)}
          />
        ))}
      </div>

      {/* 选中风格的事实条：BPM 区间 / 声部 / 曲式骨架 */}
      <motion.div
        key={style.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-bg-warm p-3 shadow-hard-sm"
      >
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="label-caps">{t.random.styleBpm}</span>
          <span className="text-sm leading-none font-black text-ink tabular-nums">
            {style.bpm[0]}–{style.bpm[1]}
          </span>
          <span className="label-caps ml-3">{t.random.styleForm}</span>
          <span className="text-[11px] font-black text-ink tabular-nums">
            {style.form.reduce((n, f) => n + f.bars * f.repeat, 0)} b
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {style.roles.map((r) => (
            <span
              key={r.role}
              className="rounded-full border border-ink/50 bg-white/70 px-2 py-0.5 text-[11px] font-bold text-ink"
            >
              {ROLE_LABEL[r.role]}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {style.form.map((f, i) => (
            <span
              key={`${f.kind}-${i}`}
              className="rounded-lg border border-ink/50 bg-neon-cyan/20 px-2 py-0.5 text-[11px] font-black text-ink tabular-nums"
            >
              {f.kind} {f.bars * f.repeat}b
            </span>
          ))}
        </div>
        <p className="text-xs font-semibold text-fg-muted">{style.tagline}</p>
      </motion.div>

      {controls}
    </div>
  );
}
