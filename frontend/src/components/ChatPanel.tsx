'use client'

/**
 * ChatPanel — placeholder shell for the future AI assistant.
 *
 * Pure UI: header with mono caption-eyebrow + title + collapse chevron,
 * an empty-state hero, and a fake input row. No chat logic yet.
 * Lives on the LEFT side of the app, next to LayersPanel.
 */

import { useI18n } from '../context/I18nContext'
import {
  ChatIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SendIcon,
} from './Icons'

interface ChatPanelProps {
  open: boolean
  onToggle: () => void
}

export default function ChatPanel({ open, onToggle }: ChatPanelProps) {
  const { t } = useI18n()

  // Collapsed rail — narrow vertical strip with the chat icon and an expand chevron.
  if (!open) {
    return (
      <button
        onClick={onToggle}
        aria-label={t('sidebar.chat.expand')}
        title={t('sidebar.chat.expand')}
        className="
          shrink-0 w-10 h-full bg-canvas border-r border-hairline
          flex flex-col items-center gap-3 pt-4
          text-mute hover:text-ink hover:bg-canvas-soft
          transition-colors
        "
      >
        <ChatIcon size={16} />
        <ChevronRightIcon size={14} />
      </button>
    )
  }

  return (
    <aside className="shrink-0 w-[320px] h-full bg-canvas border-r border-hairline flex flex-col">

      {/* ── Header ───────────────────────────────────────────── */}
      <header className="shrink-0 h-12 px-3 hairline flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-md bg-ink text-canvas flex items-center justify-center">
            <ChatIcon size={12} />
          </span>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-[13px] font-medium tracking-body-sm truncate">
              {t('sidebar.chat.title')}
            </span>
            <span className="eyebrow text-[9px] truncate">
              {t('sidebar.chat.subtitle')}
            </span>
          </div>
        </div>
        <button
          onClick={onToggle}
          aria-label={t('sidebar.chat.collapse')}
          title={t('sidebar.chat.collapse')}
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

      {/* ── Empty state ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        <div className="my-auto text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 bg-brand-mesh-soft opacity-80 rounded-full blur-xl" />
            <div className="relative w-full h-full rounded-full bg-canvas shadow-card flex items-center justify-center">
              <span className="text-ink">
                <ChatIcon size={24} />
              </span>
            </div>
          </div>
          <p className="display-sm mb-1">{t('sidebar.chat.empty')}</p>
          <p className="text-[13px] text-mute tracking-body-sm leading-snug max-w-[220px] mx-auto">
            {t('sidebar.chat.empty_sub')}
          </p>
        </div>
      </div>

      {/* ── Input row (fake — placeholder) ───────────────────── */}
      <div className="shrink-0 p-3 border-t border-hairline space-y-2">
        <div className="relative">
          <input
            type="text"
            disabled
            placeholder={t('sidebar.chat.placeholder')}
            className="
              w-full h-10 pl-3 pr-9 rounded-md
              bg-canvas-soft border border-hairline
              text-[13px] tracking-body-sm placeholder:text-mute
              outline-none cursor-not-allowed
              focus:border-hairline-strong
              transition-colors
            "
          />
          <button
            disabled
            className="
              absolute right-1 top-1 w-8 h-8 rounded-md
              text-mute opacity-40 cursor-not-allowed
              inline-flex items-center justify-center
            "
            aria-label="Send"
          >
            <SendIcon size={14} />
          </button>
        </div>
        <button
          disabled
          className="
            w-full h-7 rounded-md
            border border-hairline border-dashed
            text-mute opacity-60 cursor-not-allowed
            text-[11px] tracking-body-sm font-medium
            inline-flex items-center justify-center gap-1.5
          "
        >
          <PlusIcon size={12} />
          New chat
        </button>
      </div>
    </aside>
  )
}
