/**
 * Pattern 管理器（顶栏 / ChannelRack 的「Pattern 列表」按钮呼出的浮层）
 * · 一屏管完所有 Pattern：设为当前 · 重命名 · 长度 1/2/4/8 · 复制 · 清空 · 删除
 * · 每行显示规模统计（开启步数 / 音符数）与被 Song 引用的片段数，删除前据此确认级联影响
 * · 桌面居中弹窗、手机底部抽屉（OverlaySheet desktopCentered）
 * · 所有写操作走 projectStore actions → 自动进撤销栈（Ctrl+Z 可回）
 */
import { useState } from 'react';
import { Check, Copy, Eraser, Plus, Trash2 } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import type { Pattern } from '../../types/project';
import { IconButton } from '../ui/IconButton';
import { OverlaySheet } from '../ui/OverlaySheet';

const BARS_OPTIONS: Pattern['bars'][] = [1, 2, 4, 8];

const countOnSteps = (p: Pattern) =>
  Object.values(p.steps).reduce(
    (acc, arr) =>
      acc +
      arr.slice(0, p.bars * 16).reduce((a, st) => a + (st.on ? 1 : 0), 0),
    0,
  );

function PatternRow({
  pattern,
  index,
  isCurrent,
  clipRefs,
  onlyOne,
}: {
  pattern: Pattern;
  index: number;
  isCurrent: boolean;
  clipRefs: number;
  onlyOne: boolean;
}) {
  const setCurrentPatternId = useProjectStore((s) => s.setCurrentPatternId);
  const renamePattern = useProjectStore((s) => s.renamePattern);
  const duplicatePattern = useProjectStore((s) => s.duplicatePattern);
  const setPatternBars = useProjectStore((s) => s.setPatternBars);
  const removePattern = useProjectStore((s) => s.removePattern);
  const clearPattern = useProjectStore((s) => s.clearPattern);
  const t = useT();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pattern.name);

  const commit = () => {
    const nm = draft.trim();
    if (nm && nm !== pattern.name) renamePattern(pattern.id, nm);
    setEditing(false);
  };

  /* 先回填名称再退出：卸载聚焦中的输入框仍会触发 blur → commit，不能把放弃的草稿写回去 */
  const cancel = () => {
    setDraft(pattern.name);
    setEditing(false);
  };

  const askRemove = () => {
    const suffix = clipRefs > 0 ? t.patternManager.deleteSuffix(clipRefs) : '';
    if (window.confirm(t.patternManager.deleteConfirm(pattern.name, suffix))) {
      removePattern(pattern.id);
    }
  };

  const askClear = () => {
    if (window.confirm(t.patternManager.clearConfirm(pattern.name))) {
      clearPattern(pattern.id);
    }
  };

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border-2 border-ink p-2.5 ${
        isCurrent ? 'bg-ink/90 text-white' : 'bg-card text-ink shadow-hard-sm'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink text-xs font-black tabular-nums ${
            isCurrent ? 'border-white/40 bg-white/10 text-white' : 'bg-panel text-fg-muted'
          }`}
        >
          {index + 1}
        </span>

        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') cancel();
            }}
            className={`min-w-0 flex-1 rounded-lg border-2 border-ink px-2.5 py-1.5 text-sm font-bold outline-none ${
              isCurrent ? 'bg-white/10 text-white' : 'bg-card text-ink'
            }`}
          />
        ) : (
          <button
            type="button"
            title={t.patternManager.rename}
            onClick={() => {
              setDraft(pattern.name);
              setEditing(true);
            }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 py-1 text-left text-sm font-extrabold"
          >
            <span className="truncate">{pattern.name}</span>
            {isCurrent && (
              <span
                className="shrink-0 rounded-md bg-neon-cyan px-1.5 py-0.5 text-[10px] font-black text-ink"
                aria-label={t.patternManager.currentAria}
              >
                {t.patternManager.current}
              </span>
            )}
          </button>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            label={isCurrent ? t.patternManager.isCurrent : t.patternManager.setCurrent}
            active={isCurrent}
            disabled={isCurrent}
            onClick={() => setCurrentPatternId(pattern.id)}
          >
            <Check />
          </IconButton>
          <IconButton label={t.patternManager.duplicate} onClick={() => duplicatePattern(pattern.id)}>
            <Copy />
          </IconButton>
          <IconButton label={t.patternManager.clear} onClick={askClear}>
            <Eraser />
          </IconButton>
          <IconButton
            label={onlyOne ? t.patternManager.keepOne : t.patternManager.del}
            disabled={onlyOne}
            onClick={askRemove}
          >
            <Trash2 />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className={`label-caps ${isCurrent ? 'text-white/70' : ''}`}>
          {t.patternManager.meta(pattern.bars, countOnSteps(pattern), pattern.notes.length, clipRefs)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {BARS_OPTIONS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setPatternBars(pattern.id, b)}
              className={`h-7 w-8 shrink-0 cursor-pointer rounded-lg border-2 border-ink text-xs font-extrabold text-ink tabular-nums transition-all select-none ${
                pattern.bars === b
                  ? 'bg-neon-cyan shadow-[1.5px_1.5px_0_#17171C,0_0_8px_rgba(0,229,255,0.5)]'
                  : 'bg-card shadow-hard-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PatternManagerSheet() {
  const open = useUiStore((s) => s.patternManagerOpen);
  const setOpen = useUiStore((s) => s.setPatternManagerOpen);
  const patterns = useProjectStore((s) => s.patterns);
  const currentPatternId = useProjectStore((s) => s.currentPatternId);
  const songTracks = useProjectStore((s) => s.song.tracks);
  const addPattern = useProjectStore((s) => s.addPattern);

  const refsById = new Map<string, number>();
  for (const t of songTracks) {
    for (const c of t.clips) {
      refsById.set(c.patternId, (refsById.get(c.patternId) ?? 0) + 1);
    }
  }
  const t = useT();

  return (
    <OverlaySheet
      open={open}
      onClose={() => setOpen(false)}
      title={t.patternManager.title}
      desktopCentered
    >
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => addPattern()}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-ink bg-card px-3.5 py-2.5 text-sm font-extrabold text-ink shadow-hard-sm transition-all hover:-translate-y-0.5 hover:shadow-hard active:translate-y-0 active:shadow-hard-sm select-none"
        >
          <Plus className="h-4 w-4" strokeWidth={2.6} />
          {t.patternManager.add}
        </button>

        {patterns.map((p, i) => (
          <PatternRow
            key={p.id}
            pattern={p}
            index={i}
            isCurrent={p.id === currentPatternId}
            clipRefs={refsById.get(p.id) ?? 0}
            onlyOne={patterns.length <= 1}
          />
        ))}

        <p className="label-caps">{t.patternManager.undoNote}</p>
      </div>
    </OverlaySheet>
  );
}
