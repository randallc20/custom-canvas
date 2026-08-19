#!/usr/bin/env python3
"""
Seed Custom Canvas staging with realistic demo data.

Usage:
    python3 scripts/seed_demo.py

Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
(or the environment). Requires Pillow (pip install Pillow) for image generation.

It is additive and guarded: if the marker artist already exists it exits without
duplicating. To reseed from scratch, delete the demo auth users (emails ending
in @cc-demo.com) in Supabase first — FK cascades clear their data.

Demo accounts share the password: DemoPass123!
NOTE: generated images are abstract placeholders, not real artwork.
"""
import io
import json
import os
import random
import sys
from datetime import datetime, timezone
import urllib.request
import urllib.error

random.seed(7)  # deterministic output

def load_env():
    env = dict(os.environ)
    try:
        with open(os.path.join(os.path.dirname(__file__), "..", ".env.local")) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env.setdefault(k, v)
    except FileNotFoundError:
        pass
    return env

ENV = load_env()
URL = ENV.get("NEXT_PUBLIC_SUPABASE_URL")
SVC = ENV.get("SUPABASE_SERVICE_ROLE_KEY")
if not URL or not SVC:
    sys.exit("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")

PASSWORD = "DemoPass123!"
HEADERS = {"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "application/json"}


def req(method, path, body=None, headers=None, raw=False):
    data = body if raw else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(f"{URL}{path}", data=data, method=method, headers=headers or HEADERS)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()[:300]}")


def rest_insert(table, rows):
    """Insert via PostgREST, returning the created rows."""
    return req("POST", f"/rest/v1/{table}", rows,
               headers={**HEADERS, "Prefer": "return=representation"})


def create_user(email, role, full_name):
    res = req("POST", "/auth/v1/admin/users",
              {"email": email, "password": PASSWORD, "email_confirm": True,
               "user_metadata": {"role": role, "full_name": full_name}})
    return res["id"]


# --- image generation -------------------------------------------------------
from PIL import Image, ImageDraw

PALETTES = [
    [(232, 112, 74), (250, 246, 240), (45, 42, 38)],
    [(124, 139, 111), (241, 232, 218), (45, 42, 38)],
    [(201, 90, 56), (251, 234, 226), (111, 106, 99)],
    [(45, 42, 38), (232, 112, 74), (241, 232, 218)],
    [(111, 106, 99), (250, 246, 240), (124, 139, 111)],
]


def gen_image(seed):
    rnd = random.Random(seed)
    pal = rnd.choice(PALETTES)
    bg, fg, accent = pal[1], pal[0], pal[2]
    img = Image.new("RGB", (900, 1100), bg)
    d = ImageDraw.Draw(img, "RGBA")
    for _ in range(rnd.randint(4, 8)):
        x0, y0 = rnd.randint(-100, 700), rnd.randint(-100, 900)
        w, h = rnd.randint(180, 520), rnd.randint(180, 520)
        col = rnd.choice([fg, accent]) + (rnd.randint(70, 220),)
        if rnd.random() < 0.5:
            d.ellipse([x0, y0, x0 + w, y0 + h], fill=col)
        else:
            d.rectangle([x0, y0, x0 + w, y0 + h], fill=col)
    for _ in range(rnd.randint(2, 5)):
        d.line([rnd.randint(0, 900), rnd.randint(0, 1100), rnd.randint(0, 900), rnd.randint(0, 1100)],
               fill=fg + (180,), width=rnd.randint(6, 22))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def upload_image(path, data):
    req("POST", f"/storage/v1/object/listing-images/{path}", data, raw=True,
        headers={"apikey": SVC, "Authorization": f"Bearer {SVC}", "Content-Type": "image/png", "x-upsert": "true"})
    return f"{URL}/storage/v1/object/public/listing-images/{path}"


# --- demo content -----------------------------------------------------------
ARTISTS = [
    dict(slug="ada-rivera", name="Ada Rivera", hood="Montrose", school="University of Houston",
         mediums=["Oil Paint", "Acrylic"], accent="#E8704A", commissions=True,
         story="I paint the light of the Gulf Coast — bayous at dawn, the city at dusk. Born in Galveston, trained at UH, working out of a Montrose studio.",
         listings=[("Bayou Morning", "Oil Paint", 45000, 2500), ("Montrose Dusk", "Acrylic", 28000, 2000), ("Buffalo Bayou", "Oil Paint", 62000, 3000)]),
    dict(slug="marcus-bell", name="Marcus Bell", hood="Third Ward", school="Texas Southern University",
         mediums=["Mixed Media", "Collage"], accent="#7C8B6F", commissions=True,
         story="Collage and mixed media rooted in Third Ward history and Black Houston. I build pieces from found paper, paint, and photographs.",
         listings=[("Emancipation Ave", "Mixed Media", 38000, 2000), ("Tremé Sketches", "Collage", 22000, 1500)]),
    dict(slug="lena-park", name="Lena Park", hood="The Heights", school="Rice University",
         mediums=["Printmaking", "Ink"], accent="#C95A38", commissions=False,
         story="Screenprints and ink drawings about memory and place. Small editions, made by hand in my Heights studio.",
         listings=[("Heights No. 4", "Printmaking", 15000, 0), ("Still Life II", "Ink", 18000, 0), ("Garden Oaks", "Printmaking", 16000, 0)]),
    dict(slug="diego-soto", name="Diego Soto", hood="East End", school="University of Houston",
         mediums=["Photography"], accent="#2D2A26", commissions=True,
         story="Documentary photography of Houston's East End — taquerias, lowriders, the people who make this neighborhood.",
         listings=[("Navigation Blvd", "Photography", 30000, 2500), ("Sunday Drive", "Photography", 30000, 2500)]),
    dict(slug="claire-nguyen", name="Claire Nguyen", hood="Midtown", school="Glassell School of Art",
         mediums=["Watercolor"], accent="#E8704A", commissions=True, away=True,
         story="Loose, luminous watercolors of Houston gardens and gulf flora. Currently traveling and painting the Texas coast.",
         listings=[("Azalea Trail", "Watercolor", 24000, 1800), ("Coastal Bend", "Watercolor", 26000, 1800)]),
]

# A couple of pieces will be marked sold (with a review).
PARTNERS = [
    dict(slug="bayou-city-gallery", name="Bayou City Gallery", ptype="gallery", hood="Montrose",
         bio="A Montrose gallery championing emerging Houston painters since 2014."),
    dict(slug="glassell-school", name="Glassell School of Art", ptype="school", hood="Museum District",
         bio="The teaching wing of the Museum of Fine Arts, Houston."),
]

REVIEWS = [
    (5, "Even better in person — the color is incredible."),
    (5, "Shipped fast and beautifully packed. Love it."),
    (4, "Gorgeous piece, exactly as described."),
]


def main():
    # Guard against duplicate seeding.
    existing = req("GET", "/rest/v1/artist_profiles?slug=eq.ada-rivera&select=id")
    if existing:
        print("Demo data already present (ada-rivera exists). Nothing to do.")
        return

    print("Creating partners…")
    partner_ids = {}
    for p in PARTNERS:
        uid = create_user(f"{p['slug']}@cc-demo.com", "gallery", p["name"])
        row = rest_insert("gallery_profiles", {
            "profile_id": uid, "slug": p["slug"], "gallery_name": p["name"],
            "partner_type": p["ptype"], "city": "Houston", "neighborhood": p["hood"],
            "bio": p["bio"], "is_verified": True, "verified_at": datetime.now(timezone.utc).isoformat(),
        })[0]
        partner_ids[p["slug"]] = row["id"]
        print(f"  + {p['name']} ({p['ptype']})")

    print("Creating artists + listings…")
    img_seed = 0
    buyer_uid = create_user("demo.collector@cc-demo.com", "user", "Jordan Collector")
    sold_pairs = []  # (artist_profile_id, listing_id, listing_artist_id)

    for ai, a in enumerate(ARTISTS):
        uid = create_user(f"{a['slug']}@cc-demo.com", "artist", a["name"])
        ap = rest_insert("artist_profiles", {
            "profile_id": uid, "slug": a["slug"], "display_name": a["name"], "city": "Houston",
            "neighborhood": a["hood"], "school": a["school"], "accent_color": a["accent"],
            # Demo artists are pre-approved (approval gate, migration 00030/32):
            # is_live alone would leave them stuck 'draft' in the review queue.
            "bio_layout": "left", "is_live": True, "application_status": "approved",
            "commissions_open": a["commissions"],
            "story": a["story"], "bio": a["story"][:140], "primary_mediums": a["mediums"],
            "fulfillment_pref": "pickup_only" if not a["commissions"] else "ships_national",
            "away_mode": a.get("away", False),
            "away_message": "Back from the coast in July!" if a.get("away") else None,
        })[0]

        # Education entry linking some artists to the verified Glassell school.
        if a["school"] == "Glassell School of Art":
            rest_insert("artist_education", {
                "artist_id": ap["id"], "institution": "Glassell School of Art",
                "field_of_study": "Painting", "start_year": 2016, "end_year": 2018,
            })

        for li, (title, medium, price, ship) in enumerate(a["listings"]):
            listing = rest_insert("listings", {
                "artist_id": ap["id"], "title": title, "medium": medium,
                "description": f"{medium}. Original work by {a['name']}.",
                "price_cents": price, "shipping_rate_cents": ship, "price_visible": True,
                "status": "available", "year_created": 2024 + (li % 2),
            })[0]
            url = upload_image(f"demo/{a['slug']}-{li}.png", gen_image(img_seed))
            img_seed += 1
            rest_insert("listing_images", {"listing_id": listing["id"], "image_url": url, "display_order": 0, "is_primary": True})
            # Mark the first listing of the first two artists as sold (for reviews).
            if li == 0 and ai < len(REVIEWS):
                sold_pairs.append((ap["id"], listing["id"], ai))
        print(f"  + {a['name']} — {len(a['listings'])} listings")

    print("Creating sold orders + reviews…")
    for ap_id, listing_id, idx in sold_pairs:
        order = rest_insert("orders", {
            "listing_id": listing_id, "buyer_id": buyer_uid, "artist_id": ap_id,
            "amount_cents": 30000, "platform_fee_cents": 5500, "artist_payout_cents": 25500,
            "buyer_fee_cents": 1000, "shipping_cents": 0, "status": "delivered",
            "stripe_payment_intent_id": f"pi_demo_{idx}_{random.randint(1000,9999)}",
        })[0]
        req("PATCH", f"/rest/v1/listings?id=eq.{listing_id}", {"status": "sold", "sold_price_cents": 30000, "show_sold_price": True})
        rating, comment = REVIEWS[idx]
        rest_insert("reviews", {"order_id": order["id"], "reviewer_id": buyer_uid, "rating": rating, "comment": comment})

    print("Creating roster + follows + saves…")
    # Put two artists on the gallery roster.
    gallery_id = partner_ids["bayou-city-gallery"]
    roster = req("GET", "/rest/v1/artist_profiles?slug=in.(ada-rivera,marcus-bell)&select=id")
    for r in roster:
        rest_insert("gallery_artists", {"gallery_id": gallery_id, "artist_id": r["id"], "role": "represented"})
    # Buyer follows + saves a few.
    follow_targets = req("GET", "/rest/v1/artist_profiles?slug=in.(ada-rivera,lena-park,diego-soto)&select=id")
    for t in follow_targets:
        rest_insert("follows", {"follower_id": buyer_uid, "artist_id": t["id"]})
    save_targets = req("GET", "/rest/v1/listings?status=eq.available&select=id&limit=4")
    for t in save_targets:
        rest_insert("saved_listings", {"profile_id": buyer_uid, "listing_id": t["id"]})

    # One PENDING applicant so the /admin/applications queue is always
    # testable on staging (draft state is reachable by just signing up).
    print("Creating pending applicant…")
    pend_uid = create_user("pending.artist@cc-demo.com", "artist", "Piper Pending")
    rest_insert("artist_profiles", {
        "profile_id": pend_uid, "slug": "piper-pending", "display_name": "Piper Pending",
        "city": "Houston", "neighborhood": "Montrose", "bio_layout": "left",
        "is_live": False, "application_status": "pending", "commissions_open": False,
        "story": "Ceramicist exploring Gulf Coast clay bodies. Applying to sell on Custom Canvas.",
        "bio": "Ceramicist exploring Gulf Coast clay bodies.", "primary_mediums": ["Ceramics"],
        "fulfillment_pref": "pickup_only",
    })

    # Refresh completeness for all demo artists.
    for r in req("GET", "/rest/v1/artist_profiles?select=id"):
        req("POST", "/rest/v1/rpc/refresh_completeness_score", {"p_artist_id": r["id"]})

    print("\nDone. Demo accounts use password:", PASSWORD)
    print("  collector: demo.collector@cc-demo.com")
    print("  artists:   <slug>@cc-demo.com (e.g. ada-rivera@cc-demo.com)")
    print("  partners:  bayou-city-gallery@cc-demo.com, glassell-school@cc-demo.com")


if __name__ == "__main__":
    main()
