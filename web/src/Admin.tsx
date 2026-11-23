import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { get, post, rs, when, type Order, type Product } from './api'

type Overview = {
  orders: number; revenue: number; to_ship: number; messages: number; customers: number; conversations: number
  tokens_in: number; tokens_out: number; cost_usd: number; blocked: number; latency_p50_ms: number; latency_p95_ms: number
  low_stock: { id: string; name: string; stock: number }[]; tool_usage: { name: string; n: number }[]
  daily: { day: string; messages: number }[]; model: string
}
type CustomerRow = { user_id: string; first_seen: string; last_seen: string; messages: number; orders: number; spent: number; memories: string[] }
type Log = {
  id: number; user_id: string; thread_id: string; message: string; reply: string; tool_calls: { name: string; args: object }[]
  tokens_in: number; tokens_out: number; latency_ms: number; blocked: string | null; error: string | null; created_at: string
}
type Tab = 'overview' | 'orders' | 'products' | 'customers' | 'conversations'

const icon = (d: string) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
const NAV: [Tab, string, ReactNode][] = [
  ['overview', 'Overview', icon('M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-4H4v4ZM14 4v4h6V4h-6Z')],
  ['orders', 'Orders', icon('M6 7h12l1 13H5L6 7Zm3 0a3 3 0 0 1 6 0')],
  ['products', 'Products', icon('M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8')],
  ['customers', 'Customers', icon('M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 8a3 3 0 0 0-3-3m1-4a2.5 2.5 0 1 0 0-5')],
  ['conversations', 'Conversations', icon('M5 18l-1 3 4-2h9a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v8a3 3 0 0 0 1 3Z')],
]

export function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem('mb_admin') ?? '')
  const [authed, setAuthed] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [problem, setProblem] = useState('')
  const [toShip, setToShip] = useState(0)

  const check = useCallback(async (t: string) => {
    try {
      const o = await get<Overview>('/admin/overview', t)
      sessionStorage.setItem('mb_admin', t)
      setToShip(o.to_ship)
      setAuthed(true)
      setProblem('')
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Could not sign in')
    }
  }, [])
  useEffect(() => { if (token) void check(token) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!authed) {
    return (
      <div className="admin-login">
        <form className="modal" onSubmit={(e) => { e.preventDefault(); void check(token) }}>
          <span className="brand"><span className="brand-name">Malik<span className="brand-dot" aria-hidden="true" />Brothers</span><span className="brand-sub">Seller dashboard</span></span>
          <label>Admin password<input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoFocus autoComplete="current-password" /></label>
          {problem && <p className="error" role="alert">{problem}</p>}
          <button className="primary full">Sign in</button>
          <a className="muted" href="/">Back to the shop</a>
        </form>
      </div>
    )
  }

  return (
    <div className="admin">
      <aside className="admin-nav">
        <span className="brand"><span className="brand-name">Malik<span className="brand-dot" aria-hidden="true" />Brothers</span><span className="brand-sub">Seller dashboard</span></span>
        <nav aria-label="Dashboard">
          {NAV.map(([id, label, svg]) => (
            <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
              {svg}{label}{id === 'orders' && toShip > 0 && <span className="nav-count">{toShip}</span>}
            </button>
          ))}
        </nav>
        <div className="admin-foot">
          <a href="/">View shop</a>
          <button type="button" className="small secondary" onClick={() => { sessionStorage.removeItem('mb_admin'); setAuthed(false); setToken('') }}>Sign out</button>
        </div>
      </aside>
      <main className="admin-main">
        {tab === 'overview' && <OverviewTab token={token} />}
        {tab === 'orders' && <OrdersTab token={token} onChange={() => void check(token)} />}
        {tab === 'products' && <ProductsTab token={token} />}
        {tab === 'customers' && <CustomersTab token={token} />}
        {tab === 'conversations' && <ConversationsTab token={token} />}
      </main>
    </div>
  )
}

function useData<T>(path: string, token: string): [T | null, () => void, string] {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(() => {
    get<T>(path, token).then((d) => { setData(d); setError('') }).catch((e) => setError(String(e.message ?? e)))
  }, [path, token])
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id) }, [load])
  return [data, load, error]
}

function Head({ title, note }: { title: string; note: string }) {
  return <div className="page-head"><div><h1>{title}</h1><p>{note}</p></div></div>
}

function OverviewTab({ token }: { token: string }) {
  const [o, , error] = useData<Overview>('/admin/overview', token)
  if (!o) return <p className="muted">{error || 'Loading…'}</p>
  const maxTool = Math.max(1, ...o.tool_usage.map((t) => t.n))
  const maxDay = Math.max(1, ...o.daily.map((d) => d.messages))
  const perMessage = o.messages ? o.cost_usd / o.messages : 0
  return (
    <>
      <Head title="Overview" note="Sales and how the assistant is doing. Updates every 15 seconds." />
      <div className="kpis">
        <Kpi label="Revenue" value={rs(o.revenue)} note={`${o.orders} orders`} />
        <Kpi label="Orders to ship" value={String(o.to_ship)} note="Confirmed, not shipped yet" />
        <Kpi label="Conversations" value={String(o.conversations)} note={`${o.customers} customers, ${o.messages} messages`} />
        <Kpi label="Assistant cost (USD)" value={`$${o.cost_usd.toFixed(4)}`} note={`About $${perMessage.toFixed(5)} per message`} title={`${(o.tokens_in + o.tokens_out).toLocaleString()} tokens on ${o.model}`} />
        <Kpi label="Reply time" value={`${(o.latency_p50_ms / 1000).toFixed(1)} s`} note={`Median; 95% under ${(o.latency_p95_ms / 1000).toFixed(1)} s`} />
        <Kpi label="Blocked messages" value={String(o.blocked)} note="Prompt injection or off-topic" />
      </div>
      <div className="panels">
        <section className="box">
          <h2>Tools the assistant used</h2>
          <p className="sub">All time</p>
          {o.tool_usage.length === 0 ? <p className="muted">No tool calls yet.</p> : o.tool_usage.map((t) => (
            <div key={t.name} className="bar-row"><code>{t.name}</code><div className="bar"><div style={{ width: `${(100 * t.n) / maxTool}%` }} /></div><span>{t.n}</span></div>
          ))}
        </section>
        <section className="box">
          <h2>Messages per day</h2>
          <p className="sub">Last 14 days</p>
          {o.daily.length < 3 ? (
            <><p className="big-note">{o.daily.reduce((n, d) => n + d.messages, 0)}</p><p className="muted">messages so far. The chart appears after three days of use.</p></>
          ) : (
            <>
              <div className="columns">{o.daily.map((d) => <div key={d.day} title={`${d.day}: ${d.messages}`}><div style={{ height: `${(100 * d.messages) / maxDay}%` }} /></div>)}</div>
              <div className="axis"><span>{o.daily[0].day.slice(5)}</span><span>max {maxDay}</span><span>{o.daily[o.daily.length - 1].day.slice(5)}</span></div>
            </>
          )}
        </section>
        <section className="box">
          <h2>Low stock</h2>
          <p className="sub">Five or fewer left</p>
          {o.low_stock.length === 0 ? <p className="muted">Everything is well stocked.</p> : (
            <ul className="lines">{o.low_stock.map((p) => (
              <li key={p.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}><span>{p.name} <small className="id">{p.id}</small></span>
                <span className={`status ${p.stock ? 's-low' : 's-out'}`}>{p.stock ? `${p.stock} left` : 'Sold out'}</span></li>))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

function Kpi({ label, value, note, title }: { label: string; value: string; note: string; title?: string }) {
  return <div className="kpi" title={title}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}

function OrdersTab({ token, onChange }: { token: string; onChange: () => void }) {
  const [orders, reload] = useData<Order[]>('/admin/orders', token)
  async function setStatus(id: string, status: string) { await post(`/admin/orders/${id}/status`, { status }, token); reload(); onChange() }
  return (
    <>
      <Head title="Orders" note="Orders appear here as soon as a customer says yes in the chat." />
      {!orders ? <p className="muted">Loading…</p> : orders.length === 0 ? <p className="muted">No orders yet.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Items</th><th scope="col" className="r">Total</th><th scope="col">Payment</th><th scope="col">Placed</th><th scope="col">Status</th></tr></thead>
            <tbody>{orders.map((o) => (
              <tr key={o.id}>
                <td className="id">{o.id}</td>
                <td>{o.customer_name}<br /><small>{o.city}</small></td>
                <td>{o.items.map((i) => `${i.qty} × ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join(', ')}</td>
                <td className="r">{rs(o.total)}{o.coupon && <><br /><small>{o.coupon}</small></>}</td>
                <td>{o.payment_method}</td>
                <td>{when(o.created_at)}</td>
                <td><select aria-label={`Status of ${o.id}`} className="status-select" value={o.status} onChange={(e) => void setStatus(o.id, e.target.value)}>
                  {['confirmed', 'shipped', 'delivered', 'cancelled'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}

function ProductsTab({ token }: { token: string }) {
  const [products, reload] = useData<Product[]>('/admin/products', token)
  const [saved, setSaved] = useState('')
  async function save(id: string, patch: Partial<Product>) {
    await post(`/admin/products/${id}`, patch, token)
    setSaved(id)
    setTimeout(() => setSaved(''), 1500)
    reload()
  }
  return (
    <>
      <Head title="Products" note="Price and stock changes reach the assistant immediately." />
      {!products ? <p className="muted">Loading…</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Product</th><th scope="col">Category</th><th scope="col" className="r">Price (Rs)</th><th scope="col" className="r">Stock</th><th scope="col">Listed</th></tr></thead>
            <tbody>{products.map((p) => (
              <tr key={p.id}>
                <td>{p.name} <small className="id">{p.id}</small>{saved === p.id && <span className="saved" role="status">Saved</span>}</td>
                <td>{p.category}</td>
                <td className="r"><input aria-label={`Price of ${p.name}`} className="cell-input num" type="number" min={0} defaultValue={p.price}
                  onBlur={(e) => Number(e.target.value) !== p.price && void save(p.id, { price: Number(e.target.value) })} /></td>
                <td className="r"><input aria-label={`Stock of ${p.name}`} className="cell-input num" type="number" min={0} defaultValue={p.stock}
                  onBlur={(e) => Number(e.target.value) !== p.stock && void save(p.id, { stock: Number(e.target.value) })} /></td>
                <td><input aria-label={`${p.name} is listed`} type="checkbox" checked={p.active} onChange={(e) => void save(p.id, { active: e.target.checked })} /></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}

function CustomersTab({ token }: { token: string }) {
  const [rows] = useData<CustomerRow[]>('/admin/customers', token)
  return (
    <>
      <Head title="Customers" note="Each customer has their own chats, cart, orders and long-term memory." />
      {!rows ? <p className="muted">Loading…</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Customer</th><th scope="col" className="r">Messages</th><th scope="col" className="r">Orders</th><th scope="col" className="r">Spent</th><th scope="col">What the assistant remembers</th><th scope="col">Last seen</th></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.user_id}>
                <td className="id">{c.user_id}</td><td className="r">{c.messages}</td><td className="r">{c.orders}</td><td className="r">{rs(c.spent)}</td>
                <td>{c.memories.length ? c.memories.join('; ') : <span className="muted">Nothing yet</span>}</td>
                <td>{when(c.last_seen)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </>
  )
}

function ConversationsTab({ token }: { token: string }) {
  const [logs] = useData<Log[]>('/admin/conversations', token)
  return (
    <>
      <Head title="Conversations" note="Every message with the tools used, tokens and reply time." />
      {!logs ? <p className="muted">Loading…</p> : (
        <div className="logs">{logs.map((l) => (
          <article key={l.id} className="log">
            <header><strong>{l.user_id}</strong><span>{when(l.created_at)}</span><span>{(l.latency_ms / 1000).toFixed(1)} s</span><span>{l.tokens_in + l.tokens_out} tokens</span>
              {l.blocked && <span className="status s-low">Blocked by safety guard</span>}{l.error && <span className="status s-out">Error</span>}</header>
            <p><span className="who">Customer:</span> {l.message}</p>
            <p><span className="who">Assistant:</span> {l.reply}</p>
            {l.tool_calls.length > 0 && <div className="steps">{l.tool_calls.map((t, i) => <code key={i}>{t.name}</code>)}</div>}
          </article>))}</div>
      )}
    </>
  )
}
