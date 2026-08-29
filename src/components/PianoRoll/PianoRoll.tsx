/**
 * Piano Roll 钢琴卷帘（Task 6）
 * - 单滚动容器：小节标尺吸顶 / 键盘列吸左 / 力度编辑条吸底（时间严格对位）
 * - 吸附工具条（1/4 · 1/8 · 1/16 · 1/32 · 1/8T）+ 关联通道选择（与 Channel Rack 共享 selectedChannelId）
 * - Ctrl+滚轮横向缩放（步宽 24-64px，缩放保持滚动锚点）
 * - Delete 删除选中音符；编辑全部经 projectStore actions + historyStore
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, ZoomIn, ZoomOut } from 'lucide-react';
import { engine } from '../../audio/engine';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import { useIsCompact } from '../ui/useIsCompact';
import {
  KEY_W,
  PITCH_MAX,
  PITCH_MIN,
  ROW_H,
  RULER_H,
  SNAP_OPTIONS,
  SNAP_STEPS,
  VEL_H,
  isBlackKey,
} from './constants';
import type { ChannelInfo, SnapOption } from './constants';
import { GridArea } from './GridArea';
import { VelocityStrip } from './VelocityStrip';

const clamp = (min: number, max: number, v: number) =>
  Math.min(max, Math.max(min, v));

/* ============================================================
 * 键盘列（点击预览发声，C 键标注 C2-C7）
 * ============================================================ */

function KeyboardCol({
  channelId,
  channelInfo,
}: {
  channelId: string;
  channelInfo?: ChannelInfo;
}) {
  const preview = (pitch: number) => {
    if (!channelInfo) return;
    if (channelInfo.kind === 'drum')
      void engine.previewChannel(channelId, 100);
    else void engine.previewNote(channelId, pitch, 100);
  };

  const rows = Array.from(
    { length: PITCH_MAX - PITCH_MIN + 1 },
    (_, r) => PITCH_MAX - r,
  );

  return (
    <div
      className="sticky left-0 z-20 shrink-0 border-r-2 border-ink bg-card select-none"
      style={{ width: KEY_W }}
    >
      {rows.map((midi) => {
        const black = isBlackKey(midi);
        const isC = midi % 12 === 0;
        return (
          <div
            key={midi}
            onPointerDown={() => preview(midi)}
            className={`relative cursor-pointer ${black ? 'bg-[#2B2B33]' : 'bg-card'} hover:brightness-95`}
            style={{
              height: ROW_H,
              boxShadow: isC
                ? 'inset 0 -2px 0 rgba(23,23,28,0.32)'
                : 'inset 0 -1px 0 rgba(23,23,28,0.14)',
            }}
          >
            {isC && (
              <span className="absolute top-1/2 left-1.5 -translate-y-1/2 text-[10px] font-extrabold text-fg-muted tabular-nums">
                C{midi / 12 - 1}
              </span>
            )}
            {black && (
              <span className="absolute top-0 right-0 bottom-0 w-1.5 bg-ink" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
 * 小节标尺
 * ============================================================ */

function Ruler({
  bars,
  stepW,
}: {
  bars: number;
  stepW: number;
}) {
  return (
    <div
      className="relative shrink-0 border-b-2 border-ink bg-bg-warm select-none"
      style={{ width: bars * 16 * stepW, height: RULER_H }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, rgba(23,23,28,0.3) 0 1px, transparent 1px ${stepW * 4}px)`,
        }}
      />
      {Array.from({ length: bars }, (_, b) => (
        <div
          key={b}
          className="absolute top-0 bottom-0 border-l-2 border-ink/50"
          style={{ left: b * 16 * stepW }}
        >
          <span className="absolute top-1 left-1 text-[10px] font-extrabold text-ink/70 tabular-nums">
            {b + 1}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
 * Piano Roll 主视图
 * ============================================================ */

export function PianoRoll() {
  const channels = useProjectStore((s) => s.channels);
  const pattern = useProjectStore((s) =>
    s.patterns.find((p) => p.id === s.currentPatternId),
  );
  const removeNotes = useProjectStore((s) => s.removeNotes);

  const selectedChannelId = useUiStore((s) => s.selectedChannelId);
  const selectChannel = useUiStore((s) => s.selectChannel);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const playMode = useUiStore((s) => s.playMode);
  const currentStep = useUiStore((s) => s.currentStep);

  const compact = useIsCompact();
  const t = useT();
  const [snap, setSnap] = useState<SnapOption>('1/16');
  const [stepW, setStepW] = useState(compact ? 26 : 40);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const scrollerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef({ w: stepW, left: 0 });

  const channelMap = useMemo(
    () =>
      Object.fromEntries(
        channels.map((c) => [c.id, { color: c.color, kind: c.kind }]),
      ) as Record<string, ChannelInfo>,
    [channels],
  );

  /* 关联通道：无效时回落到第一个合成器通道 */
  const effectiveChannelId = channels.some((c) => c.id === selectedChannelId)
    ? (selectedChannelId as string)
    : (channels.find((c) => c.kind === 'synth')?.id ?? channels[0]?.id ?? '');

  const totalSteps = (pattern?.bars ?? 1) * 16;
  const bars = pattern?.bars ?? 1;

  /* Ctrl+滚轮横向缩放（步宽 24-64px；非 passive 才能 preventDefault） */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setStepW((w) => clamp(24, 64, Math.round(w - e.deltaY * 0.1)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* 缩放后按比例恢复滚动锚点 */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (anchorRef.current.w !== stepW) {
      el.scrollLeft = anchorRef.current.left * (stepW / anchorRef.current.w);
    }
    anchorRef.current = { w: stepW, left: el.scrollLeft };
  }, [stepW]);

  /* Delete / Backspace 删除选中音符（输入框聚焦时不劫持） */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      )
        return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        removeNotes([...selectedIds]);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, removeNotes]);

  if (!pattern) return null;

  /* 播放头仅在 Pattern 模式显示；走带计的是整个循环区间，回绕到本 Pattern 格 */
  const playStep =
    isPlaying && playMode === 'pattern' ? currentStep % totalSteps : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2.5 md:gap-3 md:p-4">
      {/* 工具条：吸附档位 + 缩放 + 关联通道 + 橡皮擦 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="label-caps">Snap</span>
        <div className="flex items-center gap-1">
          {SNAP_OPTIONS.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setSnap(o)}
              className={`shrink-0 cursor-pointer rounded-full border-2 border-ink px-2.5 py-1 text-xs font-bold text-ink transition-all ${
                snap === o
                  ? 'bg-neon-cyan shadow-[2px_2px_0_#17171C,0_0_10px_rgba(0,229,255,0.6)]'
                  : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
              }`}
            >
              {o}
            </button>
          ))}
        </div>

        {/* 缩放（手机端唯一入口，桌面用 Ctrl+滚轮） */}
        <div className="flex items-center gap-1 md:hidden">
          <button
            type="button"
            aria-label={t.pianoRoll.zoomOut}
            onClick={() => setStepW((w) => clamp(24, 64, w - 6))}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-ink bg-card text-ink shadow-hard-sm transition-all active:-translate-y-0.5"
          >
            <ZoomOut className="h-3.5 w-3.5" strokeWidth={2.6} />
          </button>
          <button
            type="button"
            aria-label={t.pianoRoll.zoomIn}
            onClick={() => setStepW((w) => clamp(24, 64, w + 6))}
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-ink bg-card text-ink shadow-hard-sm transition-all active:-translate-y-0.5"
          >
            <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.6} />
          </button>
        </div>

        <div className="mx-1 h-6 w-0.5 rounded-full bg-ink/10" />
        <span className="label-caps">Channel</span>
        <div className="flex max-w-[60vw] flex-wrap items-center gap-1 md:max-w-[460px]">
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => selectChannel(c.id)}
              className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-2 border-ink px-2.5 py-1 text-xs font-bold text-ink transition-all ${
                c.id === effectiveChannelId
                  ? 'shadow-[2px_2px_0_#17171C,0_0_10px_rgba(0,229,255,0.45)]'
                  : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
              }`}
              style={
                c.id === effectiveChannelId
                  ? { background: `color-mix(in srgb, ${c.color} 30%, #ffffff)` }
                  : undefined
              }
            >
              <span
                className="h-2 w-2 rounded-full border border-ink"
                style={{ background: c.color }}
              />
              {c.name}
            </button>
          ))}
        </div>

        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={() => {
              removeNotes([...selectedIds]);
              setSelectedIds(new Set());
            }}
            className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-2 border-ink bg-neon-pink px-2.5 text-[11px] font-extrabold text-ink transition-all active:-translate-y-0.5"
            style={{ boxShadow: '1.5px 1.5px 0 #17171C, 0 0 8px rgba(255,61,190,0.6)' }}
          >
            <Eraser className="h-3.5 w-3.5" strokeWidth={2.6} />
            {t.pianoRoll.deleteN(selectedIds.size)}
          </button>
        )}

        <span className="ml-auto w-full label-caps md:w-auto">
          {compact ? t.pianoRoll.hintTouch : t.pianoRoll.hintDesktop}
        </span>
      </div>

      {/* 网格主体（单滚动容器：标尺吸顶 / 键盘吸左 / 力度条吸底） */}
      <div
        ref={scrollerRef}
        className="relative min-h-0 flex-1 overflow-auto rounded-2xl border-2 border-ink bg-card"
      >
        <div style={{ width: KEY_W + totalSteps * stepW }}>
          {/* 标尺行 */}
          <div className="sticky top-0 z-30 flex">
            <div
              className="sticky left-0 z-40 flex shrink-0 items-center border-r-2 border-b-2 border-ink bg-bg-warm px-2"
              style={{ width: KEY_W, height: RULER_H }}
            >
              <span className="label-caps text-[10px]">{t.pianoRoll.bar}</span>
            </div>
            <Ruler bars={bars} stepW={stepW} />
          </div>

          {/* 网格行 */}
          <div className="flex">
            <KeyboardCol
              channelId={effectiveChannelId}
              channelInfo={channelMap[effectiveChannelId]}
            />
            <GridArea
              notes={pattern.notes}
              totalSteps={totalSteps}
              stepW={stepW}
              snapSteps={SNAP_STEPS[snap]}
              channelMap={channelMap}
              selectedChannelId={effectiveChannelId}
              selectedIds={selectedIds}
              onSelect={setSelectedIds}
              playStep={playStep}
            />
          </div>

          {/* 力度编辑条（吸底，与网格共享横向滚动） */}
          <div className="sticky bottom-0 z-30 flex">
            <div
              className="sticky left-0 z-40 flex shrink-0 items-center border-r-2 border-t-2 border-ink bg-bg-warm px-2"
              style={{ width: KEY_W, height: VEL_H }}
            >
              <span className="label-caps text-[10px]">{t.pianoRoll.velocity}</span>
            </div>
            <VelocityStrip
              notes={pattern.notes}
              stepW={stepW}
              totalSteps={totalSteps}
              channelMap={channelMap}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
