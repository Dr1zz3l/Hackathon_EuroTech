'use client'

/**
 * LayersPanel — atlas.co-style stack inspector.
 *
 * Lists the layers currently rendered on the map. Each row:
 *   - left swatch (gradient / colour preview)
 *   - layer name + subtitle
 *   - hover-revealed action cluster: zoom-to-fit · visibility · kebab
 *   - hidden layers grey out (still selectable)
 *
 * The kebab opens an absolutely-positioned dropdown mirroring the atlas
 * item list (Lock / Data table / Styling / Rename / Download / Actions /
 * Delete). Items that have no real implementation yet are shown disabled
 * so the structure mirrors atlas without overpromising features.
 */

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../context/I18nContext'
import {
  ChevronLeftIcon,
  LayersIcon,
  PlusIcon,
  ZoomFitIcon,
  EyeIcon,
  EyeOffIcon,
  KebabIcon,
  LockIcon,
  TableIcon,
  SlidersIcon,
  PencilIcon,
  DownloadIcon,
  BoltIcon,
  TrashIcon,
} from './Icons'

// ─── Layer model — local to LayersPanel/App ────────────────────────────────
export interface AppLayer {
  id: string
  /** i18n key for the display name */
  label_key: string
  /** i18n key for the subtitle (file format / source / etc.) */
  subtitle_key: string
  visible: boolean
  /** 0–1 alpha multiplier on the layer's natural fill */
  opacity: number
  /** Whether download / styling actions apply to this layer */
  capabilities: {
    download: boolean
    style: boolean
  }
  /** A small swatch preview rendered in the row */
  swatch: 'districts' | 'basemap'
}

// ─── Props ─────────────────────────────────────────────────────────────────
interface LayersPanelProps {
  open: boolean
  onToggle: () => void
  layers: AppLayer[]
  onSetVisible: (id: string, visible: boolean) => void
  onZoomTo: (id: string) => void
  onOpenStyle: (id: string) => void
  onDownload: (id: string) => void
}

// ─── Swatch preview — shows the layer's palette at a glance ────────────────
function LayerSwatch({ kind, visible }: { kind: AppLayer['swatch']; visible: boolean }) {
  const opacity = visible ? 1 : 0.4
  if (kind === 'districts') {
    return (
      <span
        className="inline-block w-4 h-4 rounded-md shadow-hairline-inset shrink-0"
        style={{
          background:
            'linear-gradient(135deg, #50e3c2 0%, #0070f3 40%, #ff0080 70%, #f5a623 100%)',
          opacity,
        }}
      />
    )
  }
  return (
    <span
      className="inline-block w-4 h-4 rounded-md shadow-hairline-inset shrink-0"
      style={{ background: '#e5e5e5', opacity }}
    />
  )
}

// ─── Kebab dropdown menu ───────────────────────────────────────────────────
function KebabMenu({
  layer,
  onClose,
  onOpenStyle,
  onDownload,
}: {
  layer: AppLayer
  onClose: () => void
  onOpenStyle: (id: string) => void
  onDownload: (id: string) => void
}) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const items: Array<{
    key: string
    label: string
    icon: React.ReactNode
    enabled: boolean
    danger?: boolean
    onSelect?: () => void
  }> = [
    {
      key: 'lock',
      label: t('sidebar.layers.menu.lock'),
      icon: <LockIcon size={14} />,
      enabled: false,
    },
    {
      key: 'data_table',
      label: t('sidebar.layers.menu.data_table'),
      icon: <TableIcon size={14} />,
      enabled: false,
    },
    {
      key: 'styling',
      label: t('sidebar.layers.menu.styling'),
      icon: <SlidersIcon size={14} />,
      enabled: layer.capabilities.style,
      onSelect: () => {
        onOpenStyle(layer.id)
        onClose()
      },
    },
    {
      key: 'rename',
      label: t('sidebar.layers.menu.rename'),
      icon: <PencilIcon size={14} />,
      enabled: false,
    },
    {
      key: 'download',
      label: t('sidebar.layers.menu.download'),
      icon: <DownloadIcon size={14} />,
      enabled: layer.capabilities.download,
      onSelect: () => {
        onDownload(layer.id)
        onClose()
      },
    },
    {
      key: 'actions',
      label: t('sidebar.layers.menu.actions'),
      icon: <BoltIcon size={14} />,
      enabled: false,
    },
    {
      key: 'delete',
      label: t('sidebar.layers.menu.delete'),
      icon: <TrashIcon size={14} />,
      enabled: false,
      danger: true,
    },
  ]

  return (
    <div
      ref={ref}
      className="
        absolute right-2 top-9 z-30
        w-44 bg-canvas rounded-md shadow-modal
        py-1
      "
      role="menu"
    >
      {items.map(item => (
        <button
          key={item.key}
          onClick={item.onSelect}
          disabled={!item.enabled}
          role="menuitem"
          className={`
            w-full px-2.5 py-1.5
            inline-flex items-center gap-2
            text-[13px] tracking-body-sm
            ${
              !item.enabled
                ? 'text-mute opacity-50 cursor-not-allowed'
                : item.danger
                  ? 'text-error hover:bg-error-soft/40'
                  : 'text-ink hover:bg-canvas-soft'
            }
            transition-colors
          `}
        >
          <span className="shrink-0">{item.icon}</span>
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Layer row ─────────────────────────────────────────────────────────────
function LayerRow({
  layer,
  onSetVisible,
  onZoomTo,
  onOpenStyle,
  onDownload,
}: {
  layer: AppLayer
} & Pick<LayersPanelProps, 'onSetVisible' | 'onZoomTo' | 'onOpenStyle' | 'onDownload'>) {
  const { t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)

  const hidden = !layer.visible

  return (
    <div
      className={`
        group relative
        flex items-center gap-2 px-2 py-2 rounded-md
        hover:bg-canvas-soft transition-colors
        ${hidden ? 'opacity-50' : ''}
      `}
    >
      <LayerSwatch kind={layer.swatch} visible={layer.visible} />

      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-medium tracking-body-sm truncate ${hidden ? 'line-through decoration-mute/40' : 'text-ink'}`}>
          {t(layer.label_key)}
        </div>
        <div className="eyebrow text-[9px] truncate">
          {t(layer.subtitle_key)}
        </div>
      </div>

      {/* Action cluster — visible on hover OR when menu is open */}
      <div
        className={`
          shrink-0 flex items-center gap-0.5
          ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          transition-opacity
        `}
      >
        {/* Zoom to layer */}
        <button
          onClick={() => onZoomTo(layer.id)}
          title={t('sidebar.layers.action.zoom')}
          aria-label={t('sidebar.layers.action.zoom')}
          className="
            w-7 h-7 rounded-md
            text-mute hover:text-ink hover:bg-canvas
            inline-flex items-center justify-center
            transition-colors
          "
        >
          <ZoomFitIcon size={14} />
        </button>

        {/* Visibility toggle */}
        <button
          onClick={() => onSetVisible(layer.id, !layer.visible)}
          title={
            layer.visible
              ? t('sidebar.layers.action.visibility_hide')
              : t('sidebar.layers.action.visibility_show')
          }
          aria-label={
            layer.visible
              ? t('sidebar.layers.action.visibility_hide')
              : t('sidebar.layers.action.visibility_show')
          }
          aria-pressed={layer.visible}
          className="
            w-7 h-7 rounded-md
            text-mute hover:text-ink hover:bg-canvas
            inline-flex items-center justify-center
            transition-colors
          "
        >
          {layer.visible ? <EyeIcon size={14} /> : <EyeOffIcon size={14} />}
        </button>

        {/* More options */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          title={t('sidebar.layers.action.more')}
          aria-label={t('sidebar.layers.action.more')}
          aria-expanded={menuOpen}
          className={`
            w-7 h-7 rounded-md
            inline-flex items-center justify-center transition-colors
            ${menuOpen ? 'bg-canvas text-ink' : 'text-mute hover:text-ink hover:bg-canvas'}
          `}
        >
          <KebabIcon size={14} />
        </button>
      </div>

      {menuOpen && (
        <KebabMenu
          layer={layer}
          onClose={() => setMenuOpen(false)}
          onOpenStyle={onOpenStyle}
          onDownload={onDownload}
        />
      )}
    </div>
  )
}

// ─── LayersPanel root ──────────────────────────────────────────────────────
export default function LayersPanel({
  open,
  onToggle,
  layers,
  onSetVisible,
  onZoomTo,
  onOpenStyle,
  onDownload,
}: LayersPanelProps) {
  const { t } = useI18n()

  if (!open) {
    return (
      <button
        onClick={onToggle}
        aria-label={t('sidebar.layers.expand')}
        title={t('sidebar.layers.expand')}
        className="
          shrink-0 w-10 h-full bg-canvas border-r border-hairline
          flex flex-col items-center gap-3 pt-4
          text-mute hover:text-ink hover:bg-canvas-soft
          transition-colors
        "
      >
        <LayersIcon size={16} />
        <ChevronLeftIcon size={14} className="rotate-180" />
      </button>
    )
  }

  return (
    <aside className="shrink-0 w-[280px] h-full bg-canvas border-r border-hairline flex flex-col">

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="shrink-0 h-12 px-3 hairline flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <LayersIcon size={14} className="text-mute shrink-0" />
          <span className="text-[13px] font-medium tracking-body-sm">
            {t('sidebar.layers.title')}
          </span>
          <span
            className="
              eyebrow text-[9px]
              inline-flex items-center justify-center
              h-4 px-1.5 rounded-full
              bg-canvas-soft text-mute
              tabular-nums
            "
          >
            {layers.length}
          </span>
        </div>
        <button
          onClick={onToggle}
          aria-label={t('sidebar.layers.collapse')}
          title={t('sidebar.layers.collapse')}
          className="
            shrink-0 w-7 h-7 rounded-md
            text-mute hover:text-ink hover:bg-canvas-soft
            inline-flex items-center justify-center
            transition-colors
          "
        >
          <ChevronLeftIcon size={14} />
        </button>
      </header>

      {/* ── Add data — disabled placeholder ──────────────────── */}
      <div className="shrink-0 p-2">
        <button
          disabled
          className="
            w-full h-8 rounded-md
            border border-hairline border-dashed
            text-mute opacity-60 cursor-not-allowed
            text-[12px] tracking-body-sm font-medium
            inline-flex items-center justify-center gap-1.5
          "
          title="Coming soon"
        >
          <PlusIcon size={12} />
          {t('sidebar.layers.add')}
        </button>
      </div>

      {/* ── Layer list ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {layers.map(layer => (
          <LayerRow
            key={layer.id}
            layer={layer}
            onSetVisible={onSetVisible}
            onZoomTo={onZoomTo}
            onOpenStyle={onOpenStyle}
            onDownload={onDownload}
          />
        ))}
      </div>
    </aside>
  )
}
