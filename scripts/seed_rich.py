#!/usr/bin/env python3
"""
Enrich Custom Canvas staging with photographic listing images and a fully
populated buyer account (follows, saves, orders, commissions with threads +
progress updates, reviews, notifications) plus follower counts on artists.

    python3 scripts/seed_rich.py        # reads keys from .env.local

Re-runnable: it replaces listing images and rebuilds buyer.test's transactional
data each run. Real photos come from picsum.photos (placeholders, not real art).
"""
import io, json, os, sys, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

def load_env():
    env = dict(os.environ)
    try:
        with open(os.path.join(os.path.dirname(__file__), "..", ".env.local")) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1); env.setdefault(k, v)
    except FileNotFoundError: pass
    return env

ENV = load_env()
URL = ENV["NEXT_PUBLIC_SUPABASE_URL"]; SVC = ENV["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "application/json"}
BUYER_EMAIL = "buyer.test@customcanvas.dev"

def req(method, path, body=None, headers=None, raw=False):
    data = body if raw else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(f"{URL}{path}", data=data, method=method, headers=headers or H)
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read().decode(); return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:300]}")

def insert(table, rows):
    return req("POST", f"/rest/v1/{table}", rows, headers={**H, "Prefer": "return=representation"})

def iso(days_ago=0, hours_ago=0):
    return (datetime.now(timezone.utc) - timedelta(days=days_ago, hours=hours_ago)).isoformat()

def split(price, shipping):
    commission = round(price * 0.15)
    return dict(amount_cents=price, platform_fee_cents=commission + 1000,
                artist_payout_cents=price - commission + shipping,
                buyer_fee_cents=1000, shipping_cents=shipping)

def upload_photo(seed, path):
    src = f"https://picsum.photos/seed/{seed}/800/1000"
    with urllib.request.urlopen(urllib.request.Request(src, headers={"User-Agent": "seed"})) as r:
        data = r.read()
    req("POST", f"/storage/v1/object/listing-images/{path}", data, raw=True,
        headers={"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "image/jpeg", "x-upsert": "true"})
    return f"{URL}/storage/v1/object/public/listing-images/{path}"

def main():
    buyer = req("GET", f"/rest/v1/profiles?email=eq.{BUYER_EMAIL}&select=id")
    if not buyer: sys.exit(f"{BUYER_EMAIL} not found — run seed_demo.py first")
    buyer_id = buyer[0]["id"]

    artists = req("GET", "/rest/v1/artist_profiles?select=id,slug,display_name,profile_id&is_live=eq.true")
    by_slug = {a["slug"]: a for a in artists}
    listings = req("GET", "/rest/v1/listings?select=id,artist_id,title,price_cents,shipping_rate_cents&order=created_at.asc")
    print(f"buyer={buyer_id[:8]}  artists={len(artists)}  listings={len(listings)}")

    # 1) Replace every listing image with a photographic one.
    print("Re-imaging listings…")
    for i, l in enumerate(listings):
        url = upload_photo(1000 + i, f"rich/{l['id']}.jpg")
        req("DELETE", f"/rest/v1/listing_images?listing_id=eq.{l['id']}")
        insert("listing_images", {"listing_id": l["id"], "image_url": url, "display_order": 0, "is_primary": True})
    print(f"  re-imaged {len(listings)}")

    # 2) Reset buyer transactional data.
    print("Resetting buyer data…")
    for path in [
        f"/rest/v1/orders?buyer_id=eq.{buyer_id}",
        f"/rest/v1/commissions?requester_id=eq.{buyer_id}",
        f"/rest/v1/follows?follower_id=eq.{buyer_id}",
        f"/rest/v1/saved_listings?profile_id=eq.{buyer_id}",
        f"/rest/v1/notifications?user_id=eq.{buyer_id}",
        f"/rest/v1/conversations?or=(participant_one.eq.{buyer_id},participant_two.eq.{buyer_id})",
    ]:
        req("DELETE", path)

    # Listings that already hold a live order (from a prior seed) — avoid them
    # so the one-live-order-per-listing constraint doesn't trip.
    live_orders = req("GET", "/rest/v1/orders?status=in.(paid,shipped,delivered)&select=listing_id")
    live_listing_ids = {o["listing_id"] for o in (live_orders or []) if o.get("listing_id")}

    def artist_listings(slug):
        a = by_slug[slug]
        return [l for l in listings if l["artist_id"] == a["id"]]

    def free_listing(slug):
        for l in artist_listings(slug):
            if l["id"] not in live_listing_ids:
                live_listing_ids.add(l["id"]); return l
        return None

    # 3) Follows + saves.
    follow_slugs = [s for s in ["ada-rivera", "lena-park", "diego-soto", "marcus-bell"] if s in by_slug]
    for s in follow_slugs:
        insert("follows", {"follower_id": buyer_id, "artist_id": by_slug[s]["id"], "created_at": iso(days_ago=5)})
    saved = listings[:6]
    for l in saved:
        insert("saved_listings", {"profile_id": buyer_id, "listing_id": l["id"], "created_at": iso(days_ago=3)})
    print(f"  follows={len(follow_slugs)} saves={len(saved)}")

    # 4) Orders: delivered (+review), shipped (+tracking), paid (cancellable).
    def make_order(slug, status, days, **extra):
        a = by_slug[slug]; l = free_listing(slug)
        if not l: return None
        sh = l.get("shipping_rate_cents") or 0
        row = {"listing_id": l["id"], "buyer_id": buyer_id, "artist_id": a["id"],
               "status": status, "stripe_payment_intent_id": f"pi_seed_{slug}_{status}",
               "created_at": iso(days_ago=days), **split(l["price_cents"], sh), **extra}
        return insert("orders", row)[0], l, a

    addr = {"street": "1100 Westheimer Rd", "city": "Houston", "state": "TX", "zip": "77006", "country": "US"}
    d = make_order("ada-rivera", "delivered", 20, shipping_address=addr, delivered_at=iso(days_ago=10))
    if d:
        order, l, a = d
        req("PATCH", f"/rest/v1/listings?id=eq.{l['id']}", {"status": "sold", "sold_price_cents": l["price_cents"], "show_sold_price": True})
        insert("reviews", {"order_id": order["id"], "reviewer_id": buyer_id, "rating": 5,
                           "comment": "Absolutely stunning in person — the color is even richer than the photos. Shipped beautifully packed."})
    make_order("diego-soto", "shipped", 4, shipping_address=addr, tracking_number="9400 1000 0000 0000 0000 00")
    make_order("marcus-bell", "paid", 1, shipping_address=addr)
    print("  orders=3 (delivered+review, shipped, paid)")

    # 5) Commissions with threads.
    def make_convo(slug, last_text, last_days):
        a = by_slug[slug]
        conv = insert("conversations", {"participant_one": buyer_id, "participant_two": a["profile_id"],
            "context_type": "commission", "last_message_text": last_text, "last_message_at": iso(days_ago=last_days)})[0]
        return conv, a

    def msg(conv_id, sender, content, days, mtype="text"):
        insert("messages", {"conversation_id": conv_id, "sender_id": sender, "content": content,
                            "message_type": mtype, "is_read": True, "created_at": iso(days_ago=days)})

    def make_commission(slug, status, title, desc, bmin, bmax, days, **extra):
        conv, a = make_convo(slug, title, days)
        c = insert("commissions", {"artist_id": a["id"], "requester_id": buyer_id, "conversation_id": conv["id"],
            "title": title, "description": desc, "budget_min_cents": bmin, "budget_max_cents": bmax,
            "status": status, "created_at": iso(days_ago=days), **extra})[0]
        return c, conv, a

    # pending
    if "ada-rivera" in by_slug:
        c, conv, a = make_commission("ada-rivera", "pending", "Family portrait in oil",
            "I'd love a 24x30 oil portrait of my family from a photo I'll share. Warm tones to match my living room.", 40000, 70000, 6)
        msg(conv["id"], buyer_id, "Hi Ada! I'm interested in commissioning a family portrait — is that something you take on?", 6)
        msg(conv["id"], a["profile_id"], "I'd love to! Send me the reference photo and the wall dimensions when you can.", 5)

    # quoted (with quote card)
    if "lena-park" in by_slug:
        c, conv, a = make_commission("lena-park", "quoted", "Custom screenprint — bayou series",
            "A 2-color screenprint of Buffalo Bayou at sunset, ~18x24, edition of 10.", 25000, 45000, 9,
            quoted_price_cents=35000, estimated_completion="3-4 weeks", artist_notes="Includes one proof round. 50% deposit to start.")
        msg(conv["id"], buyer_id, "Could you do a bayou-themed screenprint for me?", 9)
        msg(conv["id"], a["profile_id"], "Yes! Here's a quote.", 8)
        qm = insert("messages", {"conversation_id": conv["id"], "sender_id": a["profile_id"],
            "content": "Sent a commission quote", "message_type": "quote_card", "is_read": True, "created_at": iso(days_ago=8)})[0]
        insert("message_attachments", {"message_id": qm["id"], "attachment_type": "quote_card", "url": None,
            "metadata": {"commission_id": c["id"], "quoted_price_cents": 35000, "estimated_completion": "3-4 weeks", "artist_notes": "Includes one proof round. 50% deposit to start."}})

    # in_progress (with progress updates)
    if "marcus-bell" in by_slug:
        c, conv, a = make_commission("marcus-bell", "in_progress", "Mixed-media piece for office",
            "Large mixed-media abstract, ~36x36, blues and greens, for my office.", 50000, 90000, 25,
            quoted_price_cents=72000, estimated_completion="6 weeks", artist_notes="Deposit received — starting now!")
        msg(conv["id"], buyer_id, "Excited to get started!", 25)
        msg(conv["id"], a["profile_id"], "Me too — deposit received. I'll post progress here.", 24)
        ups = [
            ("Started the underpainting today — blocking in the composition.", 18, 20),
            ("Second layer down. Loving how the greens are coming through.", 9, 55),
            ("Almost there — just refining the texture and edges. Should ship next week!", 2, 85),
        ]
        for i, (note, days, pct) in enumerate(ups):
            photo = upload_photo(2000 + i, f"rich/commission-{c['id']}-{i}.jpg")
            insert("commission_updates", {"commission_id": c["id"], "artist_id": a["id"],
                "note": note, "photo_url": photo, "progress_percent": pct, "created_at": iso(days_ago=days)})
    print("  commissions=3 (pending, quoted+card, in_progress+updates)")

    # 6) Notifications for the buyer.
    notifs = [
        ("commission_update", "Commission update", "Marcus Bell posted an update on \"Mixed-media piece for office\".", 2),
        ("new_message", "New message", "Lena Park sent you a message.", 8),
        ("price_drop", "Price drop", "\"Garden Oaks\" is now $140.00 (was $160.00).", 3),
        ("new_listing", "New work", "Ada Rivera just listed \"Buffalo Bayou\".", 5),
    ]
    for t, title, body, days in notifs:
        insert("notifications", {"user_id": buyer_id, "type": t, "title": title, "body": body,
                                 "link": "/commissions", "is_read": False, "created_at": iso(days_ago=days)})
    print(f"  notifications={len(notifs)}")

    # 7) Extra followers so artist counts look real.
    print("Adding extra followers…")
    fans = []
    for i in range(4):
        email = f"fan{i}@cc-demo.com"
        existing = req("GET", f"/rest/v1/profiles?email=eq.{email}&select=id")
        if existing:
            fans.append(existing[0]["id"]); continue
        res = req("POST", "/auth/v1/admin/users", {"email": email, "password": "DemoPass123!",
            "email_confirm": True, "user_metadata": {"role": "user", "full_name": f"Fan {i+1}"}})
        fans.append(res["id"])
    for fid in fans:
        for a in artists:
            # each fan follows ~half the artists, deterministically
            if (hash(fid + a["id"]) % 2) == 0:
                try: insert("follows", {"follower_id": fid, "artist_id": a["id"]})
                except RuntimeError: pass

    for a in artists:
        req("POST", "/rest/v1/rpc/refresh_completeness_score", {"p_artist_id": a["id"]})

    print("\nDone. buyer.test now has follows, saves, 3 orders, 3 commissions, notifications, and a review.")

if __name__ == "__main__":
    main()
