/**
 * Mixer 轨道条：轨道名 + 通道荧光色标识 / 4 效果器插槽 /
 * 实时电平表（峰值保持）+ 音量推子 / 声像旋钮 / 静音·独奏贴纸按钮
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Power, X } from 'lucide-react';
import { FX_LIBRARY, FX_ORDER } from '../../audio/effects';
import { useProjectStore } from '../../stores/projectStore';
import { useT } from '../../i18n/ui';
import type { FxInstance, FxType, MixerTrack } from '../../types/project';
import { Fader } from '../ui/Fader';
import { Knob } from '../ui/Knob';
import { LevelMeter } from '../ui/LevelMeter';
import { Tooltip } from '../ui/Tooltip';
import { useIsCompact } from '../ui/useIsCompact';
import { useTrackLevel } from './useTrackLevel';

/* ============================================================
 * 效果器添加菜单（portal 挂 body，fixed 定位避开滚动裁剪）
 * ============================================================ */

function FxAddMenu({
  anchor,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  onPick: (type: FxType) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  const rect = anchor.getBoundingClientRect();
  const MENU_W = 190;
  const MENU_H = 300;

  useEffect(() => {
    const onDocDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const left = Math.min(
    Math.max(8, rect.left),
    window.innerWidth - MENU_W - 8,
  );
  const openDown = rect.bottom + MENU_H < window.innerHeight;
  const top = openDown ? rect.bottom + 6 : Math.max(8, rect.top - MENU_H - 6);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[90] w-[190px] overflow-y-auto rounded-xl border-2 border-ink bg-card p-1.5"
      style={{ top, left, maxHeight: MENU_H, boxShadow: '3px 3px 0 #17171C' }}
    >
      {FX_ORDER.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => onPick(type)}
          className="block w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-ink transition-colors hover:bg-panel"
        >
          {t.fx.name[type] ?? FX_LIBRARY[type].label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/* ============================================================
 * 效果器插槽
 * ============================================================ */

function FxSlot({
  trackId,
  fx,
  color,
  onOpenMenu,
  onSelect,
}: {
  trackId: string;
  fx: FxInstance | undefined;
  color: string;
  onOpenMenu: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onSelect: () => void;
}) {
  const toggleEffectBypass = useProjectStore((s) => s.toggleEffectBypass);
  const removeEffect = useProjectStore((s) => s.removeEffect);
  const t = useT();

  if (!fx) {
    return (
      <button
        type="button"
        onClick={onOpenMenu}
        className="h-7 w-full cursor-pointer rounded-lg border-2 border-dashed border-ink/30 bg-panel/60 text-[10px] font-bold text-fg-muted transition-all hover:-translate-y-px hover:border-ink/60 hover:text-ink"
      >
        {t.common.add}
      </button>
    );
  }

  const meta = FX_LIBRARY[fx.type];
  return (
    <div
      className={`group flex h-7 w-full items-center gap-1 overflow-hidden rounded-lg border-2 border-ink pr-0.5 pl-1.5 transition-all ${
        fx.bypass ? 'bg-panel opacity-55' : 'bg-card'
      }`}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={
          fx.bypass
            ? { background: '#A8A8B2' }
            : { background: color, boxShadow: `0 0 4px ${color}` }
        }
      />
      <button
        type="button"
        onClick={onSelect}
        title={t.fx.name[fx.type] ?? meta.label}
        className="min-w-0 flex-1 cursor-pointer truncate text-left text-[10px] font-bold text-ink"
      >
        {meta.short}
      </button>
      <Tooltip content={fx.bypass ? t.mixer.unbypass : t.mixer.bypassTip}>
        <button
          type="button"
          onClick={() => toggleEffectBypass(trackId, fx.id)}
          className={`shrink-0 cursor-pointer rounded p-0.5 transition-colors ${
            fx.bypass ? 'text-fg-faint hover:text-ink' : 'text-ink hover:text-fg-muted'
          }`}
        >
          <Power className="h-3 w-3" strokeWidth={2.8} />
        </button>
      </Tooltip>
      <Tooltip content={t.mixer.deleteFx}>
        <button
          type="button"
          onClick={() => removeEffect(trackId, fx.id)}
          className="shrink-0 cursor-pointer rounded p-0.5 text-fg-faint opacity-100 transition-all hover:text-ink md:opacity-0 md:group-hover:opacity-100"
        >
          <X className="h-3 w-3" strokeWidth={2.8} />
        </button>
      </Tooltip>
    </div>
  );
}

/* ============================================================
 * M / S 贴纸按钮
 * ============================================================ */

function MsButtons({ track, color }: { track: MixerTrack; color: string }) {
  const toggleMute = useProjectStore((s) => s.toggleTrackMute);
  const toggleSolo = useProjectStore((s) => s.toggleTrackSolo);
  const t = useT();
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        aria-pressed={track.mute}
        aria-label={t.common.mute}
        onClick={() => toggleMute(track.id)}
        className={`h-6 flex-1 cursor-pointer rounded-lg border-2 border-ink text-[10px] font-black transition-all select-none ${
          track.mute
            ? 'bg-neon-yellow shadow-[1.5px_1.5px_0_#17171C,0_0_8px_rgba(255,230,0,0.6)]'
            : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
        }`}
      >
        M
      </button>
      <button
        type="button"
        aria-pressed={track.solo}
        aria-label={t.common.solo}
        onClick={() => toggleSolo(track.id)}
        className={`h-6 flex-1 cursor-pointer rounded-lg border-2 border-ink text-[10px] font-black transition-all select-none ${
          track.solo
            ? 'shadow-[1.5px_1.5px_0_#17171C,0_0_8px_rgba(0,229,255,0.6)]'
            : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
        }`}
        style={track.solo ? { background: color } : undefined}
      >
        S
      </button>
    </div>
  );
}

/* ============================================================
 * 轨道条
 * ============================================================ */

export interface ChannelStripProps {
  track: MixerTrack;
  /** 通道荧光色（Master 用荧光青） */
  color: string;
  selected: boolean;
  /** 任一轨独奏中（其余轨 UI 变暗反映被静音） */
  anySolo: boolean;
  isMaster?: boolean;
  onSelect: () => void;
}

export function ChannelStrip({
  track,
  color,
  selected,
  anySolo,
  isMaster = false,
  onSelect,
}: ChannelStripProps) {
  const setTrackVolume = useProjectStore((s) => s.setTrackVolume);
  const setTrackPan = useProjectStore((s) => s.setTrackPan);
  const addEffect = useProjectStore((s) => s.addEffect);
  const level = useTrackLevel(track.id);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const compact = useIsCompact();
  const t = useT();

  /* 独奏时其余轨 / 被静音轨：视觉变暗（engine 已同步静音门） */
  const silenced =
    track.mute || (!isMaster && anySolo && !track.solo) || (isMaster && track.mute);
  const slots: (FxInstance | undefined)[] = [0, 1, 2, 3].map(
    (i) => track.effects[i],
  );

  return (
    <div
      className={`relative flex w-[96px] shrink-0 flex-col gap-2 rounded-2xl border-2 border-ink bg-card p-2 transition-shadow md:w-[108px] ${
        silenced ? 'opacity-55' : ''
      }`}
      style={{
        boxShadow: selected
          ? `3px 3px 0 #17171C, 0 0 12px ${color}80`
          : '3px 3px 0 #17171C',
      }}
    >
      {/* 轨道名 + 通道荧光色标识（点击选中 → 右侧参数面板） */}
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-panel"
        title={t.mixer.selectFx(track.name)}
      >
        <span
          className="h-3 w-1.5 shrink-0 rounded-full"
          style={{ background: color, boxShadow: `0 0 5px ${color}90` }}
        />
        <span className="w-full truncate text-xs font-extrabold text-ink">
          {track.name}
        </span>
      </button>

      {/* 效果器插槽 ×4（手机 2×2，桌面竖列） */}
      <div className="grid grid-cols-2 gap-1 md:flex md:flex-col md:gap-1.5">
        {slots.map((fx, i) => (
          <FxSlot
            key={fx?.id ?? `empty-${i}`}
            trackId={track.id}
            fx={fx}
            color={color}
            onSelect={onSelect}
            onOpenMenu={(e) => setMenuAnchor(e.currentTarget)}
          />
        ))}
      </div>

      {/* 电平表 + 推子 */}
      <div
        className="flex flex-1 items-stretch justify-center gap-1.5 pt-1"
        style={{ minHeight: compact ? 104 : 150 }}
      >
        <div className="flex flex-col items-center gap-1">
          <LevelMeter value={level} length={compact ? 96 : 132} thickness={9} />
          <span className="label-caps text-[8px] text-fg-faint">dB</span>
        </div>
        <Fader
          value={track.volume}
          onChange={(v) => setTrackVolume(track.id, v)}
          color={color}
          height={compact ? 104 : 150}
          defaultValue={isMaster ? 0.85 : 0.8}
        />
      </div>

      {/* 声像 */}
      <div className="flex justify-center">
        <Tooltip content={t.mixer.panReset}>
          <Knob
            value={track.pan}
            min={-1}
            max={1}
            step={0.02}
            defaultValue={0}
            onChange={(v) => setTrackPan(track.id, v)}
            color={color}
            size={34}
            showValue={false}
            format={(v) =>
              Math.abs(v) < 0.01
                ? 'C'
                : v < 0
                  ? `L${Math.round(-v * 100)}`
                  : `R${Math.round(v * 100)}`
            }
          />
        </Tooltip>
      </div>

      {/* M / S（Master 仅 M） */}
      {isMaster ? (
        <div className="flex">
          <button
            type="button"
            aria-pressed={track.mute}
            aria-label={t.mixer.masterMute}
            onClick={() =>
              useProjectStore.getState().toggleTrackMute(track.id)
            }
            className={`h-6 w-full cursor-pointer rounded-lg border-2 border-ink text-[10px] font-black transition-all select-none ${
              track.mute
                ? 'bg-neon-yellow shadow-[1.5px_1.5px_0_#17171C,0_0_8px_rgba(255,230,0,0.6)]'
                : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
            }`}
          >
            MUTE
          </button>
        </div>
      ) : (
        <MsButtons track={track} color={color} />
      )}

      {/* 添加效果器下拉（portal） */}
      {menuAnchor && (
        <FxAddMenu
          anchor={menuAnchor}
          onPick={(type) => {
            addEffect(track.id, type);
            setMenuAnchor(null);
          }}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </div>
  );
}
