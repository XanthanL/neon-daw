/**
 * 语言切换：紧凑分段「EN / 中文」，当前语言高亮。桌面放顶栏右侧，移动放溢出抽屉。
 */
import { useLang } from '../../i18n/lang';
import { useT } from '../../i18n/ui';

export function LangToggle({ block = false }: { block?: boolean }) {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const t = useT();

  const seg = (value: 'en' | 'zh', label: string) => {
    const on = lang === value;
    return (
      <button
        type="button"
        aria-pressed={on}
        aria-label={t.lang.aria}
        onClick={() => setLang(value)}
        className={`h-7 cursor-pointer px-2 text-[11px] font-black tracking-wide transition-colors select-none ${
          on ? 'bg-ink text-white' : 'bg-card text-fg-muted hover:text-ink'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className={`flex shrink-0 items-stretch overflow-hidden rounded-lg border-2 border-ink shadow-hard-sm ${
        block ? 'w-full' : ''
      }`}
    >
      {seg('en', t.lang.en)}
      {seg('zh', t.lang.zh)}
    </div>
  );
}
