/**
 * Channel Rack 左侧通道列表（sticky 在滚动容器左）
 * 每行：通道荧光色条 / 名称 / 静音 M /（桌面端）音量·声像小旋钮
 * 行高由父级按视口传入，与步进网格严格对齐；手机端隐藏旋钮（音量在 Mixer 调）
 * 点击通道行选中（uiStore.selectedChannelId，供 Piano Roll 关联通道）并预览发声
 */
import { engine } from '../../audio/engine';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import type { Channel } from '../../types/project';
import { Knob } from '../ui/Knob';
import { Tooltip } from '../ui/Tooltip';

/* ============================================================
 * 静音按钮（M 贴纸）
 * ============================================================ */

function MuteButton({ trackId, muted }: { trackId: string; muted: boolean }) {
  const toggleTrackMute = useProjectStore((s) => s.toggleTrackMute);
  const t = useT();
  return (
    <button
      type="button"
      aria-label={muted ? t.common.unmute : t.common.mute}
      aria-pressed={muted}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => toggleTrackMute(trackId)}
      className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-ink text-[10px] font-black text-ink transition-all select-none md:h-6 md:w-6 ${
        muted
          ? 'bg-neon-yellow shadow-[1.5px_1.5px_0_#17171C,0_0_8px_rgba(255,230,0,0.6)]'
          : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
      }`}
    >
      M
    </button>
  );
}

/* ============================================================
 * 通道行
 * ============================================================ */

function ChannelRow({
  ch,
  selected,
  rowH,
}: {
  ch: Channel;
  selected: boolean;
  rowH: number;
}) {
  const track = useProjectStore((s) =>
    s.mixerTracks.find((t) => t.id === ch.mixerTrackId),
  );
  const setTrackVolume = useProjectStore((s) => s.setTrackVolume);
  const setTrackPan = useProjectStore((s) => s.setTrackPan);
  const selectChannel = useUiStore((s) => s.selectChannel);
  const t = useT();

  if (!track) return null;

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={() => {
        selectChannel(ch.id);
        void engine.previewChannel(ch.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') selectChannel(ch.id);
      }}
      className={`relative flex cursor-pointer items-center gap-2 border-b-2 border-ink/10 pr-2.5 pl-3.5 select-none ${
        selected ? 'bg-[#EDFAFE]' : 'bg-card hover:bg-[#F6F8FB]'
      }`}
      style={{
        height: rowH,
        boxShadow: selected ? 'inset 0 0 0 2px #17171C' : undefined,
      }}
    >
      {/* 通道荧光色条 */}
      <span
        className="absolute top-0 bottom-0 left-0 w-1.5"
        style={{ background: ch.color, boxShadow: `0 0 6px ${ch.color}66` }}
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-ink">{ch.name}</div>
        <div className="label-caps text-[9px] text-fg-faint">
          {ch.kind === 'drum' ? ch.drumType : 'synth'}
        </div>
      </div>

      <MuteButton trackId={track.id} muted={track.mute} />

      {/* 音量 / 声像小旋钮（桌面端；手机端在 Mixer 中调整） */}
      <span
        className="hidden items-center gap-1 md:flex"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Tooltip content={t.common.volume}>
          <Knob
            value={track.volume}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.8}
            onChange={(v) => setTrackVolume(track.id, v)}
            color={ch.color}
            size={30}
            showValue={false}
            format={(v) => `${Math.round(v * 100)}`}
          />
        </Tooltip>
        <Tooltip content={t.common.pan}>
          <Knob
            value={track.pan}
            min={-1}
            max={1}
            step={0.02}
            defaultValue={0}
            onChange={(v) => setTrackPan(track.id, v)}
            color={ch.color}
            size={30}
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
      </span>
    </div>
  );
}

/* ============================================================
 * 通道列表（sticky left：网格横向滚动时固定在左）
 * ============================================================ */

export function ChannelList({
  channels,
  rowH,
}: {
  channels: Channel[];
  rowH: number;
}) {
  const selectedChannelId = useUiStore((s) => s.selectedChannelId);

  return (
    <div className="sticky left-0 z-30 w-40 shrink-0 border-r-2 border-ink bg-card md:w-60">
      <div className="sticky top-0 z-40 flex h-7 items-center border-b-2 border-ink bg-bg-warm px-3.5">
        <span className="label-caps">Channels · {channels.length}</span>
      </div>
      {channels.map((ch) => (
        <ChannelRow
          key={ch.id}
          ch={ch}
          selected={ch.id === selectedChannelId}
          rowH={rowH}
        />
      ))}
    </div>
  );
}
