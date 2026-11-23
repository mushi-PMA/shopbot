"""The sales agent's tools. Every tool reads the customer from runtime.context (set by the API from the request),
never from a model argument, so one customer can never reach another customer's cart, orders or memory."""
import json
import re
from dataclasses import dataclass
from uuid import uuid4

from langchain.messages import HumanMessage, ToolMessage
from langchain.tools import ToolRuntime, tool

from shopbot import db
from shopbot.catalog import COUPONS, FREE_SHIPPING_FROM, PAYMENT_METHODS, POLICIES, SHIPPING_FEE


@dataclass
class ShopContext:
    """Who is talking. Comes from the API request body, never from the chat."""
    user_id: str = "demo-user"


def memory_namespace(user_id: str) -> tuple[str, ...]:
    return ("customers", user_id, "memories")


def money(amount: int) -> str:
    return f"Rs {amount:,}"


# ---------------------------------------------------------------- catalogue

@tool
def search_products(query: str = "", category: str = "", max_price: int = 0, min_price: int = 0) -> str:
    """Search the catalogue. query matches name, description and tags (e.g. 'gift', 'shawl', 'men').
    category is one of Clothing, Footwear, Accessories, Jewellery, Fragrance, Home, Electronics, Gifts.
    Prices are in PKR. Leave a filter empty or 0 to skip it."""
    words = [w for w in re.findall(r"[a-z0-9]+", query.lower()) if w not in {"a", "an", "the", "for", "and", "some", "any"}]
    rows = db.query("SELECT * FROM products WHERE active ORDER BY price")
    hits = []
    for p in rows:
        text = f"{p['name']} {p['description']} {p['tags']} {p['category']}".lower()
        if category and p["category"].lower() != category.lower():
            continue
        if max_price and p["price"] > max_price or min_price and p["price"] < min_price:
            continue
        score = sum(w.rstrip("s") in text for w in words)
        if words and score == 0:
            continue
        hits.append((score, p))
    hits.sort(key=lambda h: (-h[0], h[1]["price"]))
    if not hits:
        return "No products match. Try a broader search or another category."
    return "\n".join(
        f"{p['id']} | {p['name']} | {money(p['price'])} | "
        f"{'in stock: ' + str(p['stock']) if p['stock'] > 0 else 'OUT OF STOCK'}"
        f"{' | sizes ' + p['sizes'] if p['sizes'] else ''}{' | colours ' + p['colors'] if p['colors'] else ''}"
        for _, p in hits[:8])


@tool
def get_product(product_id: str) -> str:
    """Full details of one product by id (e.g. 'P01'): price, stock, sizes, colours, rating, description."""
    p = db.query_one("SELECT * FROM products WHERE id = %s AND active", (product_id.strip().upper(),))
    if not p:
        return f"No product with id {product_id}. Use search_products to find the id."
    return json.dumps({"id": p["id"], "name": p["name"], "category": p["category"], "price": money(p["price"]),
                       "stock": p["stock"], "sizes": p["sizes"] or "one size", "colours": p["colors"] or "n/a",
                       "rating": p["rating"], "description": p["description"]})


# ---------------------------------------------------------------- cart

def cart_lines(user_id: str) -> list[dict]:
    return db.query(
        "SELECT c.product_id, c.variant, c.qty, p.name, p.price, p.stock FROM cart_items c "
        "JOIN products p ON p.id = c.product_id WHERE c.user_id = %s ORDER BY p.name", (user_id,))


def describe_cart(user_id: str) -> str:
    lines = cart_lines(user_id)
    if not lines:
        return "The cart is empty."
    total = sum(item["price"] * item["qty"] for item in lines)
    body = "\n".join(f"{i['product_id']} | {i['name']}{' (' + i['variant'] + ')' if i['variant'] else ''} | "
                     f"qty {i['qty']} x {money(i['price'])}" for i in lines)
    return f"{body}\nSubtotal: {money(total)}"


@tool
def add_to_cart(product_id: str, runtime: ToolRuntime[ShopContext], quantity: int = 1, size: str = "",
                color: str = "") -> str:
    """Add a product to the customer's cart. size is required when the product has sizes."""
    p = db.query_one("SELECT * FROM products WHERE id = %s AND active", (product_id.strip().upper(),))
    if not p:
        return f"No product with id {product_id}."
    if quantity < 1 or quantity > 10:
        return "Quantity must be between 1 and 10."
    sizes = [s for s in p["sizes"].split(",") if s]
    colors = [c for c in p["colors"].split(",") if c]
    if sizes and size not in sizes:
        return f"Ask the customer for a size first. {p['name']} comes in sizes {', '.join(sizes)}."
    if color and colors and color.title() not in [c.title() for c in colors]:
        return f"{p['name']} comes in {', '.join(colors)}, not {color}."
    already = db.query_one("SELECT COALESCE(SUM(qty), 0) AS n FROM cart_items WHERE user_id = %s AND product_id = %s",
                           (runtime.context.user_id, p["id"]))["n"]
    if p["stock"] < quantity + already:
        return f"Sorry, only {p['stock']} of {p['name']} left in stock." if p["stock"] else f"{p['name']} is out of stock."
    variant = ", ".join(v for v in (size, color.title() if color else "") if v)
    db.query("INSERT INTO cart_items (user_id, product_id, variant, qty) VALUES (%s, %s, %s, %s) "
             "ON CONFLICT (user_id, product_id, variant) DO UPDATE SET qty = cart_items.qty + EXCLUDED.qty",
             (runtime.context.user_id, p["id"], variant, quantity))
    return f"Added {quantity} x {p['name']}{' (' + variant + ')' if variant else ''}.\n{describe_cart(runtime.context.user_id)}"


@tool
def view_cart(runtime: ToolRuntime[ShopContext]) -> str:
    """Show the customer's cart with the subtotal."""
    return describe_cart(runtime.context.user_id)


@tool
def remove_from_cart(product_id: str, runtime: ToolRuntime[ShopContext]) -> str:
    """Remove a product (all of its sizes and colours) from the customer's cart."""
    rows = db.query("DELETE FROM cart_items WHERE user_id = %s AND product_id = %s RETURNING product_id",
                    (runtime.context.user_id, product_id.strip().upper()))
    if not rows:
        return f"{product_id} is not in the cart."
    return f"Removed {product_id}.\n{describe_cart(runtime.context.user_id)}"


# ---------------------------------------------------------------- orders (risky actions need a confirmation)

YES = re.compile(r"^\s*(yes|yeah|yep|yup|y|sure|ok|okay|confirm(ed)?|go ahead|please do|do it|place it|"
                 r"cancel it|proceed|haan|han|ji|jee|correct|that's right|thats right)\b", re.I)


def confirmed_by_customer(runtime: ToolRuntime, tool_name: str) -> bool:
    """True only if the customer's latest message says yes AND the turn before it asked for this confirmation.
    The model cannot skip the question: the check reads the conversation, not a model argument."""
    messages = runtime.state["messages"]
    last_human = max((i for i, m in enumerate(messages) if isinstance(m, HumanMessage)), default=-1)
    if last_human < 0 or not YES.search(messages[last_human].text):
        return False
    asked = [m for m in messages[:last_human] if isinstance(m, ToolMessage) and m.name == tool_name]
    return bool(asked) and asked[-1].text.startswith("CONFIRMATION NEEDED")


def order_totals(lines: list[dict], coupon: str, user_id: str) -> tuple[int, int, int, str]:
    subtotal = sum(i["price"] * i["qty"] for i in lines)
    discount, note = 0, ""
    code = coupon.strip().upper()
    if code == "WELCOME10":
        if db.query_one("SELECT 1 FROM orders WHERE user_id = %s AND status <> 'cancelled'", (user_id,)):
            note, code = "WELCOME10 is for the first order only, so it was not applied.", ""
        else:
            discount = round(subtotal * 0.10)
    elif code and code not in COUPONS:
        note, code = f"Coupon {code} is not valid, so it was not applied.", ""
    shipping = 0 if code == "FREESHIP" or subtotal - discount >= FREE_SHIPPING_FROM else SHIPPING_FEE
    return subtotal, discount, shipping, note


@tool
def place_order(customer_name: str, address: str, city: str, runtime: ToolRuntime[ShopContext], phone: str = "",
                payment_method: str = "Cash on delivery", coupon: str = "") -> str:
    """Place an order for everything in the cart. RISKY: the first call only returns a summary that you must show
    the customer and ask them to confirm. Call again with the same details only after the customer says yes."""
    user = runtime.context.user_id
    lines = cart_lines(user)
    if not lines:
        return "The cart is empty. Add products before placing an order."
    for item in lines:
        if item["stock"] < item["qty"]:
            return f"Only {item['stock']} of {item['name']} left. Ask the customer to change the quantity."
    method = next((m for m in PAYMENT_METHODS if m.lower().split()[0] in payment_method.lower()), None)
    if not method:
        return f"We accept {', '.join(PAYMENT_METHODS)}. Ask the customer to choose one."
    if not customer_name.strip() or not address.strip() or not city.strip():
        return "Ask the customer for their name, delivery address and city."
    subtotal, discount, shipping, note = order_totals(lines, coupon, user)
    total = subtotal - discount + shipping
    applied = coupon.strip().upper() if coupon and not note else ""
    summary = (f"{describe_cart(user)}\nDiscount: {money(discount)}{' (' + applied + ')' if applied else ''}\n"
               f"Shipping: {money(shipping)}\nTotal: {money(total)}\nDeliver to: {customer_name}, {address}, {city}"
               f"{', phone ' + phone if phone else ''}\nPayment: {method}{chr(10) + note if note else ''}")
    if not confirmed_by_customer(runtime, "place_order"):
        return f"CONFIRMATION NEEDED. Nothing has been ordered yet. Show this and ask the customer to reply yes:\n{summary}"
    order_id = f"MB-{db.query_one('SELECT nextval(%s) AS n', ('order_seq',))['n']}"
    items = [{"product_id": i["product_id"], "name": i["name"], "variant": i["variant"], "qty": i["qty"],
              "price": i["price"]} for i in lines]
    with db.pool().connection() as conn, conn.transaction():
        for i in lines:
            updated = conn.execute("UPDATE products SET stock = stock - %s WHERE id = %s AND stock >= %s RETURNING id",
                                   (i["qty"], i["product_id"], i["qty"])).fetchone()
            if not updated:
                raise ValueError(f"{i['name']} sold out while ordering")
        conn.execute("INSERT INTO orders (id, user_id, items, subtotal, discount, shipping, total, coupon, customer_name, "
                     "phone, address, city, payment_method) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                     (order_id, user, json.dumps(items), subtotal, discount, shipping, total, applied or None,
                      customer_name.strip(), phone.strip(), address.strip(), city.strip(), method))
        conn.execute("DELETE FROM cart_items WHERE user_id = %s", (user,))
    return f"Order {order_id} placed. Total {money(total)}, {method}. Delivery in 2-6 working days."


@tool
def track_order(runtime: ToolRuntime[ShopContext], order_id: str = "") -> str:
    """Status of one of the customer's orders by id (e.g. 'MB-10001'), or their recent orders if no id is given."""
    user = runtime.context.user_id
    if order_id:
        rows = db.query("SELECT * FROM orders WHERE id = %s AND user_id = %s", (order_id.strip().upper(), user))
        if not rows:
            return f"No order {order_id} found for this customer."
    else:
        rows = db.query("SELECT * FROM orders WHERE user_id = %s ORDER BY created_at DESC LIMIT 5", (user,))
        if not rows:
            return "This customer has no orders yet."
    return "\n".join(f"{o['id']} | {o['status']} | {money(o['total'])} | {o['created_at']:%d %b %Y} | "
                     + ", ".join(f"{i['qty']} x {i['name']}" for i in o["items"]) for o in rows)


@tool
def cancel_order(order_id: str, runtime: ToolRuntime[ShopContext]) -> str:
    """Cancel one of the customer's orders that has not shipped. RISKY: the first call only asks for confirmation;
    call again after the customer says yes."""
    order = db.query_one("SELECT * FROM orders WHERE id = %s AND user_id = %s",
                         (order_id.strip().upper(), runtime.context.user_id))
    if not order:
        return f"No order {order_id} found for this customer."
    if order["status"] != "confirmed":
        return f"Order {order['id']} is {order['status']} and can no longer be cancelled. Offer a return instead."
    if not confirmed_by_customer(runtime, "cancel_order"):
        return (f"CONFIRMATION NEEDED. Nothing has been cancelled yet. Ask the customer to reply yes to cancel "
                f"order {order['id']} ({money(order['total'])}).")
    with db.pool().connection() as conn, conn.transaction():
        conn.execute("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = %s", (order["id"],))
        for i in order["items"]:
            conn.execute("UPDATE products SET stock = stock + %s WHERE id = %s", (i["qty"], i["product_id"]))
    return f"Order {order['id']} is cancelled. Nothing will be charged."


# ---------------------------------------------------------------- store info and long-term memory

@tool
def get_store_policy(topic: str) -> str:
    """Store policies. topic: shipping, returns, payment, cancellation, warranty, sizes, contact or coupons."""
    key = topic.lower().strip()
    hits = [text for name, text in POLICIES.items() if name in key or key in name or key in text.lower()]
    return "\n".join(hits) if hits else "\n".join(POLICIES.values())


@tool
def remember_customer_fact(fact: str, runtime: ToolRuntime[ShopContext]) -> str:
    """Save a lasting fact about this customer for future chats: name, city, address, sizes, preferences, budget,
    gift occasions. Keep each fact short, e.g. 'shoe size 42' or 'lives in Karachi'."""
    fact = fact.strip()[:200]
    if not fact:
        return "Nothing to remember."
    runtime.store.put(memory_namespace(runtime.context.user_id), str(uuid4()), {"fact": fact})
    return f"Remembered: {fact}"


TOOLS = [search_products, get_product, add_to_cart, view_cart, remove_from_cart, place_order, track_order,
         cancel_order, get_store_policy, remember_customer_fact]
