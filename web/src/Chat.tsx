import { useEffect, useRef, useState } from 'react'
import { get, post, type ChatReply, type ToolCall } from './api'

type Line = { role: 'user' | 'assistant'; text: string; tools?: ToolCall[]; tokens?: ChatReply['tokens'] }

const SUGGESTIONS = ['A gift for my father under Rs 5,000', 'Do you have the kurta in size M?', 'Can I return earrings?']

function Markdown({ text }: { text: string }) {
  // Tiny, safe renderer: **bold** and bullet lines. Model text is never injected as HTML.
  return (
    <>
      {text.split('\n').map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line)
        const parts = line.replace(/^\s*[-*•]\s+/, '').split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : part)
        return <div key={i} className={bullet ? 'md-bullet' : 'md-line'}>{parts}</div>
      })}
    </>
  )
}

/** The agent asked to confirm a risky action and nothing has happened yet. */
function pendingConfirmation(line: Line): 'place' | 'cancel' | null {
  const names = (line.tools ?? []).map((t) => t.name)
  const asks = /\byes\b|confirm/i.test(line.text) && !/MB-\d{5}.*(placed|cancelled)/i.test(line.text)
  if (!asks) return null
  if (names.includes('place_order')) return 'place'
  if (names.includes('cancel_order')) return 'cancel'
  return null
}

export function Chat({ userId, threadId, onNewThread, onActivity, prefill, onOrder }: {
  userId: string; threadId: string; onNewThread: () => void; onActivity: () => void; prefill: string
  onOrder: (orderId: string) => void
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const [failed, setFailed] = useState('')
  const body = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLines([])
    get<Line[]>(`/thread/${encodeURIComponent(userId)}/${encodeURIComponent(threadId)}`).then(setLines).catch(() => {})
  }, [userId, threadId])
  useEffect(() => { if (prefill) { setText(prefill); input.current?.focus() } }, [prefill])
  useEffect(() => {
    // scroll only the message list, never the page
    const el = body.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [lines, busy])

  async function send(message: string) {
    if (!message.trim() || busy) return
    setText('')
    setFailed('')
    setLines((l) => [...l, { role: 'user', text: message }])
    setBusy(true)
    try {
      const r = await post<ChatReply>('/chat', { user_id: userId, thread_id: threadId, message })
      setLines((l) => [...l, { role: 'assistant', text: r.reply, tools: r.tool_calls, tokens: r.tokens }])
      const placed = r.reply.match(/MB-\d{5}/)
      if (placed && r.tool_calls.some((t) => t.name === 'place_order')) onOrder(placed[0])
      onActivity()
    } catch {
      setLines((l) => l.slice(0, -1))
      setFailed(message)
    } finally {
      setBusy(false)
    }
  }

  const last = lines[lines.length - 1]
  const confirm = !busy && last?.role === 'assistant' ? pendingConfirmation(last) : null

  return (
    <section className="chat" aria-label="Shop assistant">
      <header className="chat-head">
        <div>
          <strong>Ask Malik Brothers</strong>
          <span>Live stock, prices and your orders</span>
        </div>
        <div className="actions">
          <button type="button" aria-pressed={showSteps} onClick={() => setShowSteps((s) => !s)}>{showSteps ? 'Hide steps' : 'Show steps'}</button>
          <button type="button" onClick={onNewThread}>New chat</button>
        </div>
      </header>
      <div className="chat-body" ref={body} role="log" aria-live="polite" aria-relevant="additions">
        {lines.length === 0 && !busy && (
          <div className="welcome">
            <h2>Salaam! What are you looking for today?</h2>
            <p>I check live stock and prices, fill your cart, and place the order only when you say yes.</p>
            <div className="suggest">
              {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => void send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} className={`msg ${l.role}`}>
            <div className="bubble"><Markdown text={l.text} /></div>
            {showSteps && l.role === 'assistant' && l.tools && l.tools.length > 0 && (
              <details className="steps">
                <summary>Used {l.tools.length} {l.tools.length === 1 ? 'tool' : 'tools'} ▾</summary>
                {l.tools.map((t, j) => <code key={j}>{t.name}({Object.values(t.args).map(String).join(', ')})</code>)}
                {l.tokens && <div>{(l.tokens.in + l.tokens.out).toLocaleString()} tokens</div>}
              </details>
            )}
          </div>
        ))}
        {confirm && (
          <div className="quick" aria-label="Quick replies">
            <button type="button" className="yes" onClick={() => void send('yes')}>{confirm === 'place' ? 'Yes, place the order' : 'Yes, cancel it'}</button>
            <button type="button" onClick={() => { setText('Change '); input.current?.focus() }}>Change something</button>
          </div>
        )}
        {busy && <div className="msg assistant"><div className="bubble typing" aria-label="Assistant is typing"><span /><span /><span /></div></div>}
        {failed && (
          <div className="quick" role="alert">
            <span className="muted">Couldn't reach the shop.</span>
            <button type="button" onClick={() => void send(failed)}>Try again</button>
          </div>
        )}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(text) }}>
        <label htmlFor="chat-message" className="sr-only">Message</label>
        <input id="chat-message" ref={input} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Ask about a product, your cart or an order" maxLength={1000} autoComplete="off" />
        <button className="send" aria-label="Send" disabled={busy || !text.trim()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </form>
    </section>
  )
}
