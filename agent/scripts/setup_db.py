"""Create the tables (ours and LangGraph's memory tables) and load the demo catalogue.
Usage (from agent/): python -m scripts.setup_db [--reset]
--reset also clears carts, orders, chat logs and all memory (use before a fresh demo)."""
import sys

from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.store.postgres import PostgresStore

from shopbot import db
from shopbot.catalog import PRODUCTS


def main() -> None:
    db.query(db.SCHEMA)
    PostgresSaver(db.pool()).setup()
    PostgresStore(db.pool()).setup()
    if "--reset" in sys.argv:
        db.query("TRUNCATE cart_items, orders, chat_logs, customers, checkpoints, checkpoint_blobs, "
                 "checkpoint_writes, store")
        db.query("ALTER SEQUENCE order_seq RESTART WITH 10001")
    for p in PRODUCTS:
        db.query("INSERT INTO products (id, name, category, price, stock, description, sizes, colors, tags, rating, emoji) "
                 "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "
                 "category = EXCLUDED.category, price = EXCLUDED.price, stock = EXCLUDED.stock, "
                 "description = EXCLUDED.description, sizes = EXCLUDED.sizes, colors = EXCLUDED.colors, "
                 "tags = EXCLUDED.tags, rating = EXCLUDED.rating, emoji = EXCLUDED.emoji, active = TRUE", p)
    print("tables ready,", db.query_one("SELECT COUNT(*) AS n FROM products")["n"], "products")


if __name__ == "__main__":
    main()
