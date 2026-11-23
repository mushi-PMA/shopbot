import { useEffect, useRef, useState } from 'react'
import { get, post, type ChatReply, type ToolCall } from './api'

type Line = { role: 'user' | 'assistant'; text: string; tools?: ToolCall[]; tokens?: ChatReply['tokens'] }

const SUGGESTIONS = ['Show me gifts under Rs 2,000', 'Do you have kurtas in size M?', 'What is your return policy?', 'Track my order']

function Markdown({ text }: { text: string }) {
  // Small, safe renderer: **bold** and bullet lines. No HTML from the model is ever injected.
  return (
    <>
      {text.split('\n').map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line)
        const parts = line.replace(/^\s*[-*•]\s+/, '').split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : part)
        return bullet ? <div key={i} className="md-bullet">{parts}</div> : <div key={i} className="md-line">{parts}</div>
      })}
    </>
  )
}

/** The agent asked to confirm a risky action and nothing has happened yet. */
function confirmKind(line?: Line): 'place' | 'cancel' | null {
  if (!line || line.role !== 'assistant' || !/\byes\b|confirm/i.test(line.text) || /MB-\d{5}/.test(line.text)) return null
  const names = (line.tools ?? []).map((t) => t.name)
  return names.includes('place_order') ? 'place' : names.includes('cancel_order') ? 'cancel' : null
}

export function Chat({ userId, threadId, onNewThread, onActivity, prefill, onOrder }: {
  userId: string; threadId: string; onNewThread: () => void; onActivity: () => void; prefill: string
  onOrder: (orderId: string) => void
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLines([])
    get<Line[]>(`/thread/${encodeURIComponent(userId)}/${encodeURIComponent(threadId)}`).then(setLines).catch(() => {})
  }, [userId, threadId])
  useEffect(() => { if (prefill) setText(prefill) }, [prefill])
  useEffect(() => { body.current?.scrollTo({ top: body.current.scrollHeight, behavior: 'smooth' }) }, [lines, busy])

  async function send(message: string) {
    if (!message.trim() || busy) return
    setText('')
    setLines((l) => [...l, { role: 'user', text: message }])
    setBusy(true)
    try {
      const r = await post<ChatReply>('/chat', { user_id: userId, thread_id: threadId, message })
      setLines((l) => [...l, { role: 'assistant', text: r.reply, tools: r.tool_calls, tokens: r.tokens }])
      const placed = r.reply.match(/MB-\d{5}/)
      if (placed && r.tool_calls.some((t) => t.name === 'place_order')) onOrder(placed[0])
      onActivity()
    } catch {
      setLines((l) => [...l, { role: 'assistant', text: 'Sorry, I could not reach the shop. Please try again.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="chat" aria-label="Chat with the sales assistant">
      <header className="chat-head">
        <div className="bot-avatar" aria-hidden="true">MB</div>
        <div>
          <strong>Malik Brothers assistant</strong>
          <span className="online">Online · replies in seconds</span>
        </div>
        <div className="chat-actions">
          <label className="toggle" title="Show which tools the assistant used">
            <input type="checkbox" checked={showTools} onChange={(e) => setShowTools(e.target.checked)} /> Tools
          </label>
          <button className="ghost small" onClick={onNewThread}>New chat</button>
        </div>
      </header>
      <div className="chat-body" ref={body} role="log" aria-live="polite">
        {lines.length === 0 && (
          <div className="welcome">
            <p>Assalam o alaikum! I can find products, check stock, fill your cart, place and track orders.</p>
            <div className="chips">
              {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} className={`bubble ${l.role}`}>
            <Markdown text={l.text} />
            {showTools && l.tools && l.tools.length > 0 && (
              <div className="tool-trace">
                {l.tools.map((t, j) => <code key={j}>{t.name}({Object.values(t.args).map(String).join(', ')})</code>)}
                {l.tokens && <span>{l.tokens.in + l.tokens.out} tokens</span>}
              </div>
            )}
          </div>
        ))}
        {!busy && confirmKind(lines[lines.length - 1]) && (
          <div className="chips">
            <button className="chip on" onClick={() => send('yes')}>
              {confirmKind(lines[lines.length - 1]) === 'cancel' ? 'Yes, cancel it' : 'Yes, place the order'}
            </button>
            <button className="chip" onClick={() => setText('Change ')}>Change something</button>
          </div>
        )}
        {busy && <div className="bubble assistant typing" aria-label="Assistant is typing"><span /><span /><span /></div>}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(text) }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about products, orders, delivery…"
          aria-label="Message" maxLength={1000} />
        <button className="primary" disabled={busy || !text.trim()}>Send</button>
      </form>
    </section>
  )
}
