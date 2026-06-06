'use client'

/**
 * LanguageToggle — Vercel nav-cta-ask-ai ghost button.
 * Hairline border, 28 px tall, sm radius (6 px), body-sm-strong label.
 */

import { useI18n } from '../context/I18nContext'

export default function LanguageToggle() {
  const { t, locale, toggleLocale } = useI18n()

  return (
    <button
      onClick={toggleLocale}
      className="
        h-8 px-3 inline-flex items-center gap-2
        rounded-md
        bg-canvas text-ink
        border border-hairline
        text-[13px] font-medium tracking-body-sm
        hover:bg-canvas-soft hover:border-hairline-strong
        active:bg-canvas-soft-2
        transition-colors
      "
      aria-label="Toggle language"
    >
      <span className="eyebrow text-[9px]">
        {locale === 'en' ? 'EN' : '繁中'}
      </span>
      <span className="w-px h-3 bg-hairline" />
      <span>{t('lang.toggle')}</span>
    </button>
  )
}
