/**
 * 底部状态栏：时间码 bar:beat:step（tabular-nums）、Pattern/Song 模式、
 * 循环长度、节拍器与播放状态
 */
import { Timer } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';

export function StatusBar() {
  const isPlaying = useUiStore((s) => s.isPlaying);
  const playMode = useUiStore((s) => s.playMode);
  const step = useUiStore((s) => s.currentStep);
  const loopOn = useUiStore((s) => s.loopOn);
  const loopBars = useUiStore((s) => s.loopBars);
  const metronomeOn = useUiStore((s) => s.metronomeOn);
  const bpm = useProjectStore((s) => s.bpm);
  const t = useT();
  const pattern = useProjectStore((s) =>
    s.patterns.find((p) => p.id === s.currentPatternId),
  );

  /* 16 分音符网格 → bar:beat:step（1 基） */
  const bar = Math.floor(step / 16) + 1;
  const beat = Math.floor((step % 16) / 4) + 1;
  const sixteenth = (step % 4) + 1;

  /* 与 engine.applyLoop 同规则：Pattern 模式循环 = Pattern 长度 × 重复遍数，Song 模式整曲 */
  const loopText =
    playMode === 'song'
      ? t.statusbar.loopWhole
      : loopBars === 1
        ? t.statusbar.loopBars(pattern?.bars ?? 1)
        : t.statusbar.loopBarsReps(pattern?.bars ?? 1, loopBars);

  return (
    <footer className="z-10 flex items-center gap-2 overflow-hidden border-t-2 border-ink bg-bg-warm px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap text-fg-muted select-none md:gap-4 md:px-4 md:text-xs">
      <span className="flex shrink-0 items-center gap-1.5 font-extrabold text-ink tabular-nums">
        <span
          className={`h-2 w-2 rounded-full border border-ink transition-colors ${
            isPlaying ? 'bg-neon-cyan shadow-glow-cyan' : 'bg-panel'
          }`}
        />
        {String(bar).padStart(2, '0')}:{beat}:{sixteenth}
      </span>

      <span className="shrink-0 rounded-full border-2 border-ink bg-card px-2 py-0.5 text-[10px] font-bold text-ink tracking-widest uppercase">
        {playMode}
      </span>
      {playMode === 'pattern' && (
        <span className="min-w-0 shrink truncate">PAT · {pattern?.name ?? '—'}</span>
      )}
      {loopOn && <span className="shrink-0 tabular-nums">{loopText}</span>}
      {metronomeOn && (
        <span className="flex shrink-0 items-center gap-1 text-ink">
          <Timer className="h-3 w-3" /> {t.statusbar.click}
        </span>
      )}

      <span className="ml-auto shrink-0 text-fg-faint tabular-nums">
        {bpm} BPM · NeonDAW
      </span>
    </footer>
  );
}
