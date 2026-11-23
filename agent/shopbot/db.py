"""Postgres access (Neon). One small connection pool per process, shared by our tables, the LangGraph
checkpointer (short-term memory) and the LangGraph store (long-term memory)."""
import atexit
import os
from contextlib import contextmanager

from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

load_dotenv()

_pool: ConnectionPool | None = None


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            os.environ["DATABASE_URL"],
            min_size=1,
            max_size=4,
            # prepare_threshold=None: Neon's pooler (PgBouncer) does not keep prepared statements
            kwargs={"autocommit": True, "prepare_threshold": None, "row_factory": dict_row},
            check=ConnectionPool.check_connection,  # Neon closes idle connections; test before use
            open=True,
        )
        atexit.register(_pool.close)
    return _pool


@contextmanager
def cursor():
    with pool().connection() as conn, conn.cursor() as cur:
        yield cur


def query(sql: str, params: tuple | dict = ()) -> list[dict]:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else []


def query_one(sql: str, params: tuple | dict = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None


SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price INTEGER NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    sizes TEXT NOT NULL DEFAULT '',
    colors TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    rating REAL NOT NULL DEFAULT 4.5,
    emoji TEXT NOT NULL DEFAULT '🛍️',
    active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS cart_items (
    user_id TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id),
    variant TEXT NOT NULL DEFAULT '',
    qty INTEGER NOT NULL CHECK (qty > 0),
    PRIMARY KEY (user_id, product_id, variant)
);
CREATE SEQUENCE IF NOT EXISTS order_seq START 10001;
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    items JSONB NOT NULL,
    subtotal INTEGER NOT NULL,
    discount INTEGER NOT NULL DEFAULT 0,
    shipping INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    coupon TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'Cash on delivery',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_user ON orders (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS customers (
    user_id TEXT PRIMARY KEY,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    messages INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS chat_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    message TEXT NOT NULL,
    reply TEXT NOT NULL,
    tool_calls JSONB NOT NULL DEFAULT '[]',
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    blocked TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_logs_time ON chat_logs (created_at DESC);
"""
