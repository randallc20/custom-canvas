# Custom Canvas Privacy Policy

**DRAFT v2 — for counsel review.** Rewritten 2026-08-25 against the actual code: the
previous version named three processors where the platform uses eight, and omitted
geolocation entirely.

Custom Canvas LLC · 3120 Southwest Freeway, Ste 101 #991985, Houston TX 77098
support@customcanvas.shop · Last updated: [DATE]

---

## 1. What we collect

**You give us:**
- Name, email address, password (stored hashed by our auth provider)
- Profile details — avatar, bio, artist story, mediums, neighbourhood, education, links
- Listings — titles, descriptions, prices, photographs, tags
- **Order details, including the recipient name and shipping address** you enter at
  checkout
- Messages and any files you attach
- Reviews and reports

**Artists additionally give Stripe** (not us) identity and bank details for payouts. We
never see or store your full bank details or card number.

**We collect automatically:**
- Usage events — listings viewed, pieces saved, artists followed
- Standard request data — IP address, browser type, pages requested
- Error diagnostics when something breaks

**Location.** If you use the location picker, your **device coordinates are sent to a
third-party geocoding service** (BigDataCloud) to turn them into a city name, or your
ZIP code is sent to zippopotam.us. This is disclosed in the picker itself. **Your chosen
location is stored only in your browser** — it is never attached to your account or sent
to our database.

## 2. Why we use it

To run the marketplace: accounts and sign-in, listings and search, orders and payouts,
messaging, notifications, and transactional email about your account, orders and
commissions. To keep the platform safe: fraud prevention, rate limiting, CAPTCHA,
dispute evidence, and enforcement. To improve it: understanding which pieces are viewed
and saved. To meet legal obligations: tax, accounting, and lawful requests.

**We do not sell personal data.** We do not use it for advertising or share it with
advertisers.

## 3. Who processes it for us

| Processor | Purpose | What it receives |
|---|---|---|
| **Supabase** | Database, authentication, file storage | Account data, listings, orders, messages, uploads |
| **Stripe** | Payments, payouts, tax, artist identity | Payment data, artist KYC and bank details |
| **Resend** | Transactional email | Email address, message content |
| **Vercel** | Hosting, analytics, performance | Request and usage data |
| **Sentry** | Error monitoring | Error context, which may include identifiers |
| **Cloudflare Turnstile** | Sign-up / sign-in CAPTCHA | Challenge and device signals |
| **BigDataCloud** | Reverse-geocoding for the location picker | **Device coordinates** |
| **zippopotam.us** | ZIP-to-city lookup | ZIP code |

Each acts on our instructions. Stripe is an independent controller for payment data —
see Stripe's own privacy policy.

We also share data when the law requires it, to investigate fraud or abuse, or in
connection with a merger or sale of the business (in which case we would tell you).

## 4. What other people can see

- **Public:** your display name, avatar, and — for artists — profile, story and listings
- **Private to the two of you:** messages and attachments
- **Never public:** your email address, which is restricted at the database level and is
  not readable by other users
- **Shared with the artist when you buy:** your name and shipping address, so they can
  post your piece

Artists in draft or pending review are not publicly visible at all.

## 5. Email

Transactional email — order confirmations, shipping notices, security and account
messages — is part of the service and cannot be switched off while you have an account.

Optional email — new listings from artists you follow, price drops, reminders — can be
switched off in your account settings or by the unsubscribe link in any such message.

## 6. How long we keep it

[**COUNSEL TO SET RETENTION PERIODS.** Current practice: order and transaction records
are kept indefinitely for tax, accounting and dispute-defence purposes; account content
is deleted on request. Counsel should set explicit periods, and reconcile "delete my
account" against the records we must keep — a completed sale cannot simply vanish.]

## 7. Your rights

You can view and change your information in your account settings, adjust email
preferences, or ask us to delete your account by writing to support@customcanvas.shop.

**Texas residents.** The Texas Data Privacy and Security Act gives you rights to access,
correct, delete and port your personal data, and to opt out of targeted advertising,
sale, and certain profiling. We do not sell personal data or use it for targeted
advertising. [Counsel: Custom Canvas is very likely an SBA "small business" and so
largely exempt from the TDPSA — but the consent requirement before selling *sensitive*
data applies regardless. Confirm and state the position.]

**California residents.** [Counsel to confirm whether CCPA/CPRA thresholds are met —
almost certainly not at launch — and decide whether to offer the rights voluntarily.]

We will not discriminate against you for exercising any of these rights.

## 8. Security

Encryption in transit (TLS). Row-level security on the database, so users can only read
what they are entitled to. Email addresses and sensitive artist fields are restricted at
the database level, not merely hidden in the interface. Passwords are hashed by our auth
provider. Rate limiting and CAPTCHA on sensitive endpoints.

No system is perfectly secure. [**COUNSEL:** add breach-notification commitments
consistent with Texas law.]

## 9. Children

Custom Canvas is not for children under 13, and we do not knowingly collect their
information. If you believe a child has given us information, write to us and we will
delete it.

## 10. Changes

We will post any update here and change the date above. Material changes will be
notified.

---

*Questions: support@customcanvas.shop*
