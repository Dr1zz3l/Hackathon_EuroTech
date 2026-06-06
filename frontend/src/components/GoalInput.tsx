/**
 * GoalInput — free-text planning goal entry (Stage 2 LLM).
 *
 * On submit, delegates entirely to onGoal(text) — all parse → scenario → allocate
 * → summarize logic lives in App.tsx (handleGoal). This component only owns
 * loading state and error display.
 *
 * On any failure the UI shows an inline error; the preset buttons remain
 * fully usable (graceful degradation — spec requirement).
 */

import { type FormEvent, useState } from 'react'
import { useI18n } from '../context/I18nContext'

interface GoalInputProps {
  /** Async handler that orchestrates parse → scenario → allocate → summarize. */
  onGoal: (text: string) => Promise<void>
}

export default function GoalInput({ onGoal }: GoalInputProps) {
  const { t } = useI18n()
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
      // Keep text so the user can see what they typed
    } catch {
      setError(t('goal.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-1 px-3 py-2 bg-slate-800 border-b border-slate-700 shrink-0"
    >
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={e => { setText(e.target.value); setError(null) }}
          placeholder={t('goal.placeholder')}
          disabled={loading}
          className="flex-1 min-w-0 px-3 py-1.5 rounded text-xs bg-slate-700 text-slate-100 placeholder-slate-500 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="px-3 py-1.5 rounded text-xs font-medium bg-amber-400 text-slate-900 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {loading ? t('goal.loading') : t('goal.submit')}
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-red-400 leading-snug">{error}</p>
      )}
    </form>
  )
}
