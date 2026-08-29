/**
 * Mixer 效果器参数面板（右侧栏）：
 * 展示选中轨的效果器链，按 effects.ts 参数 schema 生成旋钮/枚举按钮组，
 * 实时调参（engine 已原地生效）、旁路切换、删除；双击旋钮重置。
 */
import { Power, Trash2 } from 'lucide-react';
import { FX_LIBRARY, type FxParamDef } from '../../audio/effects';
import { useProjectStore } from '../../stores/projectStore';
import { useT } from '../../i18n/ui';
import type { FxInstance } from '../../types/project';
import { Knob } from '../ui/Knob';

/** 枚举参数 → 贴纸按钮组（如 Filter 类型 LP/HP/BP/NT） */
function EnumParam({
  def,
  value,
  color,
  onChange,
}: {
  def: FxParamDef;
  value: number;
  color: string;
  onChange: (v: number) => void;
}) {
  if (!def.enum) return null;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-1">
        {def.enum.map((opt) => {
          const active = Math.round(value) === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`h-7 w-9 cursor-pointer rounded-lg border-2 border-ink text-[10px] font-black text-ink transition-all select-none ${
                active ? '-translate-y-0.5' : 'bg-card shadow-hard-sm hover:-translate-y-0.5'
              }`}
              style={
                active
                  ? {
                      background: color,
                      boxShadow: `1.5px 1.5px 0 #17171C, 0 0 8px ${color}90`,
                    }
                  : undefined
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <span className="label-caps">{def.label}</span>
    </div>
  );
}

/** 单个效果器卡片（参数旋钮按 schema 生成） */
function FxCard({
  trackId,
  fx,
  color,
}: {
  trackId: string;
  fx: FxInstance;
  color: string;
}) {
  const setEffectParam = useProjectStore((s) => s.setEffectParam);
  const toggleEffectBypass = useProjectStore((s) => s.toggleEffectBypass);
  const removeEffect = useProjectStore((s) => s.removeEffect);
  const t = useT();
  const meta = FX_LIBRARY[fx.type];

  return (
    <section
      className={`rounded-xl border-2 border-ink bg-card p-2.5 transition-opacity ${
        fx.bypass ? 'opacity-50' : ''
      }`}
      style={{ boxShadow: '2px 2px 0 #17171C' }}
    >
      {/* 卡片头：名称 + 旁路 + 删除 */}
      <header className="mb-2 flex items-center gap-1.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={
            fx.bypass
              ? { background: '#A8A8B2' }
              : { background: color, boxShadow: `0 0 5px ${color}` }
          }
        />
        <h4 className="min-w-0 flex-1 truncate text-xs font-extrabold text-ink">
          {t.fx.name[fx.type] ?? meta.label}
        </h4>
        {fx.bypass && (
          <span className="rounded-md border border-ink/30 px-1 text-[9px] font-black tracking-wider text-fg-muted uppercase">
            bypass
          </span>
        )}
        <button
          type="button"
          aria-label={fx.bypass ? t.mixer.unbypass : t.mixer.bypass}
          onClick={() => toggleEffectBypass(trackId, fx.id)}
          title={fx.bypass ? t.mixer.unbypass : t.mixer.bypassTip}
          className={`cursor-pointer rounded-md border-2 border-ink p-1 transition-all ${
            fx.bypass
              ? 'bg-panel text-fg-faint'
              : 'bg-ink text-white shadow-hard-sm hover:-translate-y-0.5'
          }`}
        >
          <Power className="h-3 w-3" strokeWidth={2.8} />
        </button>
        <button
          type="button"
          aria-label={t.mixer.deleteFx}
          onClick={() => removeEffect(trackId, fx.id)}
          title={t.common.delete}
          className="cursor-pointer rounded-md border-2 border-ink bg-card p-1 text-ink shadow-hard-sm transition-all hover:-translate-y-0.5 hover:text-neon-pink"
        >
          <Trash2 className="h-3 w-3" strokeWidth={2.6} />
        </button>
      </header>

      {/* 参数控件（schema 驱动） */}
      <div className="flex flex-wrap items-start justify-center gap-x-1 gap-y-2">
        {meta.params.map((def) =>
          def.enum ? (
            <EnumParam
              key={def.key}
              def={def}
              value={fx.params[def.key] ?? def.enum![0].value}
              color={color}
              onChange={(v) => setEffectParam(trackId, fx.id, def.key, v)}
            />
          ) : (
            <Knob
              key={def.key}
              value={fx.params[def.key] ?? def.min}
              min={def.min}
              max={def.max}
              step={def.step}
              defaultValue={fx.params[def.key] ?? def.min}
              onChange={(v) => setEffectParam(trackId, fx.id, def.key, v)}
              label={def.label}
              format={def.format}
              color={color}
              size={44}
            />
          ),
        )}
      </div>
    </section>
  );
}

/* ============================================================
 * 参数面板
 * ============================================================ */

export function FxPanel({
  trackId,
  color,
}: {
  trackId: string;
  color: string;
}) {
  const track = useProjectStore((s) =>
    s.mixerTracks.find((t) => t.id === trackId),
  );
  const t = useT();

  if (!track) return null;

  return (
    <aside className="flex w-full shrink-0 flex-col border-ink bg-bg-warm/70 md:w-[300px] md:border-l-2">
      <header className="flex items-center gap-2 border-b-2 border-ink bg-bg-warm px-3.5 py-2.5">
        <span
          className="h-4 w-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold text-ink">
            {track.name}
          </div>
          <span className="label-caps text-[9px]">
            FX Chain · {track.effects.length}
          </span>
        </div>
      </header>

      <div className="flex flex-col gap-2.5 overflow-y-auto p-3">
        {track.effects.length === 0 ? (
          <div className="relative mt-6 flex flex-col items-center gap-2 self-center rounded-2xl border-2 border-dashed border-ink/25 bg-card/70 px-6 py-5 text-center">
            <p className="text-sm font-extrabold text-ink">{t.mixer.empty}</p>
            <p className="text-xs font-semibold text-fg-muted">
              {t.mixer.emptyHint}
            </p>
            <div className="absolute -bottom-[9px] left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-r-2 border-b-2 border-ink bg-card" />
          </div>
        ) : (
          track.effects.map((fx) => (
            <FxCard key={fx.id} trackId={track.id} fx={fx} color={color} />
          ))
        )}
      </div>

      <footer className="border-t-2 border-ink/10 px-3.5 py-2">
        <span className="label-caps text-[9px]">
          {t.mixer.doubleReset}
        </span>
      </footer>
    </aside>
  );
}
