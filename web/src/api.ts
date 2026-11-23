export const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8000'

export type Product = {
  id: string; name: string; category: string; price: number; stock: number; description: string
  sizes: string; colors: string; rating: number; emoji: string; active?: boolean
}
export type OrderItem = { product_id: string; name: string; variant: string; qty: number; price: number }
export type Order = {
  id: string; user_id: string; status: string; total: number; subtotal: number; discount: number; shipping: number
  items: OrderItem[]; created_at: string; customer_name?: string; city?: string; address?: string; phone?: string
  payment_method?: string; coupon?: string | null
}
export type ToolCall = { name: string; args: Record<string, unknown> }
export type ChatReply = { reply: string; tool_calls: ToolCall[]; tokens: { in: number; out: number }; error?: string }

export async function get<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(API + path, { headers: token ? { 'X-Admin-Token': token } : {} })
  if (!res.ok) throw new Error(res.status === 401 ? 'Wrong admin password' : `Request failed (${res.status})`)
  return res.json() as Promise<T>
}

export async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Admin-Token': token } : {}) },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok && !(data as ChatReply).reply) throw new Error((data as { detail?: string }).detail ?? `Request failed (${res.status})`)
  return data as T
}

export const rs = (n: number) => `Rs ${n.toLocaleString('en-PK')}`
export const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
