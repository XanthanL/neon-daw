/**
 * 合成器编辑面板：双振荡器（波形/八度/失谐/电平）+
 * 滤波器（类型/对数截止/共鸣/包络量）+ ADSR（四旋钮 + 实时包络曲线 SVG）+ 主音量。
 * 参数实时写入 channel.synthParams（engine 已订阅实时生效）。
 */
import { useCallback } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useT } from '../../i18n/ui';
import type { Channel, FilterType, SynthParams, Waveform } from '../../types/project';
import { Knob } from '../ui/Knob';

/* ============================================================
 * 波形选择贴纸按钮组（迷你 SVG 波形图标）
 * ============================================================ */

const WAVE_PATHS: Record<Waveform, string> = {
  sine: 'M2 10 C 5 2, 9 18, 12 10 S 19 2, 22 10',
  square: 'M2 15 L2 5 L9 5 L9 15 L16 15 L16 5 L22 5',
  sawtooth: 'M2 15 L9 5 L9 15 L16 5 L16 15 L22 5',
  triangle: 'M2 15 L7 5 L12 15 L17 5 L22 15',
};

const WAVE_LABELS: Record<Waveform, string> = {
  sine: 'SIN',
  square: 'SQR',
  sawtooth: 'SAW',
  triangle: 'TRI',
};

function WaveButtons({
  value,
  color,
  onChange,
}: {
  value: Waveform;
  color: string;
  onChange: (w: Waveform) => void;
}) {
  return (
    <div className="flex gap-1">
      {(Object.keys(WAVE_PATHS) as Waveform[]).map((w) => {
        const active = value === w;
        return (
          <button
            key={w}
            type="button"
            title={WAVE_LABELS[w]}
            aria-pressed={active}
            onClick={() => onChange(w)}
            className={`flex h-9 w-10 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-ink transition-all select-none ${
              active ? '-translate-y-0.5' : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
            }`}
            style={
              active
                ? { background: color, boxShadow: '1.5px 1.5px 0 #17171C, 0 0 8px ' + color + '90' }
                : undefined
            }
          >
            <svg viewBox="0 0 24 20" className="h-3.5 w-5" fill="none">
              <path
                d={WAVE_PATHS[w]}
                stroke="#17171C"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-[8px] font-black text-ink">{WAVE_LABELS[w]}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
 * 滤波器类型按钮组
 * ============================================================ */

const FILTER_TYPES: { value: FilterType; label: string }[] = [
  { value: 'lowpass', label: 'LP' },
  { value: 'highpass', label: 'HP' },
  { value: 'bandpass', label: 'BP' },
  { value: 'notch', label: 'NT' },
];

function FilterTypeButtons({
  value,
  color,
  onChange,
}: {
  value: FilterType;
  color: string;
  onChange: (t: FilterType) => void;
}) {
  return (
    <div className="flex gap-1">
      {FILTER_TYPES.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(t.value)}
            className={`h-8 w-10 cursor-pointer rounded-lg border-2 border-ink text-[10px] font-black text-ink transition-all select-none ${
              active ? '-translate-y-0.5' : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
            }`}
            style={
              active
                ? { background: color, boxShadow: '1.5px 1.5px 0 #17171C, 0 0 8px ' + color + '90' }
                : undefined
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
 * ADSR 包络曲线可视化（实时更新）
 * ============================================================ */

function EnvelopeCurve({
  a,
  d,
  s,
  r,
  color,
}: {
  a: number;
  d: number;
  s: number;
  r: number;
  color: string;
}) {
  const t = useT();
  const W = 224;
  const H = 84;
  const PAD = 6;
  const HOLD = 0.45; // sustain 保持段（秒，仅可视化比例）
  const total = a + d + HOLD + r;
  const x = (t: number) => PAD + (t / total) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - v) * (H - PAD * 2);
  const path = `M ${x(0).toFixed(1)} ${y(0).toFixed(1)} L ${x(a).toFixed(1)} ${y(1).toFixed(1)} L ${x(a + d).toFixed(1)} ${y(s).toFixed(1)} L ${x(a + d + HOLD).toFixed(1)} ${y(s).toFixed(1)} L ${x(total).toFixed(1)} ${y(0).toFixed(1)}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-lg border-2 border-ink bg-panel"
      aria-label={t.synth.adsr}
    >
      {/* 网格参考线 */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={PAD}
          x2={W - PAD}
          y1={y(g)}
          y2={y(g)}
          stroke="#17171C"
          strokeOpacity={0.08}
          strokeWidth={1.5}
        />
      ))}
      {/* 包络曲线（荧光通道色 + 辉光） */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
      {/* 峰值与 sustain 标记点 */}
      <circle cx={x(a)} cy={y(1)} r={2.6} fill="#17171C" />
      <circle cx={x(a + d + HOLD)} cy={y(s)} r={2.6} fill="#17171C" />
    </svg>
  );
}

/* ============================================================
 * 面板分区容器
 * ============================================================ */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl border-2 border-ink bg-card p-3"
      style={{ boxShadow: '2px 2px 0 #17171C' }}
    >
      <h4 className="label-caps mb-2.5">{title}</h4>
      {children}
    </section>
  );
}

/* ============================================================
 * 合成器面板
 * ============================================================ */

/** 截止频率对数映射：20Hz–20kHz（3 个十倍频） */
const CUT_MIN = 20;
const CUT_MAX = 20000;
const cutToPos = (f: number) =>
  Math.log(Math.max(f, CUT_MIN) / CUT_MIN) / Math.log(CUT_MAX / CUT_MIN);
const posToCut = (t: number) => CUT_MIN * (CUT_MAX / CUT_MIN) ** t;
const fmtCut = (f: number) =>
  f >= 1000 ? `${(f / 1000).toFixed(1)}kHz` : `${Math.round(f)}Hz`;

const fmtTime = (v: number) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`);

export function SynthPanel({ channel }: { channel: Channel }) {
  const setSynth = useProjectStore((s) => s.setChannelSynthParams);
  const set = useCallback(
    (patch: Partial<SynthParams>) => setSynth(channel.id, patch),
    [channel.id, setSynth],
  );
  const p = channel.synthParams!;
  const color = channel.color;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap content-start gap-3 overflow-y-auto pr-1">
      {/* ---------- OSC 1 ---------- */}
      <Section title="OSC 1">
        <div className="flex flex-col items-center gap-2.5">
          <WaveButtons
            value={p.osc1Waveform}
            color={color}
            onChange={(v) => set({ osc1Waveform: v })}
          />
          <div className="flex gap-2">
            <Knob
              value={p.osc1Octave}
              min={-2}
              max={2}
              step={1}
              defaultValue={0}
              onChange={(v) => set({ osc1Octave: v })}
              label="OCT"
              color={color}
              format={(v) => `${v > 0 ? '+' : ''}${v}`}
            />
            <Knob
              value={p.osc1Level}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.8}
              onChange={(v) => set({ osc1Level: v })}
              label="LEVEL"
              color={color}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
        </div>
      </Section>

      {/* ---------- OSC 2 ---------- */}
      <Section title="OSC 2">
        <div className="flex flex-col items-center gap-2.5">
          <WaveButtons
            value={p.osc2Waveform}
            color={color}
            onChange={(v) => set({ osc2Waveform: v })}
          />
          <div className="flex gap-2">
            <Knob
              value={p.osc2Octave}
              min={-2}
              max={2}
              step={1}
              defaultValue={0}
              onChange={(v) => set({ osc2Octave: v })}
              label="OCT"
              color={color}
              format={(v) => `${v > 0 ? '+' : ''}${v}`}
            />
            <Knob
              value={p.osc2Detune}
              min={-50}
              max={50}
              step={1}
              defaultValue={0}
              onChange={(v) => set({ osc2Detune: v })}
              label="DETUNE"
              color={color}
              format={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}¢`}
            />
            <Knob
              value={p.osc2Level}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.35}
              onChange={(v) => set({ osc2Level: v })}
              label="LEVEL"
              color={color}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
        </div>
      </Section>

      {/* ---------- FILTER ---------- */}
      <Section title="FILTER">
        <div className="flex flex-col items-center gap-2.5">
          <FilterTypeButtons
            value={p.filterType}
            color={color}
            onChange={(v) => set({ filterType: v })}
          />
          <div className="flex gap-2">
            {/* 对数映射截止（双击回挂载时值） */}
            <Knob
              value={cutToPos(p.filterCutoff)}
              min={0}
              max={1}
              step={0.002}
              onChange={(t) => set({ filterCutoff: posToCut(t) })}
              label="CUTOFF"
              color={color}
              format={() => fmtCut(p.filterCutoff)}
            />
            <Knob
              value={p.filterQ}
              min={0}
              max={20}
              step={0.1}
              defaultValue={1.2}
              onChange={(v) => set({ filterQ: v })}
              label="RESO"
              color={color}
              format={(v) => v.toFixed(1)}
            />
            <Knob
              value={p.filterEnvAmount}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.25}
              onChange={(v) => set({ filterEnvAmount: v })}
              label="ENV AMT"
              color={color}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
        </div>
      </Section>

      {/* ---------- ENVELOPE（ADSR + 可视化） ---------- */}
      <Section title="ENVELOPE · ADSR">
        <div className="flex flex-col gap-2.5">
          <EnvelopeCurve
            a={p.attack}
            d={p.decay}
            s={p.sustain}
            r={p.release}
            color={color}
          />
          <div className="flex gap-2">
            <Knob
              value={p.attack}
              min={0.001}
              max={1.5}
              step={0.001}
              defaultValue={0.01}
              onChange={(v) => set({ attack: v })}
              label="A"
              color={color}
              format={fmtTime}
            />
            <Knob
              value={p.decay}
              min={0.01}
              max={2}
              step={0.01}
              defaultValue={0.2}
              onChange={(v) => set({ decay: v })}
              label="D"
              color={color}
              format={fmtTime}
            />
            <Knob
              value={p.sustain}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.6}
              onChange={(v) => set({ sustain: v })}
              label="S"
              color={color}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Knob
              value={p.release}
              min={0.01}
              max={3}
              step={0.01}
              defaultValue={0.25}
              onChange={(v) => set({ release: v })}
              label="R"
              color={color}
              format={fmtTime}
            />
          </div>
        </div>
      </Section>

      {/* ---------- OUTPUT ---------- */}
      <Section title="OUTPUT">
        <Knob
          value={p.volume}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.8}
          onChange={(v) => set({ volume: v })}
          label="VOLUME"
          color={color}
          size={64}
          format={(v) =>
            `${(20 * Math.log10(Math.max(v, 0.001))).toFixed(0)} dB`
          }
        />
      </Section>
    </div>
  );
}
