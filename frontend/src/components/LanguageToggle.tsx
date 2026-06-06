import { useI18n } from '../context/I18nContext'

export default function LanguageToggle() {
  const { t, toggleLocale } = useI18n()
  return (
    <button
      onClick={toggleLocale}
      className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition-colors"
      aria-label="Toggle language"
    >
      {t('lang.toggle')}
    </button>
  )
}
