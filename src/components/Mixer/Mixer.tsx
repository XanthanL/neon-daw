/**
 * Mixer 混音器主视图：
 * 左侧横向滚动的通道轨道条（每通道一条 + Master），
 * 桌面右侧为选中轨的效果器参数面板，手机改为「效果器」按钮呼出浮层抽屉；
 * 选中轨提升到 uiStore，切模块后不丢。
 */
import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import { ChannelStrip } from './ChannelStrip';
import { FxPanel } from './FxPanel';
import { OverlaySheet } from '../ui/OverlaySheet';

const MASTER_ID = 'track-master';
const MASTER_COLOR = '#00E5FF';

export function Mixer() {
  const tracks = useProjectStore((s) => s.mixerTracks);
  const channels = useProjectStore((s) => s.channels);
  const selectedId = useUiStore((s) => s.selectedMixerTrackId);
  const selectMixerTrack = useUiStore((s) => s.selectMixerTrack);
  const [fxSheet, setFxSheet] = useState(false);
  const t = useT();

  /* 通道荧光色：mixerTrackId → channel.color */
  const colorByTrack = new Map(channels.map((c) => [c.mixerTrackId, c.color]));
  const channelTracks = tracks.filter((t) => t.id !== MASTER_ID);
  const master = tracks.find((t) => t.id === MASTER_ID);
  const anySolo = channelTracks.some((t) => t.solo);

  /* 抽卡 / 导入会重置轨道 id：选中轨不存在时回落 Master */
  const selectedTrackId = tracks.some((t) => t.id === selectedId)
    ? (selectedId as string)
    : MASTER_ID;
  const selected = tracks.find((t) => t.id === selectedTrackId);
  const selectedColor =
    selectedTrackId === MASTER_ID
      ? MASTER_COLOR
      : (colorByTrack.get(selectedTrackId) ?? MASTER_COLOR);

  const select = (id: string) => {
    selectMixerTrack(id);
    setFxSheet(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {/* 轨道区（横向滚动） */}
      <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-h-[312px] items-stretch gap-3 p-3 md:min-h-[430px] md:p-4">
          {channelTracks.map((t) => (
            <ChannelStrip
              key={t.id}
              track={t}
              color={colorByTrack.get(t.id) ?? MASTER_COLOR}
              selected={selectedTrackId === t.id}
              anySolo={anySolo}
              onSelect={() => select(t.id)}
            />
          ))}

          {/* Master 分隔 */}
          <div className="flex w-0 shrink-0 items-stretch">
            <div className="my-1 w-0.5 rounded-full bg-ink/15" />
          </div>

          {master && (
            <ChannelStrip
              track={master}
              color={MASTER_COLOR}
              selected={selectedTrackId === master.id}
              anySolo={anySolo}
              isMaster
              onSelect={() => select(master.id)}
            />
          )}
        </div>
      </div>

      {/* 效果器参数面板：桌面常驻右栏 */}
      <div className="hidden md:flex">
        <FxPanel trackId={selectedTrackId} color={selectedColor} />
      </div>

      {/* 手机：轨道条下方一个入口，效果器链在浮层抽屉里调 */}
      <button
        type="button"
        onClick={() => setFxSheet(true)}
        className="mx-3 mb-3 flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-ink bg-card px-3 py-2 text-xs font-extrabold text-ink shadow-hard-sm transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none md:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={2.6} />
        {t.mixer.fxChain(selected?.name ?? 'Master', selected?.effects.length ?? 0)}
      </button>

      <OverlaySheet
        open={fxSheet}
        onClose={() => setFxSheet(false)}
        title={`${selected?.name ?? 'Master'} · FX Chain`}
      >
        <FxPanel trackId={selectedTrackId} color={selectedColor} />
      </OverlaySheet>
    </div>
  );
}
