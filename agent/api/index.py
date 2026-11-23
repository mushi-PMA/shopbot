"""ShopBot Agent API (FastAPI). Graded endpoints: POST /chat and GET /health (open, no login).
The website also reads the catalogue and the customer's own cart and orders here, and the admin dashboard uses
the /admin routes, which need the X-Admin-Token header."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # make the shopbot package importable on Vercel

from fastapi import FastAPI, Header, HTTPException, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse, PlainTextResponse  # noqa: E402

from shopbot import db  # noqa: E402
from shopbot.agent import MODEL, graph, run_turn  # noqa: E402
from shopbot.catalog import STORE_NAME  # noqa: E402
from shopbot.tools import memory_namespace  # noqa: E402

app = FastAPI(title="ShopBot Agent API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

MAX_ID, MAX_MESSAGE = 128, 4000
PRICE_IN, PRICE_OUT = 0.10 / 1e6, 0.50 / 1e6  # claude-haiku-5-5, USD per token


def bad_request(text: str) -> JSONResponse:
    return JSONResponse({"reply": text, "tool_calls": [], "tokens": {"in": 0, "out": 0}, "error": text},
                        status_code=400)


@app.get("/health", response_class=PlainTextResponse)
def health() -> str:
    return "ok"


@app.get("/")
def root() -> dict:
    return {"name": f"ShopBot Agent API ({STORE_NAME})", "model": MODEL,
            "endpoints": ["POST /chat", "GET /health", "GET /products"]}


@app.post("/chat")
async def chat(request: Request):
    try:
        body = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return bad_request("Send JSON: {\"user_id\": \"...\", \"thread_id\": \"...\", \"message\": \"...\"}")
    if not isinstance(body, dict):
        return bad_request("The body must be a JSON object.")
    user_id = str(body.get("user_id") or "").strip()
    thread_id = str(body.get("thread_id") or "").strip() or "default"
    message = body.get("message")
    if not user_id or len(user_id) > MAX_ID or len(thread_id) > MAX_ID:
        return bad_request("user_id is required (at most 128 characters).")
    if not isinstance(message, str) or not message.strip():
        return bad_request("message is required.")
    if len(message) > MAX_MESSAGE:
        return bad_request("The message is too long. Please keep it under 4000 characters.")
    result = await run_in_thread(run_turn, user_id, thread_id, message.strip())
    log = result.pop("_log")
    try:
        db.query("INSERT INTO chat_logs (user_id, thread_id, message, reply, tool_calls, tokens_in, tokens_out, "
                 "latency_ms, blocked, error) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                 (user_id, thread_id, message[:2000], result["reply"][:4000], json.dumps(result["tool_calls"]),
                  result["tokens"]["in"], result["tokens"]["out"], log["latency_ms"], log["blocked"], log["error"]))
        db.query("INSERT INTO customers (user_id) VALUES (%s) ON CONFLICT (user_id) DO UPDATE "
                 "SET last_seen = now(), messages = customers.messages + 1", (user_id,))
    except Exception:  # logging must never break the chat
        pass
    return result


async def run_in_thread(fn, *args):
    from starlette.concurrency import run_in_threadpool
    return await run_in_threadpool(fn, *args)


# ---------------------------------------------------------------- website (customer side)

@app.get("/products")
def products() -> list[dict]:
    return db.query("SELECT id, name, category, price, stock, description, sizes, colors, rating, emoji "
                    "FROM products WHERE active ORDER BY category, price")


@app.get("/customer/{user_id}")
def customer(user_id: str) -> dict:
    """One customer's own cart, orders and remembered facts (the website shows these to that customer)."""
    cart = db.query("SELECT c.product_id, c.variant, c.qty, p.name, p.price, p.emoji FROM cart_items c "
                    "JOIN products p ON p.id = c.product_id WHERE c.user_id = %s ORDER BY p.name", (user_id,))
    orders = db.query("SELECT id, status, total, items, created_at FROM orders WHERE user_id = %s "
                      "ORDER BY created_at DESC LIMIT 20", (user_id,))
    memories = [i.value["fact"] for i in graph().store.search(memory_namespace(user_id), limit=50)]
    return {"cart": cart, "orders": orders, "memories": memories}


@app.get("/thread/{user_id}/{thread_id}")
def thread(user_id: str, thread_id: str) -> list[dict]:
    """The visible messages of one of this customer's conversations, to restore the chat window."""
    state = graph().get_state({"configurable": {"thread_id": f"{user_id}::{thread_id}"}})
    messages = state.values.get("messages", []) if state and state.values else []
    return [{"role": "user" if m.type == "human" else "assistant", "text": m.text}
            for m in messages if m.type in ("human", "ai") and m.text.strip()]


# ---------------------------------------------------------------- admin dashboard

def require_admin(token: str | None) -> None:
    if not token or token != os.environ.get("ADMIN_TOKEN"):
        raise HTTPException(401, "Admin token required")


@app.get("/admin/overview")
def admin_overview(x_admin_token: str | None = Header(None)) -> dict:
    require_admin(x_admin_token)
    orders = db.query_one("SELECT COUNT(*) AS n, COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0) AS revenue, "
                          "COUNT(*) FILTER (WHERE status = 'confirmed') AS to_ship FROM orders")
    chats = db.query_one("SELECT COUNT(*) AS messages, COUNT(DISTINCT user_id) AS customers, "
                         "COUNT(DISTINCT user_id || thread_id) AS conversations, COALESCE(SUM(tokens_in), 0) AS tin, "
                         "COALESCE(SUM(tokens_out), 0) AS tout, COUNT(*) FILTER (WHERE blocked IS NOT NULL) AS blocked, "
                         "COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms), 0) AS p50, "
                         "COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) AS p95 FROM chat_logs")
    low_stock = db.query("SELECT id, name, stock FROM products WHERE active AND stock <= 5 ORDER BY stock")
    tools = db.query("SELECT t->>'name' AS name, COUNT(*) AS n FROM chat_logs, jsonb_array_elements(tool_calls) t "
                     "GROUP BY 1 ORDER BY 2 DESC")
    daily = db.query("SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS messages FROM chat_logs "
                     "GROUP BY 1 ORDER BY 1 DESC LIMIT 14")
    cost = chats["tin"] * PRICE_IN + chats["tout"] * PRICE_OUT
    return {"orders": orders["n"], "revenue": orders["revenue"], "to_ship": orders["to_ship"],
            "messages": chats["messages"], "customers": chats["customers"], "conversations": chats["conversations"],
            "tokens_in": chats["tin"], "tokens_out": chats["tout"], "cost_usd": round(cost, 4),
            "blocked": chats["blocked"], "latency_p50_ms": round(chats["p50"]), "latency_p95_ms": round(chats["p95"]),
            "low_stock": low_stock, "tool_usage": tools, "daily": daily[::-1], "model": MODEL}


@app.get("/admin/orders")
def admin_orders(x_admin_token: str | None = Header(None)) -> list[dict]:
    require_admin(x_admin_token)
    return db.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200")


@app.post("/admin/orders/{order_id}/status")
async def admin_order_status(order_id: str, request: Request, x_admin_token: str | None = Header(None)) -> dict:
    require_admin(x_admin_token)
    status = (await request.json()).get("status")
    if status not in ("confirmed", "shipped", "delivered", "cancelled"):
        raise HTTPException(400, "status must be confirmed, shipped, delivered or cancelled")
    row = db.query_one("UPDATE orders SET status = %s, updated_at = now() WHERE id = %s RETURNING id, status",
                       (status, order_id))
    if not row:
        raise HTTPException(404, "No such order")
    return row


@app.get("/admin/products")
def admin_products(x_admin_token: str | None = Header(None)) -> list[dict]:
    require_admin(x_admin_token)
    return db.query("SELECT * FROM products ORDER BY id")


@app.post("/admin/products/{product_id}")
async def admin_update_product(product_id: str, request: Request, x_admin_token: str | None = Header(None)) -> dict:
    require_admin(x_admin_token)
    body = await request.json()
    fields = {k: body[k] for k in ("price", "stock", "active") if k in body}
    if not fields:
        raise HTTPException(400, "Send price, stock or active")
    sets = ", ".join(f"{k} = %({k})s" for k in fields)
    row = db.query_one(f"UPDATE products SET {sets} WHERE id = %(id)s RETURNING *", {**fields, "id": product_id})
    if not row:
        raise HTTPException(404, "No such product")
    return row


@app.get("/admin/customers")
def admin_customers(x_admin_token: str | None = Header(None)) -> list[dict]:
    require_admin(x_admin_token)
    rows = db.query("SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.user_id = c.user_id) AS orders, "
                    "(SELECT COALESCE(SUM(total), 0) FROM orders o WHERE o.user_id = c.user_id AND status <> 'cancelled') AS spent "
                    "FROM customers c ORDER BY last_seen DESC LIMIT 200")
    store = graph().store
    for row in rows:
        row["memories"] = [i.value["fact"] for i in store.search(memory_namespace(row["user_id"]), limit=20)]
    return rows


@app.get("/admin/conversations")
def admin_conversations(x_admin_token: str | None = Header(None)) -> list[dict]:
    require_admin(x_admin_token)
    return db.query("SELECT * FROM chat_logs ORDER BY created_at DESC LIMIT 200")
