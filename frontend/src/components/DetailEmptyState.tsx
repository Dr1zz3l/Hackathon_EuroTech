'use client'

/**
 * DetailEmptyState — shown in the Detail tab when no district is selected.
 *
 * Mirrors the DetailPanel's header band — same atmospheric brand mesh,
 * same eyebrow rhythm — so the panel feels like a single surface waiting
 * for input rather than an empty rectangle.
 */

import { useI18n } from '../context/I18nContext'

export default function DetailEmptyState() {
  const { t } = useI18n()
  return (
    <div className="relative h-full overflow-hidden flex flex-col">
      {/* Atmospheric mesh — the same brand moment the active panel uses */}
      <div className="absolute inset-0 bg-brand-mesh-soft opacity-80 pointer-events-none" />

      <div className="relative flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-[220px]">
          <p className="eyebrow mb-3">{t('detail.profile')}</p>
          <h3 className="display-md mb-2">
            {t('panel.right.detail.empty.title')}
          </h3>
          <p className="text-[13px] text-mute tracking-body-sm leading-snug">
            {t('panel.right.detail.empty.sub')}
          </p>
        </div>
      </div>
    </div>
  )
}
