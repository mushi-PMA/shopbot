import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chat } from './Chat'
import { get, rs, when, type Order, type Product } from './api'

type Customer = { id: string; name: string }
type Mine = { cart: { product_id: string; variant: string; qty: number; name: string; price: number; emoji: string }[]; orders: Order[]; memories: string[] }

const DEMO: Customer[] = [{ id: 'ali-sargodha', name: 'Ali' }, { id: 'sana-lahore', name: 'Sana' }]
const newThread = () => `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback }
}

export function Store() {
  const [customer, setCustomer] = useState<Customer>(() => load('mb_customer', DEMO[0]))
  const [threadId, setThreadId] = useState(() => localStorage.getItem(`mb_thread_${customer.id}`) ?? newThread())
  const [products, setProducts] = useState<Product[]>([])
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [mine, setMine] = useState<Mine | null>(null)
  const [tab, setTab] = useState<'chat' | 'account'>('chat')
  const [prefill, setPrefill] = useState('')
  const [signIn, setSignIn] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { get<Product[]>('/products').then(setProducts).catch(() => setError('The shop is waking up. Please refresh in a moment.')) }, [])
  useEffect(() => {
    localStorage.setItem('mb_customer', JSON.stringify(customer))
    const saved = localStorage.getItem(`mb_thread_${customer.id}`)
    const id = saved ?? newThread()
    localStorage.setItem(`mb_thread_${customer.id}`, id)
    setThreadId(id)
  }, [customer])
  const refresh = useCallback(() => {
    get<Mine>(`/customer/${encodeURIComponent(customer.id)}`).then(setMine).catch(() => {})
    get<Product[]>('/products').then(setProducts).catch(() => {})
  }, [customer.id])
  useEffect(refresh, [refresh])

  const categories = useMemo(() => ['All', ...new Set(products.map((p) => p.category))], [products])
  const shown = products.filter((p) => (category === 'All' || p.category === category) &&
    `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(query.toLowerCase()))
  const cartCount = mine?.cart.reduce((n, i) => n + i.qty, 0) ?? 0

  function startNewThread() {
    const id = newThread()
    localStorage.setItem(`mb_thread_${customer.id}`, id)
    setThreadId(id)
  }
  function ask(p: Product) {
    setTab('chat')
    setPrefill(`Tell me about ${p.name} (${p.id})${p.sizes ? ' and which sizes are in stock' : ''}`)
  }

  return (
    <div className="store">
      <header className="topbar">
        <a className="logo" href="/"><span className="logo-mark">MB</span><span><strong>Malik Brothers</strong><small>Family-run shop · Sargodha</small></span></a>
        <div className="topbar-right">
          <button className="ghost" onClick={() => setTab('account')}>🛒 Cart <span className="count">{cartCount}</span></button>
          <div className="who">
            <span className="avatar">{customer.name.slice(0, 1).toUpperCase()}</span>
            <select aria-label="Signed-in customer" value={customer.id} onChange={(e) => {
              if (e.target.value === '__new') { setSignIn(true); return }
              setCustomer(DEMO.find((c) => c.id === e.target.value) ?? customer)
            }}>
              {[...DEMO, ...(DEMO.some((c) => c.id === customer.id) ? [] : [customer])].map((c) =>
                <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new">+ Sign in as someone else</option>
            </select>
          </div>
          <a className="ghost link" href="/admin">Admin</a>
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Free pickup in Sargodha · Delivery across Pakistan</p>
          <h1>Clothing, footwear and gifts, with a shop assistant that never sleeps.</h1>
          <p className="lead">Ask in English or Roman Urdu. The assistant checks live stock, fills your cart and places your order once you say yes.</p>
        </div>
        <div className="hero-card">
          <div><strong>Rs 250</strong><span>flat delivery</span></div>
          <div><strong>Free</strong><span>over Rs 5,000</span></div>
          <div><strong>7 days</strong><span>easy returns</span></div>
        </div>
      </section>

      <main className="layout">
        <section aria-label="Catalogue">
          <div className="filters">
            <div className="chips">
              {categories.map((c) => <button key={c} className={`chip ${c === category ? 'on' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}
            </div>
            <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" aria-label="Search products" />
          </div>
          {error && <p className="notice">{error}</p>}
          <div className="grid">
            {shown.map((p, i) => (
              <article key={p.id} className="card" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <div className={`thumb cat-${p.category.toLowerCase()}`} aria-hidden="true">{p.emoji}</div>
                <div className="card-body">
                  <div className="card-top"><span className="cat">{p.category}</span><span className="rating">★ {p.rating.toFixed(1)}</span></div>
                  <h3>{p.name}</h3>
                  <p className="desc">{p.description}</p>
                  {(p.sizes || p.colors) && <p className="variants">{[p.sizes && `Sizes ${p.sizes.replaceAll(',', ', ')}`, p.colors && p.colors.replaceAll(',', ' · ')].filter(Boolean).join(' — ')}</p>}
                  <div className="card-foot">
                    <strong className="price">{rs(p.price)}</strong>
                    {p.stock > 0 ? <span className={`stock ${p.stock <= 5 ? 'low' : ''}`}>{p.stock <= 5 ? `Only ${p.stock} left` : 'In stock'}</span> : <span className="stock out">Sold out</span>}
                  </div>
                  <button className="secondary full" onClick={() => ask(p)}>Ask the assistant</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="side">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Assistant</button>
            <button role="tab" aria-selected={tab === 'account'} className={tab === 'account' ? 'on' : ''} onClick={() => { setTab('account'); refresh() }}>My cart & orders</button>
          </div>
          {tab === 'chat' ? (
            <Chat userId={customer.id} threadId={threadId} onNewThread={startNewThread} onActivity={refresh} prefill={prefill} />
          ) : (
            <section className="account">
              <h2>Cart</h2>
              {!mine?.cart.length ? <p className="muted">Your cart is empty. Ask the assistant to add something.</p> : (
                <ul className="lines">
                  {mine.cart.map((i) => <li key={i.product_id + i.variant}><span>{i.emoji} {i.name}{i.variant && <small> ({i.variant})</small>} × {i.qty}</span><strong>{rs(i.price * i.qty)}</strong></li>)}
                  <li className="total"><span>Subtotal</span><strong>{rs(mine.cart.reduce((n, i) => n + i.price * i.qty, 0))}</strong></li>
                </ul>
              )}
              <p className="muted small">To check out, tell the assistant "place my order".</p>
              <h2>Orders</h2>
              {!mine?.orders.length ? <p className="muted">No orders yet.</p> : (
                <ul className="lines">
                  {mine.orders.map((o) => <li key={o.id}><span><strong>{o.id}</strong> · {when(o.created_at)}<br /><small>{o.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</small></span><span className={`status s-${o.status}`}>{o.status}</span></li>)}
                </ul>
              )}
              <h2>What the assistant remembers</h2>
              {!mine?.memories.length ? <p className="muted">Nothing yet. Tell it your size, city or what you like.</p> : (
                <ul className="memories">{mine.memories.map((m) => <li key={m}>{m}</li>)}</ul>
              )}
            </section>
          )}
        </aside>
      </main>

      <footer className="foot">Malik Brothers · Liaquat Market, University Road, Sargodha · WhatsApp +92 300 1234567 · <a href="/admin">Seller dashboard</a></footer>

      {signIn && (
        <div className="modal-bg" onClick={() => setSignIn(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault()
            const data = new FormData(e.currentTarget)
            const name = String(data.get('name') ?? '').trim()
            const phone = String(data.get('phone') ?? '').trim()
            if (!name) return
            setCustomer({ id: slug(phone || name) || newThread(), name })
            setSignIn(false)
          }}>
            <h2>Sign in</h2>
            <p className="muted">Your phone number keeps your cart, orders and preferences separate from other customers.</p>
            <label>Name<input name="name" required autoFocus /></label>
            <label>Phone<input name="phone" placeholder="03xx xxxxxxx" /></label>
            <div className="row"><button type="button" className="ghost" onClick={() => setSignIn(false)}>Cancel</button><button className="primary">Continue</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
