/**
 * Files（键 8）：工程文件与音乐文件管理
 * · 导入 / 导出工程 JSON（完整还原 BPM / Pattern / 音符 / 混音 / 编排）
 * · 新建空白工程
 * · 导出音乐文件：Tone.Offline 离线渲染当前 Pattern（可重复 1-4 遍）或 Song 整曲 → WAV 下载
 *   分「调度 / 渲染 / 编码」三阶段上报进度，调度与编码均分块让出主线程（长工程不冻结页面）
 * · Pattern 的新增 / 重命名 / 长度 / 复制 / 清空 / 删除统一走 PatternManagerSheet 浮层
 *   （顶栏与 Channel Rack 均有「管理 Pattern」入口）
 */
import { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileAudio,
  FileJson,
  FileUp,
  Loader2,
  Plus,
} from 'lucide-react';
import { engine } from '../../audio/engine';
import {
  estimateRenderSeconds,
  renderProject,
  type RenderProgress,
} from '../../audio/offlineRender';
import { encodeWav, downloadBlob } from '../../audio/wavEncoder';
import { getProjectSnapshot, useProjectStore } from '../../stores/projectStore';
import { useT } from '../../i18n/ui';
import { exportProjectToFile, readProjectFile } from '../../utils/projectIO';

type MsgKind = 'ok' | 'err';

interface Msg {
  kind: MsgKind;
  text: string;
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function Card({
  title,
  desc,
  icon,
  color,
  children,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-sandwich flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-card text-ink shadow-hard-sm"
          style={{ boxShadow: `1.5px 1.5px 0 #17171C, 0 0 8px ${color}66` }}
        >
          {icon}
        </span>
        <div className="flex flex-col">
          <h3 className="text-sm leading-tight font-extrabold text-ink">{title}</h3>
          <span className="label-caps">{desc}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

const actionBtn =
  'flex items-center justify-center gap-2 rounded-xl border-2 border-ink bg-card px-3.5 py-2.5 text-sm font-extrabold text-ink shadow-hard-sm transition-all hover:-translate-y-0.5 hover:shadow-hard active:translate-y-0 active:shadow-hard-sm disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-hard-sm cursor-pointer select-none';

function MsgLine({ msg }: { msg: Msg | null }) {
  if (!msg) return null;
  return (
    <p
      className={`text-xs font-bold ${
        msg.kind === 'err' ? 'text-neon-pink' : 'text-ink/70'
      }`}
    >
      {msg.text}
    </p>
  );
}

/* ============================================================
 * 导出进度条：调度 / 渲染 / 编码 三阶段映射到一条总进度
 * 渲染阶段（浏览器原生 OfflineAudioContext）无中间回调 → 走不确定态滑动条
 * ============================================================ */

/** 各阶段在总进度里的起点与占比 */
const PHASE_RANGE: Record<RenderProgress['phase'], [number, number]> = {
  schedule: [0, 0.3],
  render: [0.3, 0.75],
  encode: [0.75, 0.25],
};

function ExportProgress({ prog, elapsed }: { prog: RenderProgress; elapsed: number }) {
  const t = useT();
  const phaseText =
    prog.phase === 'schedule'
      ? t.files.schedule
      : prog.phase === 'render'
        ? t.files.render
        : t.files.encode;
  const [base, span] = PHASE_RANGE[prog.phase];
  const overall = Math.round(Math.min(1, base + span * Math.min(1, Math.max(0, prog.value))) * 100);
  const indeterminate = prog.phase === 'render';
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-caps">
          {phaseText}
          {indeterminate && <span className="tabular-nums"> · {elapsed.toFixed(0)}s</span>}
        </span>
        <span className="text-xs font-black text-ink tabular-nums">
          {indeterminate ? '···' : `${overall}%`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={overall}
        aria-label={t.files.progressAria}
        className="relative h-3 overflow-hidden rounded-full border-2 border-ink bg-panel"
      >
        {indeterminate ? (
          <span className="progress-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-neon-pink shadow-glow-pink" />
        ) : (
          <span
            className="absolute inset-y-0 left-0 rounded-r-full bg-neon-cyan shadow-glow-cyan transition-[width] duration-150 ease-out"
            style={{ width: `${Math.max(5, overall)}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function Files() {
  const fileRef = useRef<HTMLInputElement>(null);
  const patterns = useProjectStore((s) => s.patterns);
  const importProject = useProjectStore((s) => s.importProject);
  const newProject = useProjectStore((s) => s.newProject);

  const [importMsg, setImportMsg] = useState<Msg | null>(null);
  const [audioTarget, setAudioTarget] = useState<'pattern' | 'song'>('pattern');
  const [loops, setLoops] = useState<1 | 2 | 4>(2);
  const [rendering, setRendering] = useState(false);
  const [audioMsg, setAudioMsg] = useState<Msg | null>(null);
  const [prog, setProg] = useState<RenderProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const t = useT();

  const bpm = useProjectStore((s) => s.bpm);
  const song = useProjectStore((s) => s.song);
  const currentPatternId = useProjectStore((s) => s.currentPatternId);
  const channelCount = useProjectStore((s) => s.channels.length);

  const estSeconds = useMemo(
    () =>
      estimateRenderSeconds(
        { bpm, patterns, song },
        audioTarget === 'pattern'
          ? { kind: 'pattern', patternId: currentPatternId, loops }
          : { kind: 'song' },
      ),
    [bpm, patterns, song, audioTarget, currentPatternId, loops],
  );

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImportMsg(null);
    try {
      const data = await readProjectFile(file);
      engine.stop();
      const ok = importProject(data);
      setImportMsg(
        ok
          ? { kind: 'ok', text: t.files.imported(file.name) }
          : { kind: 'err', text: t.files.invalidProject },
      );
    } catch (err) {
      setImportMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : t.files.importFail,
      });
    }
  };

  const onExportProject = () => {
    exportProjectToFile(getProjectSnapshot());
    setImportMsg({ kind: 'ok', text: t.files.jsonDownloading });
  };

  const onNewProject = () => {
    if (!window.confirm(t.files.newConfirm)) return;
    engine.stop();
    newProject();
    setImportMsg({ kind: 'ok', text: t.files.newDone });
  };

  const onExportWav = async () => {
    if (rendering) return;
    setRendering(true);
    setAudioMsg(null);
    setElapsed(0);
    setProg({ phase: 'schedule', value: 0 });
    const t0 = performance.now();
    const ticker = setInterval(() => setElapsed((performance.now() - t0) / 1000), 200);
    try {
      await new Promise((r) => setTimeout(r, 32)); // 先让进度条画出来
      /* 离线渲染与在线走带抢同一条音频/CPU 路径，导出前先停播（导入工程同规则） */
      engine.stop();
      const proj = getProjectSnapshot();
      const target =
        audioTarget === 'pattern'
          ? ({ kind: 'pattern', patternId: proj.currentPatternId, loops } as const)
          : ({ kind: 'song' } as const);
      const buffer = await renderProject(proj, target, setProg);
      const blob = await encodeWav(buffer, (value) => setProg({ phase: 'encode', value }));
      downloadBlob(blob, `neon-daw-${audioTarget}-${stamp()}.wav`);
      setAudioMsg({
        kind: 'ok',
        text: t.files.exportOk(
          buffer.duration.toFixed(1),
          (blob.size / 1048576).toFixed(1),
          ((performance.now() - t0) / 1000).toFixed(1),
        ),
      });
    } catch (err) {
      setAudioMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : t.files.renderFail,
      });
    } finally {
      clearInterval(ticker);
      setProg(null);
      setRendering(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
      <div className="grid gap-4 md:grid-cols-3">
        {/* ---------------- 导入工程 ---------------- */}
        <Card
          title={t.files.importTitle}
          desc={t.files.importDesc}
          icon={<FileUp className="h-5 w-5" strokeWidth={2.4} />}
          color="#4D9FFF"
        >
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
          <button type="button" className={actionBtn} onClick={() => fileRef.current?.click()}>
            <FileJson className="h-4 w-4" strokeWidth={2.6} />
            {t.files.pickJson}
          </button>
          <button type="button" className={actionBtn} onClick={onNewProject}>
            <Plus className="h-4 w-4" strokeWidth={2.6} />
            {t.files.newProject}
          </button>
          <MsgLine msg={importMsg} />
        </Card>

        {/* ---------------- 导出工程 ---------------- */}
        <Card
          title={t.files.exportTitle}
          desc={t.files.exportDesc}
          icon={<FileJson className="h-5 w-5" strokeWidth={2.4} />}
          color="#39FF88"
        >
          <p className="text-xs font-semibold text-fg-muted">
            {t.files.projSummary(patterns.length, channelCount, bpm)}
          </p>
          <button type="button" className={actionBtn} onClick={onExportProject}>
            <Download className="h-4 w-4" strokeWidth={2.6} />
            {t.files.exportProjectBtn}
          </button>
          <p className="text-[11px] font-semibold text-fg-faint">
            {t.files.jsonHint}
          </p>
        </Card>

        {/* ---------------- 导出音乐 ---------------- */}
        <Card
          title={t.files.audioTitle}
          desc={t.files.audioDesc}
          icon={<FileAudio className="h-5 w-5" strokeWidth={2.4} />}
          color="#FF3DBE"
        >
          <div className="flex gap-2" role="radiogroup" aria-label={t.files.targetGroup}>
            {(
              [
                ['pattern', t.files.targetPattern],
                ['song', t.files.targetSong],
              ] as const
            ).map(([v, label]) => {
              const on = audioTarget === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setAudioTarget(v)}
                  className={`flex-1 cursor-pointer rounded-lg border-2 border-ink px-2 py-1.5 text-xs font-extrabold transition-all select-none ${
                    on
                      ? 'bg-neon-cyan shadow-[1.5px_1.5px_0_#17171C,0_0_8px_rgba(0,229,255,0.5)]'
                      : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {audioTarget === 'pattern' && (
            <div className="flex items-center gap-2">
              <span className="label-caps">{t.files.repeat}</span>
              <div className="flex gap-1.5">
                {([1, 2, 4] as const).map((n) => {
                  const on = loops === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setLoops(n)}
                      className={`h-8 w-10 cursor-pointer rounded-lg border-2 border-ink text-xs font-extrabold transition-all select-none ${
                        on
                          ? 'bg-neon-pink shadow-[1.5px_1.5px_0_#17171C,0_0_8px_rgba(255,61,190,0.5)]'
                          : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
                      }`}
                    >
                      ×{n}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-xs font-semibold text-fg-muted tabular-nums">
            {t.files.estTime(estSeconds.toFixed(1))}
          </p>

          {prog && <ExportProgress prog={prog} elapsed={elapsed} />}

          <button
            type="button"
            className={`${actionBtn} relative`}
            disabled={rendering}
            onClick={() => void onExportWav()}
          >
            {rendering ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.6} />
            ) : (
              <FileAudio className="h-4 w-4" strokeWidth={2.6} />
            )}
            {rendering ? t.files.exporting : t.files.exportWav}
          </button>
          <MsgLine msg={audioMsg} />
        </Card>
      </div>
    </div>
  );
}
