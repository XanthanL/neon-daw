/**
 * Synth 模块容器（Task 8）：
 * 顶部合成器通道选择（胶囊）→ 左侧 5 类 × 3 预设浏览器（点击试听短句 + 应用到通道，
 * 面板控件同步）→ 右侧合成器参数面板（SynthPanel）→ 底部虚拟键盘（engine.noteOn/noteOff 试奏）。
 * 手机端：预设浏览器收进「音色库」浮层抽屉、虚拟键盘隐藏（演奏与叠录归键 6），
 * 整个模块只剩 SynthPanel 一个滚动容器。
 */
import { useEffect, useRef, useState } from 'react';
import { Music2, Waves } from 'lucide-react';
import { engine } from '../../audio/engine';
import {
  PRESET_CATEGORIES,
  PRESET_PHRASES,
  PRESET_PHRASE_TIMING,
  SYNTH_PRESETS,
  type PresetCategoryId,
} from '../../audio/synthPresets';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useLang } from '../../i18n/lang';
import { useT } from '../../i18n/ui';
import type { Channel } from '../../types/project';
import { ExpandStrip } from '../ui/ExpandStrip';
import { OverlaySheet } from '../ui/OverlaySheet';
import { SynthPanel } from './SynthPanel';

/* ============================================================
 * 虚拟键盘（2 个八度 C3–B4，白键 + 黑键叠放）
 * ============================================================ */

const LOW_MIDI = 48; // C3
const HIGH_MIDI = 71; // B4
const BLACK_SET = new Set([1, 3, 6, 8, 10]);
const isBlackKey = (m: number) => BLACK_SET.has(((m % 12) + 12) % 12);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m: number) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

function VirtualKeyboard({ channelId, color }: { channelId: string; color: string }) {
  const whites: number[] = [];
  for (let m = LOW_MIDI; m <= HIGH_MIDI; m++) if (!isBlackKey(m)) whites.push(m);
  const numWhite = whites.length;
  const [active, setActive] = useState<Set<number>>(new Set());

  const press = (m: number) => {
    void engine.noteOn(channelId, m, 100);
    setActive((s) => new Set(s).add(m));
  };
  const release = (m: number) => {
    engine.noteOff(channelId, m);
    setActive((s) => {
      const n = new Set(s);
      n.delete(m);
      return n;
    });
  };

  return (
    <div className="relative flex h-28 w-full touch-none select-none">
      {/* 白键 */}
      {whites.map((m) => (
        <button
          key={m}
          type="button"
          aria-label={noteName(m)}
          onPointerDown={(e) => {
            e.preventDefault();
            press(m);
          }}
          onPointerUp={() => release(m)}
          onPointerLeave={(e) => {
            if (e.buttons) release(m);
          }}
          className="relative flex-1 rounded-b-md border-2 border-ink border-t-0 bg-white transition-all"
          style={
            active.has(m)
              ? { background: color, boxShadow: `inset 0 0 14px ${color}` }
              : undefined
          }
        >
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-black text-ink/40">
            {noteName(m)}
          </span>
        </button>
      ))}
      {/* 黑键（叠在白键边界，绝对定位） */}
      {Array.from({ length: HIGH_MIDI - LOW_MIDI + 1 }).map((_, i) => {
        const m = LOW_MIDI + i;
        if (!isBlackKey(m)) return null;
        const wi = whites.indexOf(m - 1);
        if (wi < 0) return null;
        const leftPct = ((wi + 1) / numWhite) * 100;
        const wPct = (100 / numWhite) * 0.62;
        return (
          <button
            key={m}
            type="button"
            aria-label={noteName(m)}
            onPointerDown={(e) => {
              e.preventDefault();
              press(m);
            }}
            onPointerUp={() => release(m)}
            onPointerLeave={(e) => {
              if (e.buttons) release(m);
            }}
            className="absolute top-0 z-10 h-[60%] rounded-b-md border-2 border-ink bg-ink transition-transform active:translate-y-0.5"
            style={{
              left: `${leftPct}%`,
              width: `${wPct}%`,
              transform: 'translateX(-50%)',
              boxShadow: active.has(m) ? `0 0 12px ${color}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/* ============================================================
 * 预设浏览器
 * ============================================================ */

function PresetBrowser({
  channelId,
  applyPreset,
}: {
  channelId: string;
  applyPreset: (p: (typeof SYNTH_PRESETS)[number]) => void;
}) {
  const timers = useRef<number[]>([]);
  const t = useT();
  const lang = useLang((s) => s.lang);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const audition = (cat: PresetCategoryId) => {
    const phrase = PRESET_PHRASES[cat];
    const timing = PRESET_PHRASE_TIMING[cat];
    const gap = timing.gap * 1000;
    const dur = Math.max(120, gap * 0.85);
    phrase.forEach((midi, i) => {
      const start = i * gap;
      timers.current.push(
        window.setTimeout(() => void engine.noteOn(channelId, midi, 100), start),
      );
      timers.current.push(
        window.setTimeout(() => engine.noteOff(channelId, midi), start + dur),
      );
    });
  };

  return (
    <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-ink bg-bg-warm/60 p-3 md:w-[256px] md:border-r-2">
      <h4 className="label-caps mb-2">{t.synth.library}</h4>
      <div className="flex flex-col gap-3">
        {PRESET_CATEGORIES.map((cat) => (
          <section key={cat.id}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: cat.color, boxShadow: `0 0 5px ${cat.color}` }}
              />
              <span className="text-xs font-extrabold text-ink">{cat.label}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {SYNTH_PRESETS.filter((p) => p.category === cat.id).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={lang === 'zh' ? p.blurb : undefined}
                  onClick={() => {
                    applyPreset(p);
                    audition(cat.id);
                  }}
                  className="group flex flex-col items-start rounded-lg border-2 border-ink bg-card px-2.5 py-1.5 text-left transition-all shadow-hard-sm hover:-translate-y-0.5"
                >
                  <span className="text-xs font-extrabold text-ink">{p.name}</span>
                  {lang === 'zh' && (
                    <span className="line-clamp-1 text-[10px] font-semibold text-fg-muted">
                      {p.blurb}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

/* ============================================================
 * Synth 模块
 * ============================================================ */

export function Synth() {
  const channels = useProjectStore((s) => s.channels);
  const setSynth = useProjectStore((s) => s.setChannelSynthParams);
  const selId = useUiStore((s) => s.selectedChannelId);
  const selectChannel = useUiStore((s) => s.selectChannel);
  const t = useT();
  const synthChannels = channels.filter((c) => c.kind === 'synth');
  const [libOpen, setLibOpen] = useState(false);
  const selected: Channel | undefined =
    synthChannels.find((c) => c.id === selId) ?? synthChannels[0];

  if (!selected) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm font-semibold text-fg-muted">
        {t.synth.emptyChannels}
      </div>
    );
  }

  const applyPreset = (p: (typeof SYNTH_PRESETS)[number]) =>
    setSynth(selected.id, { ...p.params });

  const pickChannel = (id: string) => {
    selectChannel(id);
    setLibOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 合成器通道选择 */}
      <div className="flex shrink-0 items-center gap-2 border-b-2 border-ink/10 bg-bg-warm/60 px-3 py-2 md:px-4">
        <span className="label-caps hidden shrink-0 sm:inline">{t.synth.channel}</span>
        <ExpandStrip summary={selected.name} className="min-w-0 flex-1" listClassName="gap-2">
          {synthChannels.map((c) => {
            const on = c.id === selected.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => pickChannel(c.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-ink px-2.5 py-1 text-xs font-extrabold transition-all select-none ${
                  on ? '-translate-y-0.5' : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
                }`}
                style={
                  on
                    ? { background: c.color, boxShadow: `1.5px 1.5px 0 #17171C, 0 0 8px ${c.color}90` }
                    : undefined
                }
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: on ? '#17171C' : c.color, boxShadow: on ? undefined : `0 0 5px ${c.color}` }}
                />
                {c.name}
              </button>
            );
          })}
        </ExpandStrip>
        {/* 手机端音色库入口（内容在浮层抽屉中） */}
        <button
          type="button"
          onClick={() => setLibOpen(true)}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border-2 border-ink bg-card px-2.5 text-xs font-extrabold text-ink shadow-hard-sm transition-all select-none active:translate-y-0.5 active:shadow-none md:hidden"
        >
          <Waves className="h-4 w-4" strokeWidth={2.6} />
          {t.synth.librarySheet}
        </button>
      </div>

      {/* 主体：桌面预设浏览器 + 参数面板 */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="hidden md:flex">
          <PresetBrowser channelId={selected.id} applyPreset={applyPreset} />
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 md:p-4">
          <SynthPanel channel={selected} />
        </div>
      </div>

      {/* 虚拟键盘（仅桌面；手机端演奏与叠录归键 6） */}
      <div className="hidden shrink-0 border-t-2 border-ink bg-bg-warm/60 p-3 md:block">
        <div className="mb-1.5 flex items-center gap-2">
          <Music2 className="h-4 w-4 text-ink/50" strokeWidth={2.4} />
          <span className="label-caps">{t.synth.keyboard(selected.name)}</span>
        </div>
        <VirtualKeyboard channelId={selected.id} color={selected.color} />
      </div>

      <OverlaySheet open={libOpen} onClose={() => setLibOpen(false)} title={t.synth.librarySheet}>
        <PresetBrowser channelId={selected.id} applyPreset={applyPreset} />
      </OverlaySheet>
    </div>
  );
}
