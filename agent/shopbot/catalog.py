"""Demo store data: Malik Brothers, a family-run lifestyle shop in Sargodha. Seeded into Postgres by scripts/setup_db.py."""

STORE_NAME = "Malik Brothers"

# id, name, category, price (PKR), stock, description, sizes, colors, tags, rating, emoji
PRODUCTS = [
    ("P01", "Embroidered Cotton Kurta", "Clothing", 3200, 25,
     "Breathable cotton kurta with hand embroidery on the neckline. Machine washable.",
     "S,M,L,XL", "White,Sky Blue", "men eid summer casual", 4.6, "👘"),
    ("P02", "Khaddar Winter Shawl", "Clothing", 4500, 12,
     "Warm hand-loomed khaddar shawl, 2.5 m long. Ideal gift for winter.",
     "", "Maroon,Grey", "women men winter gift warm", 4.8, "🧣"),
    ("P03", "Lawn 3-Piece Suit", "Clothing", 5800, 8,
     "Printed lawn shirt, dupatta and trouser. Unstitched, 3 metres of fabric.",
     "S,M,L", "Mint,Peach", "women summer eid", 4.5, "👗"),
    ("P04", "Peshawari Chappal", "Footwear", 3900, 15,
     "Handmade leather Peshawari chappal with a cushioned sole.",
     "40,41,42,43,44,45", "Brown,Black", "men leather traditional", 4.7, "🩴"),
    ("P05", "Embroidered Khussa Flats", "Footwear", 2400, 20,
     "Soft khussa flats with tilla embroidery. Comfortable for weddings and eid.",
     "36,37,38,39,40,41", "Gold,Silver", "women wedding eid", 4.4, "🥿"),
    ("P06", "Everyday Running Sneakers", "Footwear", 6500, 0,
     "Lightweight mesh running shoes with a grippy sole.",
     "39,40,41,42,43,44,45", "Black,White", "sports gym running", 4.3, "👟"),
    ("P07", "Leather Bifold Wallet", "Accessories", 1800, 40,
     "Genuine cowhide wallet with 6 card slots and a coin pocket.",
     "", "Brown,Black", "men gift leather", 4.6, "👛"),
    ("P08", "Handwoven Tote Bag", "Accessories", 2200, 18,
     "Sturdy handwoven tote with an inner zip pocket. Fits a 14-inch laptop.",
     "", "Natural,Indigo", "women bag eco", 4.5, "👜"),
    ("P09", "Silver Jhumka Earrings", "Jewellery", 2900, 10,
     "Oxidised silver jhumkas, lightweight, with a secure hook.",
     "", "Silver", "women gift wedding", 4.7, "💍"),
    ("P10", "Oud Attar 12 ml", "Fragrance", 1500, 30,
     "Alcohol-free oud attar with a long-lasting woody scent.",
     "", "", "men women gift perfume", 4.6, "🧴"),
    ("P11", "Rose & Sandalwood Candle", "Home", 1200, 35,
     "Soy wax candle, 40 hours burn time, in a reusable glass jar.",
     "", "", "home gift decor", 4.5, "🕯️"),
    ("P12", "Truck-Art Ceramic Mug", "Home", 900, 50,
     "Hand-painted truck-art mug, 350 ml, dishwasher safe.",
     "", "Multicolour", "home gift kitchen", 4.4, "☕"),
    ("P13", "Ajrak Cushion Covers (set of 2)", "Home", 1600, 22,
     "Block-printed ajrak cotton covers, 18 x 18 inch, with hidden zips.",
     "", "Indigo,Red", "home decor", 4.5, "🛋️"),
    ("P14", "Wireless Earbuds Pro", "Electronics", 7900, 6,
     "Noise-cancelling earbuds with 30 hours of battery and a 6-month warranty.",
     "", "Black,White", "music gadget gift", 4.2, "🎧"),
    ("P15", "Power Bank 10,000 mAh", "Electronics", 3400, 14,
     "Slim power bank with USB-C fast charging and a 6-month warranty.",
     "", "Black", "gadget travel", 4.3, "🔋"),
    ("P16", "Chai & Treats Gift Box", "Gifts", 2600, 9,
     "Karak chai mix, honey, dry fruit and biscuits in a keepsake box.",
     "", "", "gift food eid", 4.8, "🎁"),
]

POLICIES = {
    "shipping": "Shipping: Rs 250 flat anywhere in Pakistan, free on orders of Rs 5,000 or more (after discount). "
                "Delivery takes 1-2 working days in Sargodha, 2-3 in Lahore, Islamabad, Faisalabad and Karachi, and 4-6 elsewhere. Free pickup from the shop in Sargodha. "
                "Every order gets a tracking update in chat.",
    "returns": "Returns and exchanges: within 7 days of delivery for unused items with tags. "
               "Earrings, attar and gift boxes cannot be returned for hygiene reasons. "
               "Refunds go back to the original payment method within 5 working days; cash on delivery refunds go by bank transfer.",
    "payment": "Payment: cash on delivery, bank transfer, JazzCash or Easypaisa. Card payments are not taken in chat.",
    "cancellation": "Cancellation: an order can be cancelled free of charge until it is shipped. Shipped orders can be returned instead.",
    "warranty": "Warranty: electronics (earbuds, power bank) have a 6-month replacement warranty against manufacturing faults.",
    "sizes": "Sizes: kurtas and suits come in S (chest 36 in), M (38 in), L (40 in), XL (42 in). "
             "Footwear uses EU sizes; if between sizes, choose the larger one.",
    "contact": "Contact: ask in this chat any time, or visit the shop in Sargodha, Monday to Saturday, 10 am to 8 pm. "
               "For an existing order, the shop calls the phone number given with the order.",
    "coupons": "Coupons: WELCOME10 gives 10% off a customer's first order. FREESHIP gives free shipping on any order. "
               "Only one coupon per order.",
}

SHIPPING_FEE = 250
FREE_SHIPPING_FROM = 5000
COUPONS = {"WELCOME10": "10% off your first order", "FREESHIP": "free shipping"}
PAYMENT_METHODS = ["Cash on delivery", "Bank transfer", "JazzCash", "Easypaisa"]
