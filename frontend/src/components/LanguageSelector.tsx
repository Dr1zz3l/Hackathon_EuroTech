import { useI18n } from '../context/I18nContext'

const LOCALES = {
  en: { flag: '🇬🇧', label: 'EN' },
  yue: { flag: '🇭🇰', label: '粵' },
} as const

export function LanguageSelector() {
  const { locale, toggleLocale } = useI18n()
  const next = locale === 'en' ? 'yue' : 'en'
  const current = LOCALES[locale]
  const nextLocale = LOCALES[next]

  return (
    <button
      onClick={toggleLocale}
      className="flex items-center gap-2 h-11 px-4 bg-white rounded-full shadow-lg touch-manipulation active:bg-gray-50"
      aria-label={`Switch to ${next === 'en' ? 'English' : 'Cantonese'}`}
      title={`Switch to ${nextLocale.label}`}
    >
      <span className="text-xl leading-none" aria-hidden="true">
        {current.flag}
      </span>
      <span className="text-sm font-semibold text-gray-700 tracking-wide">
        {current.label}
      </span>
    </button>
  )
}
