/**
 * chat.ts — streaming client for the conversational assistant (/api/chat).
 *
 * The backend streams Server-Sent Events. We POST the conversation history
 * (EventSource only supports GET, so we read the ReadableStream manually) and
 * dispatch each `data:` line to typed callbacks.
 *
 * Base path mirrors llm.ts: `/api`, proxied to localhost:8000 in dev via
 * next.config.ts rewrites; set NEXT_PUBLIC_API_BASE for a split-origin deploy.
 */

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE as string | undefined) ?? ''

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Map-control commands the assistant emits; the app applies them to MapView. */
export type MapCommand =
  | { name: 'highlight_map'; input: { districts: string[]; color?: string; label?: string } }
  | { name: 'zoom_to'; input: { district: string } }
  | {
      name: 'add_layer'
      input: {
        type?: string
        metric?: string
        granularity?: string
        label?: string
        color?: string
      }
    }
  | { name: 'remove_layer'; input: { id?: string; label?: string; all?: boolean } }

/** Names the assistant may emit as map commands. */
const MAP_COMMAND_NAMES = ['highlight_map', 'zoom_to', 'add_layer', 'remove_layer']

export interface ChatCallbacks {
  /** Incremental assistant prose. Append to the in-progress message. */
  onText?: (delta: string) => void
  /** A map command to execute (highlight / zoom). */
  onMapCommand?: (cmd: MapCommand) => void
  /** A server-side data tool started/finished (UI hint, optional). */
  onTool?: (name: string, status: 'running' | 'done') => void
  /** Stream finished cleanly. */
  onDone?: () => void
  /** Backend signalled an error ('auth' | 'api' | message). */
  onError?: (message: string) => void
}

// ─── SSE event shape (internal) ─────────────────────────────────────────────────

type SseEvent =
  | { type: 'text'; text: string }
  | { type: 'map_command'; name: string; input: Record<string, unknown> }
  | { type: 'tool'; name: string; status: 'running' | 'done' }
  | { type: 'error'; message: string }
  | { type: 'done' }

function dispatch(evt: SseEvent, cb: ChatCallbacks): void {
  switch (evt.type) {
    case 'text':
      cb.onText?.(evt.text)
      break
    case 'map_command':
      if (MAP_COMMAND_NAMES.includes(evt.name)) {
        cb.onMapCommand?.({ name: evt.name, input: evt.input } as MapCommand)
      }
      break
    case 'tool':
      cb.onTool?.(evt.name, evt.status)
      break
    case 'error':
      cb.onError?.(evt.message)
      break
    case 'done':
      cb.onDone?.()
      break
  }
}

/**
 * Send the conversation and stream the assistant's reply.
 *
 * Resolves when the stream ends (after onDone fires). Rejects on network /
 * non-200 errors before streaming begins; mid-stream errors arrive via onError.
 * Pass an AbortSignal to cancel an in-flight turn.
 */
export async function streamChat(
  messages: ChatTurn[],
  locale: 'en' | 'yue',
  cb: ChatCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, locale }),
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by a blank line.
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      try {
        dispatch(JSON.parse(payload) as SseEvent, cb)
      } catch {
        // Ignore malformed frame — keep the stream alive.
      }
    }
  }
}
