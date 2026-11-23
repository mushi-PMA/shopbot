import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chat } from './Chat'
import { get, rs, when, type Order, type Product } from './api'

type Customer = { id: string; name: string }
type CartLine = { product_id: string; variant: string; qty: number; name: string; price: number }
type Mine = { cart: CartLine[]; orders: Order[]; memories: string[] }

const DEMO: Customer[] = [{ id: 'ali-sargodha', name: 'Ali' }, { id: 'sana-lahore', name: 'Sana' }]
const SHIPPING = 250
const FREE_FROM = 5000
const newThread = () => `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const initials = (name: string) => name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join('')

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return fallback }
}

const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
const BagIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7h12l1 13H5L6 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
const Chevron = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>

export function Store() {
  const [customer, setCustomer] = useState<Customer>(() => load('mb_customer', DEMO[0]))
  const [threadId, setThreadId] = useState(() => localStorage.getItem(`mb_thread_${customer.id}`) ?? newThread())
  const [products, setProducts] = useState<Product[]>([])
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [mine, setMine] = useState<Mine | null>(null)
  const [tab, setTab] = useState<'chat' | 'cart'>('chat')
  const [prefill, setPrefill] = useState('')
  const [menu, setMenu] = useState(false)
  const [signIn, setSignIn] = useState(false)
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { get<Product[]>('/products').then(setProducts).catch(() => setError('The shop is starting up. Please refresh in a moment.')) }, [])
  useEffect(() => {
    localStorage.setItem('mb_customer', JSON.stringify(customer))
    const id = localStorage.getItem(`mb_thread_${customer.id}`) ?? newThread()
    localStorage.setItem(`mb_thread_${customer.id}`, id)
    setThreadId(id)
  }, [customer])
  const refresh = useCallback(() => {
    get<Mine>(`/customer/${encodeURIComponent(customer.id)}`).then(setMine).catch(() => {})
    get<Product[]>('/products').then(setProducts).catch(() => {})
  }, [customer.id])
  useEffect(refresh, [refresh])
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [menu])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t) } }, [toast])

  const categories = useMemo(() => ['All', ...new Set(products.map((p) => p.category))], [products])
  const shown = products.filter((p) => (category === 'All' || p.category === category) &&
    `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(query.trim().toLowerCase()))
  const cartCount = mine?.cart.reduce((n, i) => n + i.qty, 0) ?? 0
  const subtotal = mine?.cart.reduce((n, i) => n + i.price * i.qty, 0) ?? 0
  const delivery = subtotal >= FREE_FROM || subtotal === 0 ? 0 : SHIPPING

  function openPanel(next: 'chat' | 'cart') {
    setTab(next)
    if (window.matchMedia('(max-width: 1000px)').matches) document.getElementById('assistant')?.scrollIntoView({ behavior: 'smooth' })
  }
  function startNewThread() {
    const id = newThread()
    localStorage.setItem(`mb_thread_${customer.id}`, id)
    setThreadId(id)
  }
  function ask(p: Product) {
    setPrefill(`Tell me about ${p.name} (${p.id})${p.sizes ? ' and which sizes you have' : ''}`)
    openPanel('chat')
  }
  function switchTo(c: Customer) { setCustomer(c); setMenu(false) }

  return (
    <div className="store">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/" aria-label="Malik Brothers home">
            <span className="brand-name">Malik<span className="brand-dot" aria-hidden="true" />Brothers</span>
            <span className="brand-sub">Sargodha</span>
          </a>
          <div className="search-box" role="search">
            <SearchIcon />
            <label htmlFor="search" className="sr-only">Search products</label>
            <input id="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search kurtas, shawls, gifts…" />
          </div>
          <div className="top-actions">
            <button type="button" className="icon-btn" onClick={() => { openPanel('cart'); refresh() }} aria-label={`Cart, ${cartCount} items`}>
              <BagIcon /><span className="who-name">Cart</span>
              {cartCount > 0 && <span className="badge-count">{cartCount}</span>}
            </button>
            <div className="account" ref={menuRef}>
              <button type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                <span className="avatar" aria-hidden="true">{customer.name.slice(0, 1).toUpperCase()}</span>
                <span className="who-name">{customer.name}</span><Chevron />
              </button>
              {menu && (
                <div className="menu" role="menu">
                  <span className="menu-label">Signed in as {customer.name}</span>
                  {DEMO.filter((c) => c.id !== customer.id).map((c) => (
                    <button key={c.id} role="menuitem" type="button" onClick={() => switchTo(c)}>Switch to {c.name}</button>
                  ))}
                  <button role="menuitem" type="button" onClick={() => { setMenu(false); setSignIn(true) }}>Sign in with your phone…</button>
                  <hr />
                  <a role="menuitem" href="/admin">Seller dashboard</a>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="hero">
        <h1>Everyday things, chosen with care.</h1>
        <p className="lead">Clothing, footwear, home and gifts from our family shop in Sargodha. Ask the assistant anything: it checks live stock and places your order when you say yes.</p>
        <ul className="facts">
          <li>Delivery Rs 250, free over Rs 5,000</li>
          <li>Free pickup in Sargodha</li>
          <li>7-day returns</li>
          <li>Cash on delivery</li>
        </ul>
      </section>

      <main className="layout">
        <section aria-label="Products">
          <div className="cat-tabs">
            <div className="tabs-row" role="tablist" aria-label="Categories">
              {categories.map((c) => (
                <button key={c} role="tab" type="button" aria-selected={c === category} onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>
            <span className="count-note">{shown.length} {shown.length === 1 ? 'item' : 'items'}</span>
          </div>
          {error && <p className="notice" role="alert">{error}</p>}
          {products.length > 0 && shown.length === 0 && (
            <div className="empty">
              <p>No products match “{query}”.</p>
              <button type="button" className="secondary" onClick={() => { setQuery(''); setCategory('All') }}>Clear search</button>
            </div>
          )}
          <div className="grid">
            {shown.map((p) => {
              const sizes = p.sizes ? p.sizes.split(',').length : 0
              const colours = p.colors ? p.colors.split(',').length : 0
              const meta = p.stock === 0 ? 'Sold out' : p.stock <= 5 ? `Only ${p.stock} left`
                : [sizes > 1 && `${sizes} sizes`, colours > 1 && `${colours} colours`].filter(Boolean).join(' · ')
              return (
                <article key={p.id} className={`card ${p.stock === 0 ? 'out' : ''}`}>
                  <div className={`tile t-${p.category.toLowerCase()}`} aria-hidden="true">{initials(p.name)}</div>
                  <h3>{p.name}</h3>
                  <div className="price-row">
                    <span className="price">{rs(p.price)}</span>
                    {meta && <span className={`meta ${p.stock === 0 ? 'out' : p.stock <= 5 ? 'low' : ''}`}>{meta}</span>}
                  </div>
                  <button type="button" className="text-btn" onClick={() => ask(p)}>Ask about this<span className="sr-only"> {p.name}</span></button>
                </article>
              )
            })}
          </div>
        </section>

        <aside className="side" id="assistant" aria-label="Assistant and cart">
          <div className="panel-tabs" role="tablist">
            <button role="tab" type="button" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>Assistant</button>
            <button role="tab" type="button" aria-selected={tab === 'cart'} onClick={() => { setTab('cart'); refresh() }}>
              Cart & orders{cartCount > 0 ? ` · ${cartCount}` : ''}
            </button>
          </div>
          {tab === 'chat' ? (
            <Chat userId={customer.id} threadId={threadId} onNewThread={startNewThread} onActivity={refresh} prefill={prefill}
              onOrder={(id) => setToast(`Order ${id} placed. You can follow it under Cart & orders.`)} />
          ) : (
            <div className="cart-panel">
              <section className="cart-section">
                <h2>Cart</h2>
                {!mine?.cart.length ? <p className="muted">Your cart is empty. Ask the assistant to add something.</p> : (
                  <>
                    <ul className="lines">
                      {mine.cart.map((i) => (
                        <li key={i.product_id + i.variant}>
                          <span className="mini-tile" aria-hidden="true">{initials(i.name)}</span>
                          <span>{i.name}<small>{[i.variant, `Qty ${i.qty}`].filter(Boolean).join(' · ')}</small></span>
                          <span className="num">{rs(i.price * i.qty)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="sums">
                      <div><span>Subtotal</span><span className="num">{rs(subtotal)}</span></div>
                      <div><span>Delivery</span><span className="num">{delivery ? rs(delivery) : 'Free'}</span></div>
                      <div className="total"><span>Total</span><strong>{rs(subtotal + delivery)}</strong></div>
                    </div>
                    <button type="button" className="primary full checkout" onClick={() => { setTab('chat'); setPrefill('Please place my order. Deliver to ') }}>
                      Check out with the assistant
                    </button>
                  </>
                )}
              </section>
              <section className="cart-section">
                <h2>Orders</h2>
                {!mine?.orders.length ? <p className="muted">No orders yet.</p> : mine.orders.map((o) => (
                  <div key={o.id} className="order">
                    <div className="order-top"><strong className="id">{o.id}</strong><span className={`status s-${o.status}`}>{o.status}</span></div>
                    <div>{o.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</div>
                    <small>{when(o.created_at)} · {rs(o.total)}</small>
                  </div>
                ))}
              </section>
              <section className="cart-section">
                <details className="memory" open={Boolean(mine?.memories.length)}>
                  <summary>What the assistant remembers about you</summary>
                  {!mine?.memories.length ? <p className="muted">Nothing yet. Tell it your size, city or what you like.</p> : (
                    <ul>{mine.memories.map((m) => <li key={m}>{m}</li>)}</ul>
                  )}
                </details>
              </section>
            </div>
          )}
        </aside>
      </main>

      <footer className="foot">
        <div className="foot-inner">
          <div><strong>Malik Brothers</strong>A family-run shop in Sargodha, Punjab.</div>
          <div><strong>Questions</strong>Ask the assistant any time, day or night.</div>
          <div><strong>For the shop</strong><a href="/admin">Seller dashboard</a></div>
        </div>
      </footer>

      <a className="chat-fab" href="#assistant" onClick={() => setTab('chat')}>Chat with us</a>
      {toast && <div className="toast" role="status">{toast}</div>}

      {signIn && (
        <div className="modal-bg" onClick={() => setSignIn(false)} onKeyDown={(e) => e.key === 'Escape' && setSignIn(false)}>
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="signin-title" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault()
            const data = new FormData(e.currentTarget)
            const name = String(data.get('name') ?? '').trim()
            const phone = String(data.get('phone') ?? '').replace(/\D/g, '')
            if (!name) return
            switchTo({ id: slug(phone || name) || newThread(), name })
            setSignIn(false)
          }}>
            <h2 id="signin-title">Sign in</h2>
            <p className="muted">Your phone number keeps your cart, orders and preferences yours.</p>
            <label>Name<input name="name" required autoFocus autoComplete="name" /></label>
            <label>Phone<input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="03xx xxxxxxx" /></label>
            <div className="row"><button type="button" className="secondary" onClick={() => setSignIn(false)}>Cancel</button><button className="primary">Continue</button></div>
          </form>
        </div>
      )}
    </div>
  )
}
