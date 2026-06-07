'use client'

/**
 * ChatPanel — the left sidebar, hosting two tabs:
 *
 *   • Planner   — the one-shot goal planner (unchanged): a goal → land
 *                 reallocation → AI summary. Driven by onGoal / plannerMessage.
 *   • Assistant — a multi-turn conversational assistant that answers questions
 *                 about the data and drives the map (highlight / zoom). Lives in
 *                 AssistantPanel; map commands bubble up via onMapCommand.
 *
 * The shell (collapse rail + header tabs) is shared; each tab renders its own
 * body and input footer.
 *
 * Visual system: Vercel light canvas.
 */

import { type FormEvent, useState } from 'react'
import { useI18n } from '../context/I18nContext'
import type { WeightSet } from '../types'
import type { AppState, MapCommand } from '../lib/chat'
import AssistantPanel from './AssistantPanel'
import {
  BoltIcon,
  ChatIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from './Icons'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlannerMessage {
  rationale: string
  prose: string | null
  loading: boolean
  weights: WeightSet | null
  overriddenKeys: Set<string>
}

const WEIGHT_SHORT: Record<string, string> = {
  displacement: 'displ',
  age:          'age',
  headroom:     'headrm',
  area:         'area',
  renewal:      'renew',
  adjacency:    'adj',
}

type ChatTab = 'assistant' | 'planner'

interface ChatPanelProps {
  open: boolean
  onToggle: () => void
  onGoal: (text: string) => Promise<void>
  plannerMessage: PlannerMessage | null
  /** Map-control commands emitted by the conversational assistant. */
  onMapCommand: (cmd: MapCommand) => void
  /** Returns a live app-state snapshot at call-time for the assistant. */
  getAppState: () => AppState
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatPanel({
  open,
  onToggle,
  onGoal,
  plannerMessage,
  onMapCommand,
  getAppState,
}: ChatPanelProps) {
  const { t } = useI18n()
  const [tab, setTab]         = useState<ChatTab>('assistant')
  const [text, setText]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      await onGoal(trimmed)
    } catch {
      setError(t('goal.error'))
    } finally {
      setLoading(false)
    }
  }

  // ── Collapsed rail ──────────────────────────────────────────────────────
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

      {/* ── Header: tab switcher + collapse ───────────────────────────── */}
      <header className="shrink-0 h-12 px-3 hairline flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-0.5 rounded-full bg-canvas-soft-2">
          <button
            onClick={() => setTab('assistant')}
            className={`
              h-7 px-3 rounded-full inline-flex items-center gap-1.5
              text-[12px] font-medium tracking-body-sm transition-colors
              ${tab === 'assistant'
                ? 'bg-canvas text-ink shadow-hairline-inset'
                : 'text-mute hover:text-ink'}
            `}
          >
            <BoltIcon size={12} />
            {t('sidebar.chat.tab.assistant')}
          </button>
          <button
            onClick={() => setTab('planner')}
            className={`
              h-7 px-3 rounded-full inline-flex items-center gap-1.5
              text-[12px] font-medium tracking-body-sm transition-colors
              ${tab === 'planner'
                ? 'bg-canvas text-ink shadow-hairline-inset'
                : 'text-mute hover:text-ink'}
            `}
          >
            <ChatIcon size={12} />
            {t('sidebar.chat.tab.planner')}
          </button>
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

      {/* ── Assistant tab — always mounted so chat history survives tab switches */}
      <div className={tab === 'assistant' ? 'flex-1 overflow-hidden' : 'hidden'}>
        <AssistantPanel onMapCommand={onMapCommand} getAppState={getAppState} />
      </div>

      {/* ── Planner tab (unchanged behaviour) ─────────────────────────── */}
      {tab === 'planner' && (
        <>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            {plannerMessage ? (
              <div className="space-y-4">
                {/* Rationale */}
                <div className="p-3 rounded-lg bg-canvas-soft border border-hairline">
                  <p className="eyebrow mb-1.5">{t('planner.summary.title')}</p>
                  <p className="text-[12px] text-body leading-relaxed italic">
                    {plannerMessage.rationale}
                  </p>
                </div>

                {/* Haiku-weights chips */}
                {plannerMessage.weights && (() => {
                  const w = plannerMessage.weights
                  const keys = (Object.keys(w) as (keyof WeightSet)[]).filter(k => w[k] != null)
                  const mainKeys = (['displacement', 'age', 'headroom', 'area'] as (keyof WeightSet)[])
                    .filter(k => w[k] != null)
                  if (w.renewal != null) mainKeys.push('renewal')
                  const total = mainKeys.reduce((s, k) => s + (w[k] ?? 0), 0)
                  return (
                    <div>
                      <p className="eyebrow mb-1.5">{t('panel.weights')}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {mainKeys.map(k => {
                          const raw = w[k] ?? 0
                          const pct = total > 0 ? Math.round((raw / total) * 100) : 0
                          const isSet = plannerMessage.overriddenKeys.has(k as string)
                          return (
                            <span
                              key={k}
                              title={`${String(k)}: ${raw.toFixed(3)} (${pct}%)${isSet ? ' — tuned by AI' : ' — default'}`}
                              className={`
                                text-[9px] px-1.5 py-0.5 rounded-sm font-mono
                                ${isSet
                                  ? 'bg-link/10 text-link-deep ring-1 ring-link/30'
                                  : 'bg-canvas-soft-2 text-mute'}
                              `}
                            >
                              {WEIGHT_SHORT[k as string] ?? String(k)} {pct}%{isSet ? ' ✦' : ''}
                            </span>
                          )
                        })}
                        {void keys}
                      </div>
                    </div>
                  )
                })()}

                {/* Prose / loading */}
                {plannerMessage.loading ? (
                  <div className="p-3 rounded-lg bg-canvas-soft border border-hairline">
                    <p className="eyebrow mb-1.5 animate-pulse">{t('planner.summary.loading')}</p>
                    <div className="space-y-1.5">
                      {[40, 60, 48].map(w => (
                        <div key={w} className="h-2 rounded bg-canvas-soft-2" style={{ width: `${w}%` }} />
                      ))}
                    </div>
                  </div>
                ) : plannerMessage.prose ? (
                  <div className="p-3 rounded-lg bg-canvas-soft border border-hairline">
                    <p className="eyebrow mb-1.5">{t('planner.summary.title')}</p>
                    <p className="text-[12px] text-body leading-relaxed">
                      {plannerMessage.prose}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
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
            )}
          </div>

          {/* Goal input row */}
          <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t border-hairline space-y-1.5">
            <div className="relative">
              <input
                type="text"
                value={text}
                onChange={e => { setText(e.target.value); setError(null) }}
                placeholder={t('sidebar.chat.placeholder')}
                disabled={loading}
                className="
                  w-full h-10 pl-3 pr-[2.5rem] rounded-md
                  bg-canvas-soft border border-hairline
                  text-[13px] tracking-body-sm placeholder:text-mute
                  outline-none disabled:opacity-60
                  focus:border-hairline-strong
                  transition-colors
                "
              />
              <button
                type="submit"
                disabled={loading || !text.trim()}
                aria-label={t('goal.submit')}
                className="
                  absolute right-1 top-1 w-8 h-8 rounded-md
                  text-mute disabled:opacity-40
                  hover:text-ink hover:bg-canvas-soft
                  inline-flex items-center justify-center
                  transition-colors
                "
              >
                {loading ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin">
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="8 6" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
            {error && (
              <p className="text-[10px] text-error leading-snug">{error}</p>
            )}
          </form>
        </>
      )}
    </aside>
  )
}
