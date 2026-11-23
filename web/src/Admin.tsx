import { useCallback, useEffect, useState } from 'react'
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

export function Admin() {
  const [token, setToken] = useState(() => sessionStorage.getItem('mb_admin') ?? '')
  const [authed, setAuthed] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [problem, setProblem] = useState('')

  const check = useCallback(async (t: string) => {
    try {
      await get('/admin/overview', t)
      sessionStorage.setItem('mb_admin', t)
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
          <div className="logo"><span className="logo-mark">MB</span><span><strong>Seller dashboard</strong><small>Malik Brothers</small></span></div>
          <label>Admin password<input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoFocus /></label>
          {problem && <p className="error">{problem}</p>}
          <button className="primary full">Sign in</button>
          <a className="muted small" href="/">← Back to the shop</a>
        </form>
      </div>
    )
  }

  const tabs: [Tab, string][] = [['overview', 'Overview'], ['orders', 'Orders'], ['products', 'Products'], ['customers', 'Customers'], ['conversations', 'Conversations']]
  return (
    <div className="admin">
      <aside className="admin-nav">
        <div className="logo"><span className="logo-mark">MB</span><span><strong>Malik Brothers</strong><small>Seller dashboard</small></span></div>
        <nav>{tabs.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
        <div className="admin-foot">
          <a href="/">View shop</a>
          <button className="ghost small" onClick={() => { sessionStorage.removeItem('mb_admin'); setAuthed(false); setToken('') }}>Sign out</button>
        </div>
      </aside>
      <main className="admin-main">
        {tab === 'overview' && <OverviewTab token={token} />}
        {tab === 'orders' && <OrdersTab token={token} />}
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
  const load = useCallback(() => { get<T>(path, token).then((d) => { setData(d); setError('') }).catch((e) => setError(String(e.message ?? e))) }, [path, token])
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id) }, [load])
  return [data, load, error]
}

function OverviewTab({ token }: { token: string }) {
  const [o, , error] = useData<Overview>('/admin/overview', token)
  if (!o) return <p className="muted">{error || 'Loading…'}</p>
  const maxTool = Math.max(1, ...o.tool_usage.map((t) => t.n))
  const maxDay = Math.max(1, ...o.daily.map((d) => d.messages))
  return (
    <>
      <h1>Overview</h1>
      <div className="kpis">
        <Kpi label="Revenue" value={rs(o.revenue)} note={`${o.orders} orders`} />
        <Kpi label="To ship" value={String(o.to_ship)} note="confirmed orders" />
        <Kpi label="Conversations" value={String(o.conversations)} note={`${o.customers} customers · ${o.messages} messages`} />
        <Kpi label="Agent cost" value={`$${o.cost_usd.toFixed(4)}`} note={`${(o.tokens_in + o.tokens_out).toLocaleString()} tokens · ${o.model}`} />
        <Kpi label="Reply time" value={`${(o.latency_p50_ms / 1000).toFixed(1)} s`} note={`p95 ${(o.latency_p95_ms / 1000).toFixed(1)} s`} />
        <Kpi label="Blocked" value={String(o.blocked)} note="injection or off-topic" />
      </div>
      <div className="panels">
        <section className="panel">
          <h2>Tool use</h2>
          {o.tool_usage.length === 0 ? <p className="muted">No tool calls yet.</p> : o.tool_usage.map((t) => (
            <div key={t.name} className="bar-row"><code>{t.name}</code><div className="bar"><div style={{ width: `${(100 * t.n) / maxTool}%` }} /></div><span>{t.n}</span></div>
          ))}
        </section>
        <section className="panel">
          <h2>Messages per day</h2>
          {o.daily.length < 3
            ? <p className="muted"><strong style={{ fontSize: 28, color: 'var(--ink)' }}>{o.messages}</strong><br />messages so far. The daily chart appears after three days.</p>
            : <div className="columns">{o.daily.map((d) => <div key={d.day} title={`${d.day}: ${d.messages}`}><div style={{ height: `${(100 * d.messages) / maxDay}%` }} /><span>{d.day.slice(5)}</span></div>)}</div>}
        </section>
        <section className="panel">
          <h2>Low stock</h2>
          {o.low_stock.length === 0 ? <p className="muted">Everything is well stocked.</p> :
            <ul className="lines">{o.low_stock.map((p) => <li key={p.id}><span>{p.id} · {p.name}</span><span className={`stock ${p.stock ? 'low' : 'out'}`}>{p.stock ? `${p.stock} left` : 'Sold out'}</span></li>)}</ul>}
        </section>
      </div>
    </>
  )
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="kpi"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}

function OrdersTab({ token }: { token: string }) {
  const [orders, reload] = useData<Order[]>('/admin/orders', token)
  async function setStatus(id: string, status: string) { await post(`/admin/orders/${id}/status`, { status }, token); reload() }
  return (
    <>
      <h1>Orders</h1>
      {!orders ? <p className="muted">Loading…</p> : orders.length === 0 ? <p className="muted">No orders yet. They appear here as soon as a customer confirms in chat.</p> : (
        <table>
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Placed</th><th>Status</th></tr></thead>
          <tbody>{orders.map((o) => (
            <tr key={o.id}>
              <td><strong>{o.id}</strong></td>
              <td>{o.customer_name}<br /><small className="muted">{o.city} · {o.user_id}</small></td>
              <td>{o.items.map((i) => `${i.qty} × ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join(', ')}</td>
              <td>{rs(o.total)}{o.coupon && <><br /><small className="muted">{o.coupon}</small></>}</td>
              <td>{o.payment_method}</td>
              <td>{when(o.created_at)}</td>
              <td><select value={o.status} onChange={(e) => void setStatus(o.id, e.target.value)} className={`status s-${o.status}`}>
                {['confirmed', 'shipped', 'delivered', 'cancelled'].map((s) => <option key={s}>{s}</option>)}</select></td>
            </tr>))}</tbody>
        </table>
      )}
    </>
  )
}

function ProductsTab({ token }: { token: string }) {
  const [products, reload] = useData<Product[]>('/admin/products', token)
  async function save(id: string, patch: Partial<Product>) { await post(`/admin/products/${id}`, patch, token); reload() }
  return (
    <>
      <h1>Products</h1>
      {!products ? <p className="muted">Loading…</p> : (
        <table>
          <thead><tr><th>Product</th><th>Category</th><th>Price (Rs)</th><th>Stock</th><th>Listed</th></tr></thead>
          <tbody>{products.map((p) => (
            <tr key={p.id}>
              <td>{p.emoji} <strong>{p.name}</strong><br /><small className="muted">{p.id}</small></td>
              <td>{p.category}</td>
              <td><input className="num" type="number" defaultValue={p.price} min={0} onBlur={(e) => Number(e.target.value) !== p.price && void save(p.id, { price: Number(e.target.value) })} /></td>
              <td><input className="num" type="number" defaultValue={p.stock} min={0} onBlur={(e) => Number(e.target.value) !== p.stock && void save(p.id, { stock: Number(e.target.value) })} /></td>
              <td><input type="checkbox" checked={p.active} onChange={(e) => void save(p.id, { active: e.target.checked })} /></td>
            </tr>))}</tbody>
        </table>
      )}
      <p className="muted small">Changes apply to the assistant immediately: it reads price and stock live through its tools.</p>
      <CatalogUpload token={token} onDone={reload} />
    </>
  )
}

const SAMPLE_CSV = 'name,category,price,stock,description,sizes,colors,tags\nMultani Khussa,Footwear,2600,12,Hand-stitched khussa with mirror work,"37,38,39,40",Gold,women eid'

function CatalogUpload({ token, onDone }: { token: string; onDone: () => void }) {
  const [csv, setCsv] = useState('')
  const [form, setForm] = useState({ name: '', category: '', price: '', stock: '', sizes: '', colors: '', description: '' })
  const [result, setResult] = useState('')
  async function upload() {
    try {
      const r = await post<{ added: string[]; updated: string[]; errors: string[] }>('/admin/catalog', { csv }, token)
      setResult(`Added ${r.added.length}, updated ${r.updated.length}${r.errors.length ? `. Skipped: ${r.errors.join('; ')}` : '.'}`)
      setCsv('')
      onDone()
    } catch (e) { setResult(e instanceof Error ? e.message : 'Upload failed') }
  }
  async function addOne(e: React.FormEvent) {
    e.preventDefault()
    try {
      const r = await post<{ id: string; result: string }>('/admin/products', form, token)
      setResult(`${form.name} ${r.result} as ${r.id}.`)
      setForm({ name: '', category: '', price: '', stock: '', sizes: '', colors: '', description: '' })
      onDone()
    } catch (err) { setResult(err instanceof Error ? err.message : 'Could not add the product') }
  }
  const field = (key: keyof typeof form, label: string, type = 'text') => (
    <label className="field">{label}<input type={type} value={form[key]} required={['name', 'category', 'price', 'stock'].includes(key)}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>
  )
  return (
    <section className="panels">
      <form className="panel" onSubmit={addOne}>
        <h2>Add a product</h2>
        <div className="form-grid">
          {field('name', 'Name')}{field('category', 'Category')}{field('price', 'Price (Rs)', 'number')}{field('stock', 'Stock', 'number')}
          {field('sizes', 'Sizes (comma separated)')}{field('colors', 'Colours (comma separated)')}
        </div>
        {field('description', 'Description')}
        <button className="primary">Add product</button>
      </form>
      <div className="panel">
        <h2>Upload your catalogue (CSV)</h2>
        <p className="muted small">Columns: name, category, price, stock, description, sizes, colors, tags. Rows with an existing name are updated.</p>
        <input type="file" accept=".csv,text/csv" aria-label="Choose a CSV file"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then(setCsv) }} />
        <textarea className="csv" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={SAMPLE_CSV} aria-label="Catalogue CSV" />
        <div className="row-actions">
          <button className="ghost small" type="button" onClick={() => setCsv(SAMPLE_CSV)}>Use sample</button>
          <button className="primary" type="button" disabled={!csv.trim()} onClick={() => void upload()}>Upload catalogue</button>
        </div>
      </div>
      {result && <p className="notice" role="status">{result}</p>}
    </section>
  )
}

function CustomersTab({ token }: { token: string }) {
  const [rows] = useData<CustomerRow[]>('/admin/customers', token)
  return (
    <>
      <h1>Customers</h1>
      {!rows ? <p className="muted">Loading…</p> : (
        <table>
          <thead><tr><th>Customer</th><th>Messages</th><th>Orders</th><th>Spent</th><th>Long-term memory</th><th>Last seen</th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.user_id}>
              <td><strong>{c.user_id}</strong></td><td>{c.messages}</td><td>{c.orders}</td><td>{rs(c.spent)}</td>
              <td>{c.memories.length ? <ul className="memories">{c.memories.map((m) => <li key={m}>{m}</li>)}</ul> : <span className="muted">—</span>}</td>
              <td>{when(c.last_seen)}</td>
            </tr>))}</tbody>
        </table>
      )}
    </>
  )
}

function ConversationsTab({ token }: { token: string }) {
  const [logs] = useData<Log[]>('/admin/conversations', token)
  return (
    <>
      <h1>Conversations</h1>
      {!logs ? <p className="muted">Loading…</p> : (
        <div className="logs">{logs.map((l) => (
          <article key={l.id} className={`log ${l.blocked ? 'blocked' : ''} ${l.error ? 'failed' : ''}`}>
            <header><strong>{l.user_id}</strong><span className="muted">{l.thread_id} · {when(l.created_at)} · {(l.latency_ms / 1000).toFixed(1)} s · {l.tokens_in + l.tokens_out} tokens</span>
              {l.blocked && <span className="pill warn">blocked by safety guard</span>}{l.error && <span className="pill bad">error</span>}</header>
            <p><b>Customer:</b> {l.message}</p>
            <p><b>Assistant:</b> {l.reply}</p>
            {l.tool_calls.length > 0 && <div className="tool-trace">{l.tool_calls.map((t, i) => <code key={i}>{t.name}</code>)}</div>}
          </article>))}</div>
      )}
    </>
  )
}
