# Custom Canvas Privacy Policy

**DRAFT v3 — complete draft for counsel review.** Rewritten 2026-08-25 against the actual code: the
previous version named three processors where the platform uses eight, and omitted
geolocation entirely. The separate Cookie Policy is now §10 of this document, next to
the processor table it describes.

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

| What | How long | Why |
|---|---|---|
| Order and payment records | **7 years** after the sale | Tax, accounting, and defending a dispute or chargeback |
| Artist payout and tax records | **7 years** | Same |
| Messages between buyer and artist | **3 years** after the last message in the thread | Evidence for disputes and abuse reports |
| Listings and images | Until you delete them, or **90 days** after account closure | Sold listings are retained as part of the order record |
| Account profile | Deleted within **30 days** of a deletion request | — |
| Error logs and diagnostics | **90 days** | — |
| Analytics events | **24 months**, aggregated thereafter | — |
| Backups | Purged on a rolling **90-day** cycle | Deleted data persists in backups until the cycle completes |

**How deletion interacts with records we must keep.** If you ask us to delete your
account we remove your profile, listings, saved items and preferences, and disconnect
your identity from analytics. **We cannot delete a completed sale.** Tax law, accounting
obligations and dispute defence require us to keep the transaction record — order
amount, date, tax collected, and the shipping address the piece went to — for seven
years. What we do is reduce it to what those obligations need and detach it from your
active account.

*[Counsel: confirm the seven-year figure against Texas and federal record-keeping
requirements, and confirm that retaining a shipping address inside a closed order is
the right call — it is needed to defend a chargeback, which can arrive long after
account closure.]*

## 7. Your rights

You can view and change your information in your account settings, adjust email
preferences, or ask us to delete your account by writing to support@customcanvas.shop.

**Texas residents.** The Texas Data Privacy and Security Act gives Texas consumers
rights to access, correct, delete and port their personal data, and to opt out of
targeted advertising, the sale of personal data, and certain profiling.

The TDPSA is unusual in having no revenue or headcount threshold: it applies to anyone
doing business in Texas **unless they are a "small business" as defined by the U.S.
Small Business Administration**. Custom Canvas is a small business by that definition,
so most of the Act's obligations do not currently apply to us. One does regardless of
size: **we will not sell sensitive personal data without your consent** — and we do not
sell personal data at all.

**We honour these rights anyway.** Being exempt is not a reason to behave differently,
and we would rather not rebuild our practices the day we outgrow the exemption. Write to
support@customcanvas.shop.

**If we turn a request down**, we will tell you why within 45 days, and you may **appeal**
by replying to that decision. We will answer an appeal within 60 days, and if we refuse
it again we will tell you how to complain to the **Texas Attorney General**.

**Browser signals.** Where your browser sends a Global Privacy Control signal, we treat
it as an opt-out of any sale or sharing of personal data. We do not sell or share
personal data in any case.

**California residents.** We do not currently meet the CCPA/CPRA applicability
thresholds. We extend the same rights described above to California residents
voluntarily, and we do not sell or share personal data for cross-context behavioural
advertising.

*[Counsel: confirm the SBA size-standard analysis for our NAICS code, and confirm you
are comfortable with the voluntary extension — offering rights we are not required to
offer is a commitment, and withdrawing it later reads badly.]*

We will not discriminate against you for exercising any of these rights.

## 8. Security

Encryption in transit (TLS). Row-level security on the database, so users can only read
what they are entitled to. Email addresses and sensitive artist fields are restricted at
the database level, not merely hidden in the interface. Passwords are hashed by our auth
provider. Rate limiting and CAPTCHA on sensitive endpoints.

No system is perfectly secure, and we will not claim otherwise.

**If a breach affects your personal data**, we will notify you without unreasonable
delay once we have determined what happened and what data was involved. Texas law sets
two different deadlines, and they are easy to confuse: affected individuals must be
notified **within 60 days** of determining that a breach occurred, while the **Texas
Attorney General must be notified within 30 days** where **250 or more** Texas residents
are affected. We will meet both and aim to tell you sooner where we can do so
usefully.

Our notice will describe what happened, what data was involved, what we have done, and
what you can do.

*[Counsel: confirm both deadlines and the threshold against the current text of Tex.
Bus. & Com. Code §521.053. The previous draft gave 60 days for both and described the
threshold as "more than 250"; the AG deadline was shortened to 30 days by amendment and
the threshold is expressed as "at or over" 250. Worth being exact: these are the two
numbers someone will be reading off this page at the worst possible moment.]*

## 9. Age

You must be **18 or over** to hold a Custom Canvas account, whether you buy or sell.
We do not knowingly collect personal information from anyone under 18. If we learn that
an account holder is under 18 we close the account and delete the information, and if
you believe a minor has given us information, write to us and we will do the same.

*[Counsel: this follows the change to Terms of Service §2. If you overrule that change
and the account minimum stays at 13, this section has to come back to a COPPA-shaped
under-13 clause and the Texas SCOPE Act analysis becomes live.]*

## 10. Cookies and similar technologies

**Strictly necessary.** Sign-in and session cookies, set by our authentication provider,
that keep you logged in and secure your session. Security cookies set by Cloudflare
Turnstile when you sign up or sign in. Without these the site cannot work.

**Preferences.** Your chosen community (city) and your acknowledgement of the cookie
banner are stored in your browser's **local storage**, not sent to us. Clearing your
browser data resets them.

**Analytics — and these set no cookies.** Vercel Web Analytics and Speed Insights record
aggregate usage and page-performance data. They are **cookieless**: visitors are counted
using a hash derived from the request rather than a stored identifier, no personally
identifying information is collected, and nothing tracks you across other websites.

**We use no advertising or cross-site tracking cookies**, and no third-party advertising
networks.

**Your choices.** Most browsers let you refuse or delete cookies. Refusing strictly
necessary cookies will prevent you from signing in.

*[Counsel: because the only cookies we set are strictly necessary — session
authentication and the sign-in CAPTCHA — and analytics is cookieless, the consent banner
currently shown may not be required at all. Worth confirming: an unnecessary banner is
friction on every first visit, and a banner that implies choices it does not actually
offer is its own small problem.]*

## 11. Changes

We will post any update here and change the date above. Material changes will be
notified.

---

*Questions: support@customcanvas.shop*
