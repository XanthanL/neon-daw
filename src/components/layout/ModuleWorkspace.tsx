/**
 * 模块工作区容器：与首页方块共享 layoutId，点击方块后 spring 弹性放大为完整工作视图。
 * 八个模块均已接入真实工作区（BODIES 渲染表）。
 */
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useProjectStore } from '../../stores/projectStore';
import type { ViewModule } from '../../stores/uiStore';
import { useT, type Dict } from '../../i18n/ui';
import { ChannelRack } from '../ChannelRack/ChannelRack';
import { PianoRoll } from '../PianoRoll/PianoRoll';
import { Mixer } from '../Mixer/Mixer';
import { Synth } from '../Synth/Synth';
import { Song } from '../Song/Song';
import { LiveKeys } from '../Keyboard/LiveKeys';
import { RandomDraw } from '../Random/RandomDraw';
import { Files } from '../Files/Files';
import { moduleByView, type ModuleDef, type ModuleId } from './modules';

const SPRING = { type: 'spring', stiffness: 300, damping: 26 } as const;

/** 模块实时统计（从工程数据读取原始数值，交由 UI 本地化） */
function useModuleStatCount(id: ModuleDef['id']): number {
  return useProjectStore((s) => {
    const pat = s.patterns.find((p) => p.id === s.currentPatternId);
    switch (id) {
      case 'channelRack':
        return s.channels.length;
      case 'pianoRoll':
        return pat?.notes.length ?? 0;
      case 'mixer':
        return s.mixerTracks.length;
      case 'synth':
        return s.channels.filter((c) => c.kind === 'synth').length;
      case 'song':
        return s.song.tracks.reduce((a, t) => a + t.clips.length, 0);
      case 'keyboard':
        return s.channels.filter((c) => c.kind === 'synth').length;
      default:
        return s.patterns.length;
    }
  });
}

const STAT_FMT: Record<ModuleId, (t: Dict, n: number) => string> = {
  channelRack: (t, n) => t.modules.statChannels(n),
  pianoRoll: (t, n) => t.modules.statNotes(n),
  mixer: (t, n) => t.modules.statTracks(n),
  synth: (t, n) => t.modules.statSynths(n),
  song: (t, n) => t.modules.statClips(n),
  keyboard: (t, n) => t.modules.statVoices(n),
  random: (t, n) => t.modules.statPatterns(n),
  files: (t, n) => t.modules.statPatterns(n),
};

function WorkspaceHeader({ m }: { m: ModuleDef }) {
  const count = useModuleStatCount(m.id);
  const t = useT();
  const Icon = m.icon;

  return (
    <header className="flex items-center gap-3 border-b-2 border-ink bg-bg-warm/70 px-3 py-2.5 md:px-5 md:py-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-ink text-white shadow-hard-sm select-none"
        style={{ boxShadow: `1.5px 1.5px 0 #17171C, 0 0 10px ${m.color}66` }}
      >
        <Icon className="h-5 w-5" strokeWidth={2.4} />
      </span>
      <div className="flex min-w-0 flex-col">
        <h1 className="text-base leading-tight font-extrabold tracking-tight text-ink md:text-lg">
          {m.label}
        </h1>
        <span className="label-caps truncate">{t.modules.desc[m.id]}</span>
      </div>
      <div className="ml-auto flex shrink-0 items-center">
        <span className="sticker-sandwich px-2.5 py-1 text-xs font-bold text-ink tabular-nums">
          {STAT_FMT[m.id](t, count)}
        </span>
      </div>
    </header>
  );
}

const BODIES: Record<ModuleId, ReactNode> = {
  channelRack: <ChannelRack />,
  pianoRoll: <PianoRoll />,
  mixer: <Mixer />,
  synth: <Synth />,
  song: <Song />,
  keyboard: <LiveKeys />,
  random: <RandomDraw />,
  files: <Files />,
};

export function ModuleWorkspace({ module }: { module: ViewModule }) {
  const def = moduleByView(module);
  if (!def) return null;

  return (
    <motion.div
      layoutId={`module-${def.id}`}
      transition={SPRING}
      className="card-sandwich flex h-full min-h-0 flex-col overflow-hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={def.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.16, ease: [0.33, 1, 0.68, 1] }}
          className="flex h-full min-h-0 flex-col"
        >
          <WorkspaceHeader m={def} />
          {BODIES[def.id]}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
