/**
 * Live Keys（键 6）：类库乐队的演奏键盘 + 循环实时录音
 * · 可选合成器通道 / 一键套用音色库预设切换音色
 * · Pattern 循环播放中敲击键盘 → 就近量化到 16 分步写入当前 Pattern，
 *   音符时值 = 按住时长；下一圈循环即自动奏出（ overdub 叠录效果）
 * · 录音开关可关闭，关闭时仅试听演奏不落格
 * · 全触控实现（pointer 事件 + touch-none），移动端可多指弹奏
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Circle, Mic, Music2, Play } from 'lucide-react';
import { engine } from '../../audio/engine';
import { SYNTH_PRESETS } from '../../audio/synthPresets';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import type { Channel } from '../../types/project';

const BLACK_SET = new Set([1, 3, 6, 8, 10]);
const isBlackKey = (m: number) => BLACK_SET.has(((m % 12) + 12) % 12);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m: number) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/** 按住的音符：按下时刻（ms）+ 量化落点步（null = 不录音）+ 每步秒数 */
interface HeldNote {
  t0: number;
  step: number | null;
  stepSeconds: number;
}

/* 预设分类功能色（与 synthPresets 分类一致） */
const PRESET_COLORS: Record<string, string> = {
  bass: '#4D9FFF',
  lead: '#FF9F1C',
  pluck: '#39FF88',
  pad: '#A78BFA',
  keys: '#FFE600',
};

const KEY_COUNT = 25; // 两个八度 + 高音 C

/* 电脑键盘 → 半音偏移（相对当前 low，即 C）。桌面可用物理键弹奏：
   a s d f g h j k = 白键 C D E F G A B C'，w e t y u = 黑键 C# D# F# G# A# */
const KEYMAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
};

function Keyboard({
  channel,
  octaveShift,
  recordArmed,
  onRecorded,
}: {
  channel: Channel;
  octaveShift: number;
  recordArmed: boolean;
  onRecorded: (msg: ReactNode) => void;
}) {
  const low = 48 + octaveShift * 12;
  const pressed = useRef<Map<number, HeldNote>>(new Map());
  const [active, setActive] = useState<Set<number>>(new Set());
  const t = useT();

  /* 切通道/八度后旧按住音符一律释放，避免悬空发声 */
  useEffect(() => {
    for (const m of pressed.current.keys()) engine.noteOff(channel.id, m);
    pressed.current.clear();
    setActive(new Set());
  }, [channel.id, octaveShift]);

  /* 桌面物理键盘弹奏：keydown/keyup 映射到当前八度的键。
     ref 指向最新 press/release/low（在下方 press/release 定义后赋值），监听只绑一次。 */
  const pressRef = useRef<((m: number) => void) | null>(null);
  const releaseRef = useRef<((m: number) => void) | null>(null);
  const lowRef = useRef(low);
  lowRef.current = low;
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping()) return;
      const off = KEYMAP[e.key.toLowerCase()];
      if (off === undefined) return;
      e.preventDefault();
      pressRef.current?.(lowRef.current + off);
    };
    const up = (e: KeyboardEvent) => {
      const off = KEYMAP[e.key.toLowerCase()];
      if (off === undefined) return;
      releaseRef.current?.(lowRef.current + off);
    };
    const blur = () => {
      for (const m of [...pressed.current.keys()]) releaseRef.current?.(m);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const press = (midi: number) => {
    if (pressed.current.has(midi)) return;
    const proj = useProjectStore.getState();
    const pat = proj.patterns.find((p) => p.id === proj.currentPatternId);
    let step: number | null = null;
    let stepSeconds = 0.125;
    const live = engine.getLivePosition();
    if (
      recordArmed &&
      live &&
      pat &&
      useUiStore.getState().playMode === 'pattern'
    ) {
      const patternSteps = pat.bars * 16;
      step = ((Math.round(live.stepFloat) % patternSteps) + patternSteps) % patternSteps;
      stepSeconds = live.stepSeconds;
    }
    pressed.current.set(midi, { t0: performance.now(), step, stepSeconds });
    setActive((s) => new Set(s).add(midi));
    void engine.noteOn(channel.id, midi, 100);
  };

  const release = (midi: number) => {
    const rec = pressed.current.get(midi);
    pressed.current.delete(midi);
    setActive((s) => {
      const n = new Set(s);
      n.delete(midi);
      return n;
    });
    engine.noteOff(channel.id, midi);
    if (rec?.step === null || rec?.step === undefined) return;

    const proj = useProjectStore.getState();
    const pat = proj.patterns.find((p) => p.id === proj.currentPatternId);
    if (!pat) return;
    const patternSteps = pat.bars * 16;
    const holdSec = (performance.now() - rec.t0) / 1000;
    const lengthSteps = Math.max(
      1,
      Math.min(patternSteps - rec.step, Math.round(holdSec / rec.stepSeconds)),
    );
    proj.addNote({
      channelId: channel.id,
      pitch: midi,
      startStep: rec.step,
      lengthSteps,
      velocity: 100,
    });
    onRecorded(
      <>
        <Mic className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />
        <span>
          {t.liveKeys.recorded(
            Math.floor(rec.step / 16) + 1,
            (rec.step % 16) + 1,
            noteName(midi),
            lengthSteps,
          )}
        </span>
      </>,
    );
  };

  /* 让窗口级键盘监听始终调用最新的 press/release */
  pressRef.current = press;
  releaseRef.current = release;

  const whites: number[] = [];
  for (let m = low; m < low + KEY_COUNT; m++) if (!isBlackKey(m)) whites.push(m);
  const numWhite = whites.length;

  const keyHandlers = (m: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      press(m);
    },
    onPointerUp: (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      release(m);
    },
    onPointerCancel: () => release(m),
  });

  return (
    <div className="relative flex h-36 w-full touch-none select-none sm:h-44 md:h-52">
      {whites.map((m) => (
        <button
          key={m}
          type="button"
          aria-label={noteName(m)}
          {...keyHandlers(m)}
          className="relative h-full flex-1 rounded-b-lg border-2 border-ink border-t-0 bg-white transition-colors"
          style={
            active.has(m)
              ? { background: channel.color, boxShadow: `inset 0 -10px 18px ${channel.color}66` }
              : undefined
          }
        >
          {m % 12 === 0 && (
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-black text-ink/40">
              {noteName(m)}
            </span>
          )}
        </button>
      ))}
      {Array.from({ length: KEY_COUNT - 1 }).map((_, i) => {
        const m = low + i + 1;
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
            {...keyHandlers(m)}
            className="absolute top-0 z-10 h-[58%] rounded-b-lg border-2 border-ink bg-ink transition-transform active:translate-y-0.5"
            style={{
              left: `${leftPct}%`,
              width: `${wPct}%`,
              transform: 'translateX(-50%)',
              boxShadow: active.has(m) ? `0 0 12px ${channel.color}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/* 循环节位置指示点 */
function StepDots({ color }: { color: string }) {
  const isPlaying = useUiStore((s) => s.isPlaying);
  const playMode = useUiStore((s) => s.playMode);
  const currentStep = useUiStore((s) => s.currentStep);
  const steps = useProjectStore((s) => {
    const pat = s.patterns.find((p) => p.id === s.currentPatternId);
    return pat ? pat.bars * 16 : 16;
  });

  const lit = isPlaying && playMode === 'pattern' ? currentStep % steps : -1;
  return (
    <div
      className="grid gap-x-1 gap-y-1"
      style={{ gridTemplateColumns: `repeat(${Math.min(steps, 64)}, minmax(0, 1fr))` }}
      aria-hidden
    >
      {Array.from({ length: steps }, (_, i) => (
        <span
          key={i}
          className="h-2 rounded-full border transition-all duration-75"
          style={{
            borderColor: i % 4 === 0 ? '#17171C' : '#17171C33',
            background: i === lit ? color : '#E7E6EE',
            boxShadow: i === lit ? `0 0 6px ${color}` : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function LiveKeys() {
  const channels = useProjectStore((s) => s.channels);
  const setSynth = useProjectStore((s) => s.setChannelSynthParams);
  const isPlaying = useUiStore((s) => s.isPlaying);
  const playMode = useUiStore((s) => s.playMode);
  const selId = useUiStore((s) => s.selectedChannelId);
  const selectChannel = useUiStore((s) => s.selectChannel);
  const synthChannels = channels.filter((c) => c.kind === 'synth');
  const selected: Channel | undefined =
    synthChannels.find((c) => c.id === selId) ?? synthChannels[0];

  const [octaveShift, setOctaveShift] = useState(0);
  const [recordArmed, setRecordArmed] = useState(true);
  const [lastMsg, setLastMsg] = useState<ReactNode>(null);
  const t = useT();

  if (!selected) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm font-semibold text-fg-muted">
        {t.liveKeys.emptyChannels}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 音色通道选择 */}
      <div className="flex items-center gap-2 border-b-2 border-ink/10 bg-bg-warm/60 px-3 py-2 md:px-4">
        <span className="label-caps hidden shrink-0 sm:inline">{t.liveKeys.preset}</span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1">
          {synthChannels.map((c) => {
            const on = c.id === selected.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => selectChannel(c.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-ink px-2.5 py-1 text-xs font-extrabold transition-all select-none ${
                  on ? '' : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
                }`}
                style={
                  on
                    ? {
                        background: c.color,
                        boxShadow: `1.5px 1.5px 0 #17171C, 0 0 8px ${c.color}90`,
                      }
                    : undefined
                }
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    background: on ? '#17171C' : c.color,
                    boxShadow: on ? undefined : `0 0 5px ${c.color}`,
                  }}
                />
                {c.name}
              </button>
            );
          })}
        </div>
        {/* 八度移调 */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={t.liveKeys.octaveDown}
            disabled={octaveShift <= -2}
            onClick={() => setOctaveShift((v) => v - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink bg-card text-lg font-black leading-none shadow-hard-sm transition-all hover:-translate-y-0.5 disabled:opacity-30"
          >
            −
          </button>
          <span className="w-14 text-center text-xs font-extrabold text-ink tabular-nums">
            {octaveShift >= 0 ? `+${octaveShift}` : octaveShift} oct
          </span>
          <button
            type="button"
            aria-label={t.liveKeys.octaveUp}
            disabled={octaveShift >= 2}
            onClick={() => setOctaveShift((v) => v + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink bg-card text-lg font-black leading-none shadow-hard-sm transition-all hover:-translate-y-0.5 disabled:opacity-30"
          >
            +
          </button>
        </div>
        {/* 录音开关 */}
        <motion.button
          type="button"
          onClick={() => setRecordArmed((v) => !v)}
          whileTap={{ scale: 0.92 }}
          aria-label={recordArmed ? t.liveKeys.recordOff : t.liveKeys.recordOn}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-ink px-2.5 py-1.5 text-xs font-extrabold transition-all select-none ${
            recordArmed ? 'bg-neon-pink' : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
          }`}
          style={
            recordArmed
              ? { boxShadow: '1.5px 1.5px 0 #17171C, 0 0 10px rgba(255,61,190,0.65)' }
              : undefined
          }
        >
          {recordArmed ? <Mic className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          {recordArmed ? t.liveKeys.recording : t.liveKeys.playOnly}
        </motion.button>
      </div>

      {/* 预设快切（点击直接套用到当前通道） */}
      <div className="flex items-center gap-2 border-b-2 border-ink/10 bg-bg-warm/40 px-3 py-1.5 md:px-4">
        <Music2 className="h-4 w-4 shrink-0 text-ink/45" strokeWidth={2.4} />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1">
          {SYNTH_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.blurb}
              onClick={() => setSynth(selected.id, { ...p.params })}
              className="shrink-0 cursor-pointer rounded-full border-2 border-ink bg-card px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-ink shadow-hard-sm transition-all hover:-translate-y-0.5"
            >
              <span
                className="mr-1 inline-block h-2 w-2 rounded-full"
                style={{
                  background:
                    PRESET_COLORS[p.category] ?? '#A8A8B2',
                }}
              />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* 状态与循环位置 */}
      <div className="flex flex-col gap-2 px-3 py-2.5 md:px-4">
        <StepDots color={selected.color} />
        <p className="flex min-h-5 flex-wrap items-center gap-x-1 text-xs font-semibold text-fg-muted">
          {lastMsg ??
            (isPlaying
              ? playMode !== 'pattern'
                ? t.liveKeys.songNoOverdub
                : recordArmed ? (
                  <>
                    <Mic className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />
                    <span>{t.liveKeys.overdub}</span>
                  </>
                )
                : t.liveKeys.playOnlyMsg
              : (
                <>
                  <span>{t.liveKeys.pressSpace}</span>
                  <Play className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} />
                  <span>{t.liveKeys.startLoop}</span>
                </>
              ))}
        </p>
      </div>

      {/* 键盘 */}
      <div className="mt-auto border-t-2 border-ink bg-bg-warm/60 p-3">
        <Keyboard
          channel={selected}
          octaveShift={octaveShift}
          recordArmed={recordArmed}
          onRecorded={setLastMsg}
        />
      </div>
    </div>
  );
}
