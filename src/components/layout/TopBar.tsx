/**
 * 顶栏
 * · 桌面（md+）：走带全套 + BPM + Pattern 胶囊 + 模式 + 文件操作 + 主音量电平 + 语言切换
 * · 手机：单行 56px —— 光盘锚点 / 播放停止 / BPM / 当前 Pattern 贴纸 / 溢出菜单，
 *   其余控制（循环、节拍器、模式、撤销重做、主音量、语言）收进底部浮层抽屉
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Download,
  ListMusic,
  MoreHorizontal,
  Play,
  Redo2,
  Repeat,
  RotateCcw,
  Square,
  Timer,
  Undo2,
  Upload,
} from 'lucide-react';
import { engine } from '../../audio/engine';
import { getProjectSnapshot, useProjectStore } from '../../stores/projectStore';
import { useHistoryStore } from '../../stores/historyStore';
import { useUiStore } from '../../stores/uiStore';
import { useT } from '../../i18n/ui';
import { exportProjectToFile, readProjectFile } from '../../utils/projectIO';
import { DiscLogo } from './SideNav';
import { EdgeScroll } from '../ui/EdgeScroll';
import { ExpandStrip } from '../ui/ExpandStrip';
import { IconButton } from '../ui/IconButton';
import { Knob } from '../ui/Knob';
import { LangToggle } from '../ui/LangToggle';
import { LevelMeter } from '../ui/LevelMeter';
import { OverlaySheet } from '../ui/OverlaySheet';
import { Tooltip } from '../ui/Tooltip';

/* ============================================================
 * 走带控制
 * ============================================================ */

function PlayStopButtons({ single = false }: { single?: boolean }) {
  const isPlaying = useUiStore((s) => s.isPlaying);
  const t = useT();

  return (
    <div className="flex items-center gap-2">
      <IconButton
        label={isPlaying ? t.topbar.stop : t.topbar.play}
        size="lg"
        active={isPlaying}
        activeColor="#00E5FF"
        onClick={() => void engine.togglePlay()}
      >
        {isPlaying ? <Square /> : <Play />}
      </IconButton>
      {!single && (
        <IconButton label={t.topbar.stopRestart} size="lg" onClick={() => engine.stop()}>
          <Square />
        </IconButton>
      )}
    </div>
  );
}

function LoopMetronomeButtons() {
  const loopOn = useUiStore((s) => s.loopOn);
  const loopBars = useUiStore((s) => s.loopBars);
  const setLoopOn = useUiStore((s) => s.setLoopOn);
  const setLoopBars = useUiStore((s) => s.setLoopBars);
  const playMode = useUiStore((s) => s.playMode);
  const metronomeOn = useUiStore((s) => s.metronomeOn);
  const toggleMetronome = useUiStore((s) => s.toggleMetronome);
  const t = useT();
  const patBars = useProjectStore(
    (s) => s.patterns.find((p) => p.id === s.currentPatternId)?.bars ?? 1,
  );

  /** 循环按钮：点击循环 关 → 1 → 2 → 4 → 关 */
  const cycleLoop = () => {
    if (!loopOn) {
      setLoopOn(true);
      setLoopBars(1);
    } else if (loopBars === 1) {
      setLoopBars(2);
    } else if (loopBars === 2) {
      setLoopBars(4);
    } else {
      setLoopOn(false);
    }
  };

  /* 引擎里 Pattern 模式循环区间 = Pattern 长度 × 选择器，Song 模式整曲循环 */
  const loopLabel = !loopOn
    ? t.topbar.loopOff
    : playMode === 'song'
      ? t.topbar.loopSong
      : t.topbar.loopPattern(loopBars, patBars * loopBars);

  return (
    <>
      <IconButton label={loopLabel} active={loopOn} activeColor="#FF3DBE" onClick={cycleLoop}>
        <Repeat />
      </IconButton>
      <IconButton label={t.topbar.metronome} active={metronomeOn} activeColor="#FFE600" onClick={toggleMetronome}>
        <Timer />
      </IconButton>
    </>
  );
}

/** 循环长度直接选择（溢出抽屉内，触屏不必反复点 Repeat 循环切换） */
function LoopBarsPicker() {
  const loopOn = useUiStore((s) => s.loopOn);
  const loopBars = useUiStore((s) => s.loopBars);
  const setLoopOn = useUiStore((s) => s.setLoopOn);
  const setLoopBars = useUiStore((s) => s.setLoopBars);
  const t = useT();

  const pick = (bars: 1 | 2 | 4) => {
    setLoopOn(true);
    setLoopBars(bars);
  };

  const cell = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={`h-9 min-w-9 cursor-pointer rounded-lg border-2 border-ink px-2 text-xs font-extrabold text-ink transition-all select-none ${
        on ? 'bg-neon-pink' : 'bg-card shadow-hard-sm active:-translate-y-0.5'
      }`}
      style={on ? { boxShadow: '1.5px 1.5px 0 #17171C, 0 0 8px rgba(255,61,190,0.6)' } : undefined}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1.5">
      {cell(t.common.off, !loopOn, () => setLoopOn(false))}
      {cell('1', loopOn && loopBars === 1, () => pick(1))}
      {cell('2', loopOn && loopBars === 2, () => pick(2))}
      {cell('4', loopOn && loopBars === 4, () => pick(4))}
    </div>
  );
}

/* ============================================================
 * BPM：tabular-nums 显示，拖动 / 滚轮编辑（60-200，播放中实时生效）
 * ============================================================ */

function BpmControl() {
  const bpm = useProjectStore((s) => s.bpm);
  const setBpm = useProjectStore((s) => s.setBpm);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);
  const t = useT();

  /* 滚轮编辑（Shift ×10），需非 passive 才能 preventDefault */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dir = e.deltaY < 0 ? 1 : -1;
      setBpm(bpm + dir * (e.shiftKey ? 10 : 1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [bpm, setBpm]);

  return (
    <Tooltip content={t.topbar.bpmTip} side="bottom" className="shrink-0">
      <div
        ref={rootRef}
        role="slider"
        aria-label="BPM"
        aria-valuemin={60}
        aria-valuemax={200}
        aria-valuenow={bpm}
        tabIndex={0}
        className="sticker-sandwich flex cursor-ns-resize items-baseline gap-1.5 px-2.5 py-1.5 select-none touch-none md:px-3"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dragRef.current = { startY: e.clientY, startValue: bpm };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag) return;
          const dy = drag.startY - e.clientY;
          setBpm(drag.startValue + dy * (140 / 150)); // 150px 拖满量程
        }}
        onPointerUp={(e) => {
          dragRef.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') setBpm(bpm + 1);
          else if (e.key === 'ArrowDown') setBpm(bpm - 1);
        }}
      >
        <span className="text-lg leading-none font-extrabold text-ink tabular-nums md:text-xl">
          {bpm}
        </span>
        <span className="label-caps">BPM</span>
      </div>
    </Tooltip>
  );
}

/* ============================================================
 * Pattern 选择器（桌面横向滚动 · 边界渐隐；手机收成按钮，点开铺平再选）
 * ============================================================ */

function PatternSelect() {
  const patterns = useProjectStore((s) => s.patterns);
  const currentPatternId = useProjectStore((s) => s.currentPatternId);
  const setCurrentPatternId = useProjectStore((s) => s.setCurrentPatternId);
  const setPatternManagerOpen = useUiStore((s) => s.setPatternManagerOpen);
  const t = useT();
  const openManager = () => setPatternManagerOpen(true);
  /* 手机触发按钮空间窄，用 P{n} 短标；全名在展开面板 / 管理面板里看 */
  const currentIdx = patterns.findIndex((p) => p.id === currentPatternId);

  const pills = patterns.map((p) => {
    const active = p.id === currentPatternId;
    return (
      <button
        key={p.id}
        type="button"
        aria-pressed={active}
        onClick={() => setCurrentPatternId(p.id)}
        className={`shrink-0 cursor-pointer rounded-full border-2 border-ink px-3 py-1 text-xs font-bold whitespace-nowrap text-ink transition-all ${
          active
            ? 'bg-neon-cyan shadow-[2px_2px_0_#17171C,0_0_10px_rgba(0,229,255,0.6)]'
            : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
        }`}
      >
        {p.name}
      </button>
    );
  });

  return (
    /* 整行只有一个可变宽度项（min-w-0 flex-1），其余控件 shrink-0，不会与相邻按钮重叠 */
    <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-none">
      <span className="label-caps hidden md:block">{t.topbar.pattern}</span>
      <div className="flex min-w-0 items-center gap-1.5">
        {/* 手机：触发按钮显示当前 Pattern，点一下悬挂铺平面板 */}
        <ExpandStrip
          dropdown
          summary={`P${currentIdx + 1}`}
          className="flex-1 md:hidden"
          listClassName="gap-1.5"
        >
          {pills}
        </ExpandStrip>
        {/* 桌面：横向滚动 + 边界渐隐 */}
        <EdgeScroll
          className="hidden flex-1 md:block md:max-w-[260px] md:flex-none"
          listClassName="flex items-center gap-1.5"
        >
          {pills}
        </EdgeScroll>
        <IconButton label={t.topbar.manage} onClick={openManager}>
          <ListMusic />
        </IconButton>
      </div>
    </div>
  );
}

/* ============================================================
 * 主音量 + Master 电平表（engine Analyser 每帧驱动）
 * ============================================================ */

function MasterMeter() {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last >= 33) {
        // ~30fps，LevelMeter 自带 CSS 平滑
        last = t;
        setLevel(engine.getMasterLevel());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <LevelMeter value={level} orientation="horizontal" length={96} thickness={10} />;
}

function MasterKnob() {
  const volume = useProjectStore(
    (s) => s.mixerTracks.find((t) => t.id === 'track-master')?.volume ?? 0.85,
  );
  const setMasterVolume = useProjectStore((s) => s.setMasterVolume);

  return (
    <Knob
      value={volume}
      min={0}
      max={1}
      step={0.01}
      defaultValue={0.85}
      onChange={setMasterVolume}
      color="#00E5FF"
      size={44}
      format={(v) => `${(20 * Math.log10(Math.max(v, 0.001))).toFixed(0)} dB`}
    />
  );
}

function MasterSection() {
  const t = useT();
  return (
    <Tooltip content={t.topbar.master} side="bottom">
      <div className="flex items-center gap-3">
        <MasterKnob />
        <div className="flex flex-col items-start gap-1">
          <span className="label-caps">{t.topbar.level}</span>
          <MasterMeter />
        </div>
      </div>
    </Tooltip>
  );
}

/* ============================================================
 * Pattern / Song 模式切换（顶栏）
 * ============================================================ */

function PlayModeToggle() {
  const playMode = useUiStore((s) => s.playMode);
  const setPlayMode = useUiStore((s) => s.setPlayMode);
  const t = useT();

  return (
    <div className="flex flex-col gap-1">
      <span className="label-caps">{t.topbar.mode}</span>
      <button
        type="button"
        onClick={() => setPlayMode(playMode === 'song' ? 'pattern' : 'song')}
        className={`flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-xs font-extrabold whitespace-nowrap text-ink transition-all select-none ${
          playMode === 'song'
            ? 'bg-neon-green shadow-[2px_2px_0_#17171C,0_0_10px_rgba(57,255,136,0.6)]'
            : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
        }`}
      >
        <ListMusic className="h-3.5 w-3.5" strokeWidth={2.6} />
        {playMode === 'song' ? t.topbar.modeSong : t.topbar.modePattern}
      </button>
    </div>
  );
}

/* ============================================================
 * 撤销 / 重做
 * ============================================================ */

function HistoryButtons() {
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const t = useT();

  return (
    <>
      <IconButton
        label={canUndo ? t.topbar.undo : t.topbar.undoNone}
        active={canUndo}
        activeColor="#FFE600"
        onClick={() => undo()}
      >
        <Undo2 />
      </IconButton>
      <IconButton
        label={canRedo ? t.topbar.redo : t.topbar.redoNone}
        active={canRedo}
        activeColor="#FFE600"
        onClick={() => redo()}
      >
        <Redo2 />
      </IconButton>
      <ResetButton />
    </>
  );
}

/* ============================================================
 * 重置当前歌曲为空白工程（有内容时先确认一次）
 * ============================================================ */

function ResetButton() {
  const newProject = useProjectStore((s) => s.newProject);
  const t = useT();
  return (
    <IconButton
      label={t.topbar.reset}
      activeColor="#FF3DBE"
      onClick={() => {
        if (!window.confirm(t.topbar.resetConfirm)) return;
        engine.stop();
        newProject();
      }}
    >
      <RotateCcw />
    </IconButton>
  );
}

/* ============================================================
 * 文件操作：导出 / 导入工程（桌面端；移动端收纳进键 8 Files）
 * ============================================================ */

function FileActions() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importProject = useProjectStore((s) => s.importProject);
  const t = useT();

  const onExport = () => {
    exportProjectToFile(getProjectSnapshot());
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    try {
      const data = await readProjectFile(file);
      const ok = importProject(data);
      if (!ok) setImportError(t.topbar.invalid);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t.topbar.importFail);
    }
  };

  return (
    <div className="hidden items-center gap-2 md:flex">
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void onImportFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <HistoryButtons />
      <div className="h-9 w-0.5 rounded-full bg-ink/10" />
      <IconButton label={t.topbar.exportProject} onClick={onExport}>
        <Download />
      </IconButton>
      <IconButton label={t.topbar.importProject} onClick={() => fileRef.current?.click()}>
        <Upload />
      </IconButton>
      {importError && (
        <span className="text-xs font-bold text-neon-pink">{importError}</span>
      )}
    </div>
  );
}

/* ============================================================
 * 溢出抽屉分组贴纸
 * ============================================================ */

function SheetCell({
  label,
  hint,
  wide = false,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border-2 border-ink bg-card p-2.5 shadow-hard-sm ${
        wide ? 'col-span-2' : ''
      }`}
    >
      <span className="label-caps">{label}</span>
      {children}
      {hint && <span className="text-[10px] font-semibold text-fg-muted">{hint}</span>}
    </div>
  );
}

function OverflowSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const playMode = useUiStore((s) => s.playMode);
  const setPlayMode = useUiStore((s) => s.setPlayMode);
  const metronomeOn = useUiStore((s) => s.metronomeOn);
  const toggleMetronome = useUiStore((s) => s.toggleMetronome);
  const t = useT();

  return (
    <OverlaySheet open={open} onClose={onClose} title={t.topbar.overflowTitle}>
      <div className="grid grid-cols-2 gap-2.5">
        <SheetCell label={t.topbar.loopRepeat} hint={t.topbar.loopRepeatHint} wide>
          <LoopBarsPicker />
        </SheetCell>
        <SheetCell label={t.topbar.metronome}>
          <IconButton
            label={metronomeOn ? t.topbar.metronomeTurnOff : t.topbar.metronomeTurnOn}
            active={metronomeOn}
            activeColor="#FFE600"
            onClick={toggleMetronome}
          >
            <Timer />
          </IconButton>
        </SheetCell>
        <SheetCell label={t.topbar.playMode}>
          <button
            type="button"
            onClick={() => setPlayMode(playMode === 'song' ? 'pattern' : 'song')}
            className={`flex h-10 items-center gap-1.5 rounded-lg border-2 border-ink px-2.5 text-xs font-extrabold text-ink transition-all select-none ${
              playMode === 'song' ? 'bg-neon-green' : 'bg-card shadow-hard-sm'
            }`}
            style={
              playMode === 'song'
                ? { boxShadow: '1.5px 1.5px 0 #17171C, 0 0 8px rgba(57,255,136,0.6)' }
                : undefined
            }
          >
            <ListMusic className="h-4 w-4" strokeWidth={2.6} />
            {playMode === 'song' ? t.topbar.songWhole : t.topbar.patternLoop}
          </button>
        </SheetCell>
        <SheetCell label={t.topbar.undoRedo}>
          <HistoryButtons />
        </SheetCell>
        <SheetCell label={t.topbar.stopRestart}>
          <IconButton label={t.topbar.stopRestart} onClick={() => engine.stop()}>
            <Square />
          </IconButton>
        </SheetCell>
        <SheetCell label={t.topbar.language}>
          <LangToggle block />
        </SheetCell>
        <SheetCell label={t.topbar.masterLevel} wide>
          <div className="flex items-center gap-3">
            <MasterKnob />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="label-caps">{t.topbar.level}</span>
              <MasterMeter />
            </div>
          </div>
        </SheetCell>
      </div>
    </OverlaySheet>
  );
}

/* ============================================================
 * 顶栏
 * ============================================================ */

export function TopBar() {
  const navOpen = useUiStore((s) => s.mobileNavOpen);
  const toggleMobileNav = useUiStore((s) => s.toggleMobileNav);
  const [moreOpen, setMoreOpen] = useState(false);
  const t = useT();

  return (
    <>
      <header className="z-10 flex h-14 shrink-0 items-center gap-2 border-b-2 border-ink bg-bg-warm px-3 md:h-auto md:flex-wrap md:items-center md:gap-x-5 md:gap-y-3 md:px-4 md:py-2">
        {/* 移动端：左上角光盘 Logo 即抽屉锚点，开合都用它（与桌面竖栏同源图标） */}
        <div className="shrink-0 md:hidden">
          <DiscLogo
            onClick={toggleMobileNav}
            label={navOpen ? t.nav.close : t.nav.open}
            tooltipSide="bottom"
          />
        </div>

        {/* 移动端仅保留播放/停止单键，其余走带进溢出抽屉 */}
        <div className="shrink-0 md:hidden">
          <PlayStopButtons single />
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <PlayStopButtons />
          <LoopMetronomeButtons />
        </div>

        <div className="hidden h-9 w-0.5 shrink-0 rounded-full bg-ink/10 md:block" />
        <BpmControl />
        <PatternSelect />
        <div className="hidden md:flex">
          <PlayModeToggle />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <FileActions />
          <div className="hidden md:flex">
            <MasterSection />
          </div>
          <div className="hidden md:flex">
            <LangToggle />
          </div>
          <IconButton
            label={t.topbar.more}
            className="md:hidden"
            active={moreOpen}
            activeColor="#A78BFA"
            onClick={() => setMoreOpen((v) => !v)}
          >
            <MoreHorizontal />
          </IconButton>
        </div>
      </header>

      <OverflowSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
