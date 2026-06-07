'use client'

/**
 * AssistantPanel — conversational map assistant (the "Assistant" tab).
 *
 * A multi-turn chat that streams Claude's reply token-by-token and lets the
 * model drive the map (highlight districts / zoom) via map commands forwarded
 * to App through `onMapCommand`.
 *
 * Self-contained: owns its message thread, streaming state, and input. Renders
 * as a full-height flex column (thread + footer) to slot into ChatPanel's body.
 *
 * Visual system: Vercel light canvas. User turns are ink chips aligned right;
 * assistant turns are plain prose aligned left with a subtle brand glyph.
 */

import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useI18n } from '../context/I18nContext'
import type { Locale } from '../context/I18nContext'
import { streamChat, type AppState, type ChatTurn, type MapCommand } from '../lib/chat'
import { BoltIcon, SendIcon } from './Icons'

interface AssistantPanelProps {
  /** Forward map-control commands (highlight / zoom) up to App → MapView. */
  onMapCommand: (cmd: MapCommand) => void
  /**
   * Called at send-time (not render-time) to get a fresh snapshot of live app
   * state (selected district, active scenario, layer list, zoom level). Using a
   * callback avoids stale-closure issues compared to passing the value as a prop.
   */
  getAppState: () => AppState
}

// Suggested opening prompts — one tap to demo the assistant.
const SUGGESTION_KEYS = [
  'assistant.suggest.heatmap',
  'assistant.suggest.oldest',
  'assistant.suggest.greenest',
] as const

export default function AssistantPanel({ onMapCommand, getAppState }: AssistantPanelProps) {
  const { t, locale } = useI18n()

  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [streaming, setStreaming] = useState('')          // in-progress assistant text
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the newest content.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight })
  }, [messages, streaming, busy])

  // Cancel any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.abort(), [])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return

    const userTurn: ChatTurn = { role: 'user', content: trimmed }
    const history = [...messages, userTurn]
    setMessages(history)
    setInput('')
    setError(null)
    setBusy(true)
    setStreaming('')

    let acc = ''
    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat(history, locale as Locale, getAppState(), {
        onText: (delta) => {
          acc += delta
          setStreaming(acc)
        },
        onMapCommand,
        onError: (msg) => {
          setError(
            msg === 'auth'
              ? t('assistant.error.auth')
              : t('assistant.error.generic'),
          )
        },
        onDone: () => {
          if (acc.trim()) {
            setMessages((prev) => [...prev, { role: 'assistant', content: acc }])
          }
          setStreaming('')
          setBusy(false)
        },
      }, controller.signal)
    } catch {
      setError(t('assistant.error.generic'))
      setBusy(false)
      setStreaming('')
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    void send(input)
  }

  const empty = messages.length === 0 && !busy

  return (
    <div className="flex flex-col h-full">

      {/* ── Thread ──────────────────────────────────────────────────── */}
      <div ref={threadRef} className="flex-1 overflow-y-auto p-4">
        {empty ? (
          /* Empty state + suggestion chips */
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute inset-0 bg-brand-mesh-soft opacity-80 rounded-full blur-xl" />
              <div className="relative w-full h-full rounded-full bg-canvas shadow-card flex items-center justify-center text-ink">
                <BoltIcon size={22} />
              </div>
            </div>
            <p className="display-sm mb-1">{t('assistant.empty')}</p>
            <p className="text-[13px] text-mute tracking-body-sm leading-snug max-w-[220px] mb-5">
              {t('assistant.empty_sub')}
            </p>
            <div className="flex flex-col gap-1.5 w-full max-w-[260px]">
              {SUGGESTION_KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => void send(t(k))}
                  className="
                    text-left text-[12px] tracking-body-sm text-body
                    px-3 py-2 rounded-md bg-canvas-soft border border-hairline
                    hover:border-hairline-strong hover:text-ink
                    transition-colors
                  "
                >
                  {t(k)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] px-3 py-2 rounded-lg rounded-br-sm bg-ink text-canvas text-[12.5px] tracking-body-sm leading-relaxed">
                    {m.content}
                  </div>
                </div>
              ) : (
                <AssistantBubble key={i} text={m.content} />
              ),
            )}

            {/* In-progress assistant stream */}
            {busy && (
              streaming
                ? <AssistantBubble text={streaming} live />
                : <ThinkingDots label={t('assistant.thinking')} />
            )}
          </div>
        )}
      </div>

      {/* ── Input ──────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t border-hairline space-y-1.5">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null) }}
            placeholder={t('assistant.placeholder')}
            disabled={busy}
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
            disabled={busy || !input.trim()}
            aria-label={t('assistant.send')}
            className="
              absolute right-1 top-1 w-8 h-8 rounded-md
              text-mute disabled:opacity-40
              hover:text-ink hover:bg-canvas-soft
              inline-flex items-center justify-center
              transition-colors
            "
          >
            {busy ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="8 6" />
              </svg>
            ) : (
              <SendIcon size={15} />
            )}
          </button>
        </div>
        {error && <p className="text-[10px] text-error leading-snug">{error}</p>}
      </form>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function AssistantBubble({ text, live = false }: { text: string; live?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 mt-0.5 w-5 h-5 rounded-md bg-canvas-soft-2 text-ink flex items-center justify-center">
        <BoltIcon size={11} />
      </span>
      <p className="flex-1 text-[12.5px] text-body tracking-body-sm leading-relaxed whitespace-pre-wrap">
        {text}
        {live && <span className="inline-block w-1.5 h-3.5 ml-0.5 align-text-bottom bg-ink/60 animate-pulse" />}
      </p>
    </div>
  )
}

function ThinkingDots({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-mute">
      <span className="shrink-0 w-5 h-5 rounded-md bg-canvas-soft-2 flex items-center justify-center">
        <BoltIcon size={11} />
      </span>
      <span className="text-[11px] tracking-body-sm">{label}</span>
      <span className="flex gap-0.5">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="w-1 h-1 rounded-full bg-mute animate-bounce"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </span>
    </div>
  )
}
