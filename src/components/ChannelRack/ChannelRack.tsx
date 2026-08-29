/**
 * Channel Rack 步进音序器（Task 5）
 * - 顶栏：当前 Pattern（重命名 / 长度 1-2-4-8 小节切换）+「Pattern 列表」入口（新增/复制/清空/删除在管理器浮层里）
 *   + 绘制 / 力度模式切换
 * - 左：通道列表（ChannelList）右：步进网格（StepGrid），同滚动容器对齐
 */
import { useState } from 'react';
import { ListMusic, Pencil } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import type { Pattern } from '../../types/project';
import { IconButton } from '../ui/IconButton';
import { useIsCompact } from '../ui/useIsCompact';
import { ChannelList } from './ChannelList';
import { StepGrid } from './StepGrid';

const BARS_OPTIONS: Pattern['bars'][] = [1, 2, 4, 8];

/* ============================================================
 * Pattern 管理工具栏
 * ============================================================ */

function PatternToolbar({
  pattern,
  velMode,
  onVelMode,
}: {
  pattern: Pattern;
  velMode: boolean;
  onVelMode: (v: boolean) => void;
}) {
  const renamePattern = useProjectStore((s) => s.renamePattern);
  const setPatternBars = useProjectStore((s) => s.setPatternBars);
  const setPatternManagerOpen = useUiStore((s) => s.setPatternManagerOpen);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pattern.name);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== pattern.name) renamePattern(pattern.id, t);
    setEditing(false);
  };

  const compact = useIsCompact();
  const t = useT();
  const hint = velMode
    ? t.channelRack.hintVel
    : compact
      ? t.channelRack.hintTouch
      : t.channelRack.hintDesktop;

  const modeBtn = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={`h-8 shrink-0 cursor-pointer rounded-lg border-2 border-ink px-2.5 text-[11px] font-extrabold text-ink transition-all select-none ${
        on ? 'bg-neon-pink' : 'bg-card shadow-hard-sm active:-translate-y-0.5'
      }`}
      style={on ? { boxShadow: '1.5px 1.5px 0 #17171C, 0 0 8px rgba(255,61,190,0.6)' } : undefined}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="label-caps">Pattern</span>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') setEditing(false);
          }}
          className="sticker-sandwich w-36 px-3 py-1.5 text-sm font-bold text-ink outline-none"
        />
      ) : (
        <button
          type="button"
          title={t.channelRack.rename}
          onClick={() => {
            setDraft(pattern.name);
            setEditing(true);
          }}
          className="sticker-sandwich flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-ink transition-transform hover:-translate-y-0.5"
        >
          {pattern.name}
          <Pencil className="h-3 w-3 text-fg-muted" strokeWidth={2.6} />
        </button>
      )}

      <IconButton label={t.channelRack.list} onClick={() => setPatternManagerOpen(true)}>
        <ListMusic />
      </IconButton>

      <div className="mx-1 h-6 w-0.5 rounded-full bg-ink/10" />
      <span className="label-caps">{t.channelRack.length}</span>
      <div className="flex items-center gap-1">
        {BARS_OPTIONS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setPatternBars(pattern.id, b)}
            className={`shrink-0 cursor-pointer rounded-full border-2 border-ink px-2.5 py-1 text-xs font-bold text-ink tabular-nums transition-all ${
              pattern.bars === b
                ? 'bg-neon-cyan shadow-[2px_2px_0_#17171C,0_0_10px_rgba(0,229,255,0.6)]'
                : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* 绘制 / 力度模式（触屏调力度的唯一入口） */}
      <div className="flex items-center gap-1">
        <span className="label-caps">{t.channelRack.mode}</span>
        {modeBtn(t.channelRack.draw, !velMode, () => onVelMode(false))}
        {modeBtn(t.channelRack.vel, velMode, () => onVelMode(true))}
      </div>

      <span className="ml-auto w-full label-caps md:w-auto">{hint}</span>
    </div>
  );
}

/* ============================================================
 * Channel Rack 主视图
 * ============================================================ */

export function ChannelRack() {
  const channels = useProjectStore((s) => s.channels);
  const pattern = useProjectStore((s) =>
    s.patterns.find((p) => p.id === s.currentPatternId),
  );
  const compact = useIsCompact();
  const [velMode, setVelMode] = useState(false);
  const rowH = compact ? 48 : 64;

  if (!pattern) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-2.5 md:gap-3 md:p-4">
      <PatternToolbar pattern={pattern} velMode={velMode} onVelMode={setVelMode} />

      {/* 单滚动容器：通道列表吸左、步进表头吸顶，两列行高严格对齐 */}
      <div className="relative flex min-h-0 flex-1 overflow-auto rounded-2xl border-2 border-ink bg-card">
        <ChannelList channels={channels} rowH={rowH} />
        <StepGrid
          channels={channels}
          pattern={pattern}
          rowH={rowH}
          velMode={velMode}
        />
      </div>
    </div>
  );
}
