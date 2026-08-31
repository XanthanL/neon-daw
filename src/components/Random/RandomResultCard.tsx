/**
 * 抽卡结果卡：抽出风格的完整摘要
 * · 徽标 + 中英文名 + tagline，下面四行乐理摘要（纯律动模式把「动机手法」换成织体说明）
 * · 配器与曲式两栏用贴纸 chip 铺开，底部提醒这次抽卡已被记进可撤销历史
 */
import { motion } from 'framer-motion';
import { useT } from '../../i18n/ui';
import type { GeneratedInfo } from '../../utils/music/types';

export function RandomResultCard({ info }: { info: GeneratedInfo }) {
  const t = useT();
  const StyleIcon = info.icon;
  const rows: [string, string][] = [
    [t.random.key, info.keyName],
    ['BPM', String(info.bpm)],
    [t.random.progression, info.progression],
    [t.random.cadence, info.cadenceLabel],
    /* 纯律动模式没有主旋律，动机手法一栏换成织体说明 */
    info.beatAndChords ? [t.random.texture, t.random.textureBeat] : [t.random.motif, info.motifLabel],
  ];
  return (
    <motion.div
      initial={{ scale: 0.86, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="card-sandwich w-full shrink-0 p-4"
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

      <p className="mt-3 text-xs font-semibold text-fg-muted">{t.random.resetNote}</p>
    </motion.div>
  );
}
