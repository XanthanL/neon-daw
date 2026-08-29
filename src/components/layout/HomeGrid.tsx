/**
 * 首页总览：模块方块等大网格铺开（手机 2×4、桌面 4×2）
 * 每方块 = 白底黑描边 + 硬阴影贴纸卡片（lucide 图标 + 模块名 + 播放中实时迷你预览）
 * 点击方块经 Framer Motion layoutId + spring 弹性放大为模块工作区
 */
import { motion } from 'framer-motion';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import { MODULES, type ModuleDef } from './modules';

const SPRING = { type: 'spring', stiffness: 300, damping: 26 } as const;

/** 播放中的实时迷你预览：通道色小圆点随步进流转爆闪 */
function MiniPreview({ color }: { color: string }) {
  const isPlaying = useUiStore((s) => s.isPlaying);
  const step = useUiStore((s) => s.currentStep);
  const count = 8;

  return (
    <div className="hidden grid-cols-8 items-center gap-x-1.5 gap-y-2 sm:grid" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const on = isPlaying && step % count === i;
        return (
          <span
            key={i}
            className="mx-auto h-2 w-2 rounded-full border border-ink/50 transition-colors duration-75"
            style={{
              background: on ? color : '#E7E6EE',
              boxShadow: on ? `0 0 6px ${color}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

function Tile({ m }: { m: ModuleDef }) {
  const setView = useUiStore((s) => s.setView);
  const t = useT();
  const Icon = m.icon;

  return (
    <motion.button
      type="button"
      layoutId={`module-${m.id}`}
      onClick={() => setView(m.id)}
      aria-label={t.nav.enter(m.label)}
      initial={false}
      whileHover={{ y: -4, rotate: -0.6, boxShadow: '5px 5px 0 #17171C' }}
      whileTap={{ x: 2, y: 2, boxShadow: '1px 1px 0 #17171C' }}
      transition={SPRING}
      className="card-sandwich flex min-h-0 cursor-pointer flex-col items-start justify-center gap-3 p-3.5 text-left md:p-5"
    >
      <div className="flex w-full items-start gap-2.5 md:gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-card text-ink shadow-hard-sm select-none md:h-12 md:w-12">
          <Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.4} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5 md:gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="truncate text-base leading-tight font-extrabold tracking-tight text-ink md:text-xl">
              {m.label}
            </h2>
            <span className="label-caps truncate">{t.modules.desc[m.id]}</span>
          </div>
          <div className="flex w-full items-end justify-between gap-2">
            <MiniPreview color={m.color} />
            <span className="ml-auto hidden rounded-lg border-2 border-ink bg-card px-2 py-0.5 text-xs font-bold text-ink shadow-hard-sm tabular-nums select-none md:inline-flex">
              {t.nav.keyHint(m.hotkey)}
            </span>
          </div>
        </div>
      </div>
    </motion.button>
  );
}

export function HomeGrid() {
  return (
    <div className="grid h-full grid-cols-2 auto-rows-[minmax(150px,1fr)] content-start gap-2.5 overflow-y-auto p-3.5 md:grid-cols-4 md:grid-rows-2 md:auto-rows-fr md:gap-4 md:overflow-hidden md:p-4">
      {MODULES.map((m) => (
        <Tile key={m.id} m={m} />
      ))}
    </div>
  );
}
