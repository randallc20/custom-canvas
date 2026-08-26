# Custom Canvas — Live Site Test Plan

*Everything below happens on the real website. Work top to bottom. Each step has
a number — when something doesn't match, write the number down.*

---

## Read this first

**The website:** https://customcanvas.shop

**What you're testing.** This is the real, live Custom Canvas — the same site
real artists and real buyers will use. It is not a copy or a practice version.
Right now it is empty: no artists, no art, no orders. You are going to fill it
up, use it as four different kinds of person, and tell us everything that felt
wrong.

**Real money is involved — but only a little, and only in Part 9.** One
purchase, with a real card, for a few dollars. It gets refunded in Part 10.
Chris covers anything that doesn't come back. Nothing else in this document
costs anything.

**Everything you make gets deleted.** When this round is finished, the entire
database is wiped clean before real users arrive. So don't be careful. Make ugly
listings. Use silly prices. Type nonsense into boxes and see what happens. You
cannot break anything that matters.

### What we need from you

Three things, in order of value:

1. **Anything that is broken** — an error message, a blank page, a button that
   does nothing, a number that's wrong.
2. **Anything that confused you** — if you had to stop and think "wait, what do
   I do now?", that is a finding. Write it down even if you figured it out.
   Especially if you figured it out.
3. **Anything that felt cheap, ugly, or off** — wonky spacing, a photo squashed
   out of shape, wording that sounds like a robot wrote it.

**If you are stuck for more than ten minutes, that is itself a bug.** Write down
where you got stuck, then skip ahead and keep going.

### How to write it down

Copy this block for each problem. Appendix B has a blank stack of them.

```
Step number:      4.12
What I did:       Clicked "Submit for review"
What I expected:  Something to happen
What happened:    Nothing, the button just sat there
Screenshot:       yes
Device/browser:   Chrome on my laptop
Roughly when:     Tuesday about 2:15pm
```

The step number and the screenshot are the two that save the most time. The
"roughly when" matters more than it looks — it lets us find the exact error in
the server logs.

**Taking a screenshot.** Mac: hold `Shift` + `Command` + `4`, then drag a box.
Windows: hold `Windows` + `Shift` + `S`. iPhone: press the side button and
volume-up together. Android: power and volume-down together.

### The one rule about signing in

You are going to be four different people. **A web browser can only be one
person at a time.** If you sign in as the artist in the same window where you
were the buyer, the buyer gets signed out.

So give each person their own window and keep them open all week:

| Person | Where to keep them |
|---|---|
| **Artist** | Chrome, normal window |
| **Art Lover** (the buyer) | Chrome, Incognito window (`Shift`+`Cmd`+`N`, or `Ctrl`+`Shift`+`N`) |
| **Administrator** | Safari or Firefox — a different browser entirely |
| **Partner** (a gallery) | Safari Private window, or your phone |

If an Incognito window closes, you'll have to sign in again — that's normal, not
a bug.

---

## Part 1 — Set up your four accounts

Do this whole part before anything else. It takes about fifteen minutes.

### Before you start — the administrator is already made for you

Chris will give you the administrator login separately. It already exists, so
there is nothing to register and no email to confirm for that one. Keep it in
its own browser and never sign anything else into that window. That mailbox
isn't yours, so you won't see email it receives — everything the administrator
needs arrives on the bell inside the site.

The other **three** accounts you create yourself. You need three different email
addresses but not three inboxes: Gmail, Outlook and iCloud all let you add
`+something` to your address and the mail still lands in your normal inbox.

If your address is `jane@gmail.com`:

| Role | Email address to use |
|---|---|
| Artist | `jane+artist@gmail.com` |
| Art Lover (buyer) | `jane+buyer@gmail.com` |
| Partner (gallery) | `jane+partner@gmail.com` |

All three land in `jane@gmail.com`. To the website they are three separate people.

> **If the `+` trick doesn't work** for your email provider, stop and tell Chris
> — he'll set up four addresses for you. Don't try to work around it.

### 1.1 — Pick one password

Use the same password for the three accounts you create. At least 8
characters. Write it on the account card in Appendix A along with the three
addresses and the administrator login Chris gave you. You
will need to look at that card constantly.

### 1.2 — Sign in as the Administrator

- **Do:** In the browser you're keeping for the administrator, go to
  customcanvas.shop, click **Log In**, and use the email and password Chris gave
  you.
- **Expect:** You land on the **admin panel**, not the normal home page.
- **If instead** you land on the ordinary home page with no admin anywhere, or
  the password is rejected — stop and tell Chris. Nothing in Part 5 works
  without this, and the artist can never be approved.

### 1.3 — Register the Artist account

- **Do:** Open a **different browser** (or an Incognito window). Go to
  https://customcanvas.shop, click **Sign Up**, use your `+artist` address, and
  this time choose the **Artist** tile. Tick the terms box, do the human check,
  create the account.
- **Expect:** The **Check Your Email** page again.
- **Do:** Confirm from your inbox: find the email from Custom Canvas, sent from
  `noreply@customcanvas.shop`, and click the confirmation link. If it lands in
  spam or promotions instead of the inbox, note which folder — real artists will
  hit exactly this.

### 1.4 — Register the Art Lover account

Same again with your `+buyer` address, choosing the **Art Lover** tile. Confirm
the email.

### 1.5 — Register the Partner account

Same again with your `+partner` address, choosing the **Partner** tile. Confirm
the email.

### 1.6 — Check the confirmation emails

- **Expect:** Three confirmation emails, one per account you created, all from
  `noreply@customcanvas.shop`.
- **Look at:** Does the email look like a real company sent it, or does it look
  like plain grey computer text? Is the Custom Canvas name and logo there? Say
  what you think — this is the very first thing a real artist ever sees from us.

### 1.7 — Try to sign in with the wrong password

- **Do:** Sign in with one of your addresses and a deliberately wrong password.
- **Expect:** A clear, polite message telling you the details are wrong. Not a
  crash, not a blank screen, and **not** a message that tells you whether the
  email address exists.

### 1.8 — Try the "forgot password" flow

- **Do:** On the sign-in page click the forgotten-password link. Enter your
  `+buyer` address.
- **Expect:** A message saying a reset link is on its way, then an email
  arriving. Click it, set a new password, sign in with the new password.
- **Do:** Then change it back to your normal one so your account card stays
  correct.

### 1.9 — Fill in Appendix A

Write down all four addresses, the password, and today's date. Do it now.

---

## Part 2 — The order to do things in

The roles depend on each other. An artist can't be approved until an
administrator approves them; a buyer can't buy until an artist is live. So the
document is not four separate documents — it's one story told four times, and
**the order matters.**

Here is the whole run. Do the parts in this order:

| | Part | Who you are | What happens |
|---|---|---|---|
| 1 | **Part 3** | Nobody (signed out) | Look at the empty site |
| 2 | **Part 4** | Artist | Sign up, build a shop, submit it |
| 3 | **Part 5** | Administrator | Reject it once, then approve it |
| 4 | **Part 6** | Artist | The shop goes live |
| 5 | **Part 7** | Nobody (signed out) | Look at the site again — now there's art |
| 6 | **Part 8** | Art Lover | Browse, save, follow, message the artist |
| 7 | **Part 9** | Art Lover, then Artist | **The purchase — real money** |
| 8 | **Part 10** | Art Lover → Artist → Administrator | The refund, all three in sequence |
| 9 | **Part 11** | Art Lover ↔ Artist | A commission, start to finish |
| 10 | **Part 12** | Partner, then Administrator | A gallery joins and gets verified |
| 11 | **Part 13** | Administrator | Everything else in the admin panel |
| 12 | **Part 14** | All | Blocking, reporting, settings, deleting |
| 13 | **Part 15** | All | Do the important bits again on your phone |

Whenever you have to change roles mid-part, you'll see a box like this:

> ### ⇄ SWITCH TO: the Administrator
> Go to your admin browser window. Do steps 5.4 to 5.7. Then come back here.

Don't skip those. They're the moments where the whole thing either works or
falls apart.

### How long this takes

About **twelve hours** of actual work across 149 steps — call it two working
days, or four evenings. Don't try to do it in one sitting: the last third is
where the security checks live, and those are the ones you least want done
tired. **Three hours at a time is about right.**

| Sitting | Parts | Roughly | Where it goes |
|---|---|---|---|
| **One** | 1–5 | 3 hrs | Accounts and the empty site are quick. **Part 4 is the long one** — an hour and a half of genuinely building a shop, with real photos and real writing. |
| **Two** | 6–9 | 3 hrs | Going live, connecting Stripe, then the purchase. Stripe's identity questions take 10–20 minutes if your details are to hand. |
| **Three** | 10–13 | 3 hrs | The refund across three roles, commissions in four different endings, the gallery, and the admin panel. |
| **Four** | 14–17 | 2 hrs | Blocking and reporting, the phone pass, the email audit, and the three questions at the end. |
| **Later** | step 10.8 | — | The refund landing in your bank takes **5–10 working days**. Note the amount and date when it arrives and send it on; everything else is finished by then. |

**Add time for writing things down.** Roughly a third of the total is bug reports
and screenshots, and that third is the entire point — it's already in the twelve
hours. If you find yourself skipping the notes to move faster, slow down instead.

---

## Part 3 — The Visitor: an empty site

*Signed out. Use any window, but sign out first (top-right menu → Sign Out).*

The site has nothing in it yet. That's on purpose — a brand-new visitor to a
brand-new marketplace should still land somewhere that makes sense.

### 3.1 — The front door

- **Do:** Go to https://customcanvas.shop signed out.
- **Expect:** The page loads. Logo top left. A headline about discovering art
  from local emerging artists. Sign-in and sign-up links top right.
- **Look at:** Does it look finished? Is anything overlapping, cut off, or the
  wrong size? Is any text a placeholder like "Lorem ipsum"?

### 3.2 — An empty shop that doesn't look broken

- **Expect:** Since there is no art yet, the page should say something friendly
  about it. It should **not** show empty grey boxes, a spinning loader that
  never stops, or the word "undefined" anywhere.
- **Report:** Anything that looks like a mistake rather than a choice.

### 3.3 — Set your location

- **Do:** Find the location control in the top bar. Set your city — use ZIP code
  `77005` for Houston.
- **Expect:** The bar shows "Houston, TX". The page text changes to mention
  Houston.
- **Do:** Reload the page.
- **Expect:** It still says Houston. It should remember.
- **Do:** Open the location control again and clear it / browse everywhere.
- **Expect:** Back to the general view.

### 3.4 — Search for something that doesn't exist

- **Do:** Type `sunflower` into the search box at the top and press Enter.
- **Expect:** A calm "nothing found" message, and an obvious way back. Not an
  error, not a blank white page.

### 3.5 — Walk the footer

- **Do:** Scroll to the bottom. Click every link down there one at a time,
  coming back each time: About, Terms, Privacy, Partners, and anything else.
- **Expect:** Every one opens a real page with real writing on it. None of them
  404 or show an "under construction" placeholder.
- **Read:** The About page and the Terms page properly, as if you were an artist
  deciding whether to trust this company with your work. Tell us honestly
  whether you would.

### 3.6 — Check what the pricing page says

- **Do:** On the About page, find the section about pricing and fees.
- **Expect:** It explains a **service fee** that covers card processing — roughly
  3% — charged to the buyer.
- **Important:** It should **not** mention any split between the artist and
  Custom Canvas anywhere a logged-out visitor can see. If you spot a "15%" or an
  "85/15" on any page while signed out, **report it immediately** — that's one
  we specifically care about.

### 3.7 — Try to do something you're not allowed to

- **Do:** Still signed out, try to save a piece or open `/orders` by typing
  https://customcanvas.shop/orders into the address bar.
- **Expect:** You get sent to the sign-in page. After signing in, you land where
  you were trying to go — not dumped back at the home page.

### 3.8 — The cookie / consent banner

- **Expect:** If a cookie notice appears, it should be dismissible and should
  stay dismissed after a reload.

### 3.9 — Squash the window

- **Do:** Drag the edge of your browser window until it's phone-narrow.
- **Expect:** The layout rearranges. A menu button replaces the navigation.
  **The page never scrolls sideways.** Sideways scroll is always a bug.

### 3.10 — Old addresses

- **Do:** Type https://customcanvas.shop/galleries into the address bar.
- **Expect:** It takes you to the Partners page rather than showing an error.

---

## Part 4 — The Artist, part one: build a shop

*Sign in with your `+artist` account.*

This is the most important role in the product and the longest part of the
document. Take your time. Treat it as if you were a real painter trying to sell
work for the first time.

### 4.1 — Where you land

- **Do:** Sign in with your `+artist` address.
- **Expect:** You land in the **Studio** — your workspace. Across the top there
  are five tabs: **Studio**, **Work**, **Sales & Money**, **Public Page**,
  **Services**.

### 4.2 — Finish setting up your artist profile

- **Expect:** The site takes you to the setup wizard **on its own** — a progress
  bar and four steps: **Basics**, **About**, **Preferences**, **Agreement**.
  However you arrive (straight after confirming your email, or by signing in
  later), an artist who hasn't finished setup should always land here.
- **Report:** If you ever see a bare Studio page with empty numbers and no
  wizard — the automatic hand-off failed.

### 4.3 — Step one: Basics

- **Expect:** Boxes for **Display Name**, a larger box asking "What were you
  making before you knew it was called art?", and **School / University**.
- **Do:** Fill them in. Use a made-up artist name you'll recognise later — say
  **Nora Bellweather**. Click **Next**.

### 4.4 — Step two: About

- **Expect:** **Artist Statement** and **Influences**.
- **Do:** Write a couple of real sentences in each. Click **Next**.

### 4.5 — Step three: Preferences

- **Expect:** **City**, **Neighborhood**, a dropdown to choose how work reaches
  buyers (**Ships Nationally / Ships Locally / Pickup Only / Artist Delivered**),
  and a tick-box for **Open to commissions**.
- **Do:** City `Houston`, Neighborhood `Montrose`, choose **Ships Nationally**,
  and **tick Open to commissions** — you'll need it in Part 11. Click **Next**.

### 4.6 — Step four: the Agreement

- **Expect:** A short plain-English summary of the Artist Agreement in a box, a
  link to read the full version, and a tick-box that says you agree to it
  **including the 15% platform commission on each sale**.
- **Do:** Click the link to read the full agreement first. Read it as an artist
  would.
- **Report:** Anything in it that is unclear, alarming, or that you'd want a
  straight answer on before signing.
- **Do:** Try clicking **Complete Setup** **without** ticking the box.
- **Expect:** It won't let you. The button is dead until you tick.
- **Do:** Tick the box and click **Complete Setup**.
- **Expect:** You land in the Studio.

### 4.7 — The setup checklist

- **Expect:** The Studio now shows a panel headed **"Build your shop, then submit
  it for review"**, with a progress bar, a counter like **0/8** or **1/8**, and
  eight rows:
  1. Add a profile photo
  2. Tell your story (100+ characters)
  3. Pick your mediums
  4. Set your neighborhood
  5. Choose shipping or pickup
  6. Add a banner image
  7. Create your first listing — aim for 3+ photos
  8. Connect Stripe so you can get paid
- **Expect:** Some rows already ticked off from the wizard. Underneath there's a
  **Submit for review** button, greyed out, with a note saying what's still
  needed.
- **Do:** Click one of the unticked rows.
- **Expect:** It takes you to the right page to do that thing.

### 4.8 — Try to submit too early

- **Do:** Try clicking **Submit for review** right now.
- **Expect:** Nothing happens — the button is disabled — and there's a visible
  explanation: you need a profile photo, your story, and at least one listing.
- **Report:** If it lets you submit an empty shop, that's a finding.

### 4.9 — Fill in your public page

- **Do:** Go to the **Public Page** tab.
- **Expect:** A long form: display name, your story, mediums, city,
  neighbourhood, school and graduation year, artist statement, influences,
  website, plus places to upload a **profile photo** and a **banner image**, and
  a completeness percentage that goes up as you fill things in.
- **Do:** Fill in everything. Upload a profile photo (any square-ish photo) and a
  banner (any wide photo). Write a story of at least a few sentences.
- **Expect:** Each upload shows the image after it finishes. The completeness
  percentage rises.
- **Report:** Any upload that fails, hangs, or shows a broken-image icon. Note
  the file size and type if it does.

### 4.10 — Try to break the uploader

- **Do:** Try uploading something that isn't a photo — a PDF, or a Word document.
- **Expect:** A clear message saying what's allowed. Not a crash.
- **Do:** Try uploading a very large photo (10 MB or more) if you have one.
- **Expect:** Either it works, or it tells you the limit. Either is fine; a
  silent failure is not.

### 4.11 — Add your education

- **Do:** In the education section, add an entry. Put **Glassell School of Art**
  as the school name, with a year.
- **Expect:** It saves. (This matters later — in Part 12 you'll see this artist
  appear automatically on a school partner's page.)

### 4.12 — Add personal photos

- **Do:** Find the section for photos of you and your studio. Add two or three
  with captions.
- **Expect:** They upload, you can reorder them, and you can delete one.

### 4.13 — Pick your accent colour

- **Do:** Choose a different accent colour swatch and save.
- **Expect:** It saves. You'll check what it did to your public page in 4.22.

### 4.14 — Create your first listing

- **Do:** Click **New Listing** (top right of the Studio) or the checklist row.
- **Expect:** A **Create Listing** form with: **Title**, **Description**,
  **Medium**, **Width / Height / Depth (cm)**, **Year Created**, **Series**, a
  tag picker, **Price ($)**, a **Show price publicly** tick-box, a **Shipping**
  section, a section headed **How it was made**, and an image uploader.

- **Do:** Fill it in like this, exactly — the specific numbers matter for later
  parts:

  | Field | Use this |
  |---|---|
  | Title | `Morning in Montrose` |
  | Description | **At least 150 characters.** Write three or four real sentences about the piece, its condition, and how it's finished. This is not padding — a rule later in the test depends on it. |
  | Medium | `Oil on canvas` |
  | Size | any numbers |
  | Year | `2026` |
  | Price | `20` |
  | Shipping | `5` |
  | Photos | **at least 3** — any three photos will do |

- **Do:** Pick a few tags from the tag picker.
- **Expect:** Tags are chosen from a list of chips, not typed freely, with a
  limit of around ten.

### 4.15 — The "How it was made" question

- **Expect:** Two choices: **"No generative AI was used."** and **"A generative
  tool was part of my process."**
- **Do:** Select the second one.
- **Expect:** A new box appears asking **"What did you contribute?"**
- **Do:** Type just a couple of characters into it and try to save.
- **Expect:** It refuses — the answer has to be a real explanation (about twenty
  characters or more).
- **Do:** Now select **"No generative AI was used."** instead and carry on. The
  extra box should disappear.

### 4.16 — Save it as a draft first

- **Do:** Click **Save as draft**.
- **Expect:** You land in **Work**, and the piece is listed there with a draft
  marker.
- **Do:** Open the piece again and click **Publish Listing**.
- **Expect:** The draft marker goes away.

### 4.17 — Create a second listing

- **Do:** Make one more, called `Bayou Study`, priced `$8`, free shipping, with
  **only one photo** and a **short one-line description**.
- **Why:** This one is deliberately sloppy. Later on you'll see the difference it
  makes to the artist's protection when something goes wrong.

### 4.18 — Nothing is public yet

This is the single most important check in this part.

- **Do:** In the Studio, find the link to preview your own public page and copy
  its web address (it looks like
  `https://customcanvas.shop/artist/nora-bellweather`).
- **Do:** Open a **completely separate private/incognito window** where you are
  signed in as nobody, and paste that address in.
- **Expect:** **Page not found.** Your shop is invisible to the public until it's
  approved.
- **Do:** Now do the same with one of your listing addresses.
- **Expect:** **Page not found** again.
- **Do:** Search the site for `Morning in Montrose` while signed out.
- **Expect:** No results.
- **⚠ Report immediately if any of these are visible.** An unapproved shop
  showing up in public is the most serious kind of problem in this document.
- **Do:** Back in your artist window, confirm **you** can still preview your own
  page.

### 4.19 — Submit for review

- **Do:** Go back to the Studio. The checklist should now be mostly ticked and
  **Submit for review** should be live.
- **Do:** Click it.
- **Expect:** A confirmation, and the panel changes to say your shop is **in
  review**.
- **Do:** Try clicking submit a second time.
- **Expect:** It tells you it's already in review rather than submitting twice.

### 4.20 — Keep working while you wait

- **Do:** Edit your story while in review.
- **Expect:** You can still edit everything. Being in review doesn't lock you
  out.

> ### ⇄ SWITCH TO: the Administrator
> Your shop is now sitting in a queue and nothing further happens until someone
> approves it. **Go to your admin browser window and do all of Part 5.** Then
> come back here for Part 6.
>
> *If the administrator login isn't working, chase Chris now — you are blocked
> until it does.*

---

## Part 5 — The Administrator, part one: review the application

*Sign in as the Administrator, in a different browser from the artist.*

### 5.1 — Where you land

- **Do:** Sign in with your `+admin` address.
- **Expect:** You land on the **admin panel** rather than the normal home page.
- **If instead** you land on the ordinary home page and there's no admin
  anywhere, you're signed in as somebody else. Sign out and sign back in with
  the administrator login from step 1.2.

### 5.2 — The admin dashboard

- **Expect:** Counters across the top — **Total Users**, **Artists**, **Active
  Listings**, **Total Orders** — then **Total Revenue**, **Platform Revenue
  (15%)** and **Pending Reports**. Then two charts for the last 30 days, recent
  orders, recent sign-ups, and nine section cards: **Featured**, **Users**,
  **Galleries**, **Listings**, **Orders**, **Disputes**, **Verifications**,
  **Applications**, **Services**.
- **Check:** Do the numbers match reality? You should see roughly 4 users (your
  four accounts), 1 artist, 2 listings, 0 orders, $0 revenue.
- **Report:** Any number that's obviously wrong. A count being off by one is
  worth reporting.

### 5.3 — Open every section once

- **Do:** Click into all nine cards, one at a time, and come straight back.
- **Expect:** Nine pages that load. None blank, none erroring, none endlessly
  spinning.

### 5.4 — Find the waiting artist

- **Do:** Open **Applications**.
- **Expect:** A page headed **Artist Applications** with **Nora Bellweather**
  waiting. The entry shows her city, how many listings she has, the date she
  applied, an excerpt of her story, small thumbnails of her work, and a **View
  profile ↗** link.
- **Do:** Click **View profile ↗**.
- **Expect:** Her page opens in a new tab so you can judge the work — even though
  it isn't public yet.

### 5.5 — Reject her first (on purpose)

We need to know the rejection path works, so use it before you approve.

- **Do:** Click **Reject**.
- **Expect:** A box appears asking what needs to change, and it warns you that
  **the artist will see what you type**.
- **Do:** Try clicking send with the box empty.
- **Expect:** It won't let you — a reason is required.
- **Do:** Type `Please add at least one more photo to your second listing.` and
  send it.
- **Expect:** A confirmation, and she disappears from the queue.

> ### ⇄ SWITCH TO: the Artist
> Go to your artist window and do steps 6.1 and 6.2 now. Then come back here for
> step 5.6.

### 5.6 — Approve the resubmission

- **Do:** Refresh **Applications**. Nora should be back in the queue.
- **Do:** Click **Approve**.
- **Expect:** A confirmation along the lines of "Artist approved — now live", and
  she leaves the queue.

### 5.7 — Check your notifications

- **Do:** Look at the notification bell.
- **Expect:** You were notified when her application arrived, and the
  notification takes you to the Applications page when clicked.

> ### ⇄ SWITCH TO: the Artist
> Continue at step 6.3.

---

## Part 6 — The Artist, part two: going live

*Back in your `+artist` window.*

### 6.1 — See the rejection

- **Do:** Reload the Studio.
- **Expect:** A message telling you the application wasn't approved, showing
  **the exact sentence the admin typed** ("Please add at least one more photo…").
  The checklist heading changes to something like *"Address the feedback, then
  resubmit for review"*.
- **Do:** Check your inbox.
- **Expect:** An email with a subject like **"A note about your Custom Canvas
  application"**, containing the same reason.
- **Read it as an artist would.** Does it feel like a door closing, or like a
  fixable note? Tell us how it lands. This email matters more than most.

### 6.2 — Fix it and resubmit

- **Do:** Go to **Work**, open `Bayou Study`, add two more photos, save.
- **Do:** Back in the Studio, click **Resubmit for review**.
- **Expect:** It goes back into review.

> ### ⇄ SWITCH TO: the Administrator — do step 5.6 (approve her), then come back.

### 6.3 — You're live

- **Do:** Reload the Studio.
- **Expect:** The checklist and the review banner are gone. The Studio now shows
  a **Profile Completeness** percentage, a needs-attention area, a week summary,
  and counters for Listings, Total Sales and Revenue.
- **Do:** Check your inbox.
- **Expect:** An email: **"You're approved — your Custom Canvas shop is live"**.
- **Do:** Check the notification bell in the site header too.

### 6.4 — Everything appears at once

- **Do:** In a signed-out window, visit your artist page address again — the one
  that showed "not found" at step 4.18.
- **Expect:** It now loads for the public.
- **Do:** Check both listings load publicly, and search for `Morning in Montrose`
  signed out.
- **Expect:** It's findable now.

### 6.5 — Look at your public page as a stranger

- **Do:** Use the **Preview as visitor** button in the Studio.
- **Expect:** Your page with your banner, your accent colour on the buttons, your
  story, your education, your studio photos, and both pieces.
- **Look hard at this page.** It is the artist's shop window and the single most
  important screen in the product. Is anything squashed, stretched, misaligned or
  empty? Does your accent colour actually show up?

### 6.6 — Pin your best work

- **Do:** In the Studio, use the pinned-work picker to pin `Morning in Montrose`.
- **Expect:** On your public page it now leads.

### 6.7 — Connect Stripe so you can be paid

> **Read this before you start.** Stripe is the company that handles the actual
> money — it is a separate company from Custom Canvas. To pay you, they are
> legally required to verify who you are: your legal name, date of birth,
> address, the last four digits of your Social Security number, and a bank
> account.
>
> **If you'd rather not hand over those details, stop here and tell Chris** —
> he'll complete this one step with his own details and you can carry on from
> 6.9. That is a completely reasonable choice and it doesn't weaken the test.

- **Do:** Go to **Sales & Money**. Find **Connect with Stripe** and click it.
- **Expect:** You leave Custom Canvas and land on a Stripe-branded page.
- **Expect:** The Stripe pages carry the **Custom Canvas** name and logo. That is
  configured, so a generic or unbranded Stripe screen is a defect, not a matter
  of opinion.
- **Do:** Work through Stripe's questions and finish.
- **Expect:** You come back to Custom Canvas, to **Sales & Money**, with a
  success message.

### 6.8 — Confirm you're connected

- **Expect:** **Sales & Money** shows a **Connected** badge and "Stripe account
  is active", plus a link to open your Stripe dashboard.
- **Expect:** A note telling you payouts are **delayed by 14 days** and a link to
  the **Artist Agreement**.
- **Read that note.** As an artist, is it clear why the money waits two weeks? Or
  does it read as if you're being messed around? Tell us.
- **Expect:** The "set up your Stripe account" prompt on the Studio home has
  disappeared.

### 6.9 — Your money summary

- **Expect:** **Sales & Money** shows **Total Earnings**, **Completed Sales** and
  **Awaiting Shipment** — all zero right now — and an empty sales area saying
  something friendly rather than showing an empty table.

### 6.10 — Set up a series

- **Do:** Go to **Work**, find the series section, and create a series called
  `Bayou Works` with a cover image. Put `Bayou Study` in it.
- **Expect:** The series shows as a tab on your public page.
- **Do:** Delete the series.
- **Expect:** It asks you to confirm, and **the listing survives** — deleting a
  series must not delete the art. Check `Bayou Study` is still in Work.
- **Do:** Recreate the series afterwards.

### 6.11 — The Services tab

- **Do:** Open the **Services** tab.
- **Expect:** A directory of local providers — art photographers, framers,
  printers. It will be **empty right now**; the admin fills it in at step 13.9.
  Come back after that and check it's populated.

### 6.12 — Ask to be Local Verified

- **Do:** On the Studio home, find the **Get Local Verified** card and click
  **Request verification**.
- **Expect:** A short form: what connects you to the area (**Local art school /
  Live in the community / Local studio space / Other**) plus a details box.
- **Do:** Try submitting with the details box empty.
- **Expect:** It asks you to explain.
- **Do:** Fill it in and submit.
- **Expect:** A confirmation and an **Under review** badge.
- **Do:** Try to submit a second request.
- **Expect:** It won't let you have two open at once.

> ### ⇄ SWITCH TO: the Administrator — do step 13.6 (approve the verification),
> then come back.

### 6.13 — The badge arrives

- **Expect:** A notification and an email, and a verified badge on your public
  page.

### 6.14 — Away mode

- **Do:** On the Studio home find **Away mode**. Set a return date and a short
  message like `Back from Spring Break April 2!` and turn it on.
- **Expect:** A confirmation that your shop is paused.
- **Do:** Look at your public page in a signed-out window.
- **Expect:** An away notice showing your return date. **The buy option should be
  gone** and commissions paused.
- **Do:** Turn it back off.
- **Expect:** "Welcome back" and everything is restored. **Check that buying is
  really available again** before you go on to Part 9 — this is exactly the sort
  of switch that gets stuck.

---

## Part 7 — The Visitor again: now there's art

*Signed out. Repeat some of Part 3 now that the site isn't empty.*

### 7.1 — The home page with content

- **Expect:** Nora's work appears in the browse area.
- **Look at:** Do the photos fill their spaces properly, or are they stretched
  and squashed? Do prices show?

### 7.2 — Scroll and sort

- **Do:** Change the sort — Newest, Price low to high, Price high to low, Most
  Saved.
- **Expect:** The order actually changes each time.

### 7.3 — Switch between art and artists

- **Do:** Find the toggle between browsing pieces and browsing artists.
- **Expect:** Both views work and Nora appears in the artists view.

### 7.4 — Filters

- **Do:** Try the filters: search text, medium, price range, neighbourhood,
  commissions-open, availability.
- **Expect:** Results narrow. **Copy the web address after filtering, paste it
  into a new tab** — you should get the same filtered view back.

### 7.5 — Search that forgives

- **Do:** Search for each of these: `oil`, `oil painting`, `oil paintings`,
  `Montrose`, `Nora`, `morning`.
- **Expect:** Sensible results from all of them. Extra words shouldn't wipe out
  the results.
- **Do:** Now search `zebra unicorn helicopter`.
- **Expect:** A friendly empty state.

### 7.6 — Search suggestions

- **Do:** Type three or more letters into the top search box and wait.
- **Expect:** Suggestions appear listing matching artists and pieces. Clicking
  one takes you there.

### 7.7 — Open a listing

- **Do:** Open `Morning in Montrose`.
- **Expect:** The photos in a carousel you can click through, the size, medium
  and year, the price, and a **Service fee** line with an estimated total.
- **Check the money:** price `$20.00`, shipping `$5.00`, **service fee `$1.06`**,
  total `$26.06` before tax. If those numbers differ by even a cent, report it
  with a screenshot.
- **Expect:** No mention anywhere of the artist's split or "15%".

### 7.8 — The purchase button while signed out

- **Expect:** There is a way to buy, and clicking it sends you to sign in.

### 7.9 — Share it

- **Do:** Use the share button.
- **Expect:** A link is copied. Paste it into a message to yourself.
- **Look at:** Does a preview card with the artwork appear in your messaging app,
  or just a bare blue link? Report which — this is how art gets shared.

### 7.10 — Related work

- **Expect:** Other pieces shown below the listing.

### 7.11 — The artist's public page

- **Do:** Click through to Nora's page.
- **Expect:** Everything you set up in Part 4 and 6: banner, story, education,
  photos, series tab, commission panel, verified badge, pinned piece leading.

### 7.12 — Try a nonsense address

- **Do:** Type https://customcanvas.shop/artist/does-not-exist into the address
  bar.
- **Expect:** A proper "not found" page with a way back — not a raw error.

---

## Part 8 — The Art Lover: browsing and talking

*Sign in with your `+buyer` account, in its own window.*

### 8.1 — Where you land

- **Expect:** The normal home page — buyers don't get a dashboard. Your name is
  in the top-right menu, with **My Account**, **Saved Art**, **Following** and
  **Orders**.

### 8.2 — Save a piece

- **Do:** Click the heart on `Morning in Montrose`.
- **Expect:** It responds instantly.
- **Do:** Open **Saved Art** from the menu.
- **Expect:** The piece is there.
- **Do:** Unsave it, then save it again.

### 8.3 — Follow the artist

- **Do:** On Nora's page, follow her.
- **Expect:** The button changes to show you're following.
- **Do:** Open **Following** from the menu.
- **Expect:** She's listed.

### 8.4 — The artist gets told

> ### ⇄ SWITCH TO: the Artist
> Check the artist's notification bell. **Expect** a new-follower notification.
> Come straight back.

### 8.5 — Recently viewed

- **Do:** Open three or four pieces, then go back to the home page.
- **Expect:** A "recently viewed" row showing what you looked at.

### 8.6 — Message the artist

- **Do:** On a listing, click the option to message the artist.
- **Expect:** A conversation opens with the piece pinned at the top as context,
  and a message already partly written for you.
- **Expect — and check this carefully:** the message box and the send button are
  **visible straight away without scrolling**. The page itself should not scroll;
  only the conversation should.
- **Do:** Send it.

### 8.7 — Send an attachment

- **Do:** Send a photo, then send a PDF.
- **Expect:** Both attach and appear in the conversation. Clicking the photo
  opens it large.

### 8.8 — Try a huge file

- **Do:** Try attaching something over 10 MB.
- **Expect:** A clear message about the limit. Not a silent failure and not a
  spinner that never finishes.

### 8.9 — The artist replies

> ### ⇄ SWITCH TO: the Artist
> - **Expect:** An unread badge on the messages icon, a notification, **and an
>   email with the subject "New message from …"**.
> - **Do:** Open the conversation and reply.
> - **Expect:** Your reply appears. If both windows are open side by side, see
>   whether the buyer's window updates on its own without a refresh.

### 8.10 — Read receipts and badges

*Back as the buyer.*

- **Expect:** The unread badge appears, then clears once you've read the thread.

### 8.11 — Mute a conversation

- **Do:** Open the conversation's menu (usually a "…" button) and choose **Mute
  conversation**.
- **Expect:** A confirmation and a visible muted marker in your list.
- **Do:** Unmute it again.

### 8.12 — Your account page

- **Do:** Open **My Account**.
- **Expect:** Your photo, name and email, with your role shown but not editable.
- **Do:** Change your name and save.
- **Expect:** It saves, and the new name shows in the header.

### 8.13 — Change your password

- **Do:** Use **Change Password**. Set a new one, then sign out and back in with
  it.
- **Expect:** Works. Then change it back to your usual one.

### 8.14 — Password mismatch

- **Do:** Try changing your password with the two boxes not matching.
- **Expect:** It tells you clearly rather than silently doing nothing.

### 8.15 — Unsubscribe from an email

- **Do:** Find any email Custom Canvas has sent you and click its unsubscribe
  link. Then go to **My Account**.
- **Expect:** An **Email Preferences** section with four switches — messages, new
  work from artists you follow, price drops, product news — now all **off**.
  Turn them back on and save.
- **Report:** If the section is missing, the switches don't reflect the
  unsubscribe, or saving fails.

### 8.16 — Notifications page

- **Do:** Open the notifications list (bell icon, or the menu on a phone).
- **Expect:** Everything you've been notified about, newest first, each one
  clicking through to the right place.

### 8.17 — Look at the artist's page as a buyer

- **Read her story and statement.** Would you buy from this person? What's
  missing that you'd want to know before spending money?

### 8.18 — Ask a question about the piece

- **Do:** Send Nora a message asking whether the piece is framed.
- **Why:** This one matters for Part 9 — an artist who ignores buyer messages
  loses their protection, and we want the conversation on record.

---

## Part 9 — The purchase

> ## ⚠ Real money
>
> This is the one part that spends actual money on an actual card. The piece is
> $20 plus $5 shipping plus a $1.06 fee plus sales tax — call it **$28**. It is
> refunded in Part 10.
>
> Use a **personal card you control**. Take a screenshot of every screen in this
> part — if anything goes wrong with real money we need the evidence.
>
> Before you start, note the exact time. Write it down.

*As the buyer.*

### 9.1 — Start the purchase

- **Do:** Open `Morning in Montrose` and click to buy.
- **Expect:** A page headed **Checkout**.

### 9.2 — Check the money before you spend it

- **Expect, exactly:**

  | Line | Amount |
  |---|---|
  | Price | $20.00 |
  | Shipping | $5.00 |
  | Service fee | $1.06 |
  | **Total** | **$26.06** |

- **Expect:** A note saying the service fee covers payment processing and applies
  to every order, and that **sales tax is worked out at payment**.
- **⚠ If any number is different, stop and report it before paying.**

### 9.3 — The small print

- **Expect:** Above the pay button, a line saying that by buying you agree to the
  **Terms of Sale** (a working link), including the artist-mediated refund policy
  and the non-refundable service fee — and that the charge will appear as
  **CUSTOM CANVAS** on your statement.
- **Do:** Click the Terms of Sale link and check it opens.

### 9.4 — Your address

- **Do:** Fill in a real Texas address (yours is fine).
- **Do:** First try leaving a required box empty and continuing.
- **Expect:** It tells you what's missing rather than failing silently.

### 9.5 — Pay

- **Do:** Complete the address and click the pay button.
- **Expect:** You go to a Stripe payment page.
- **Expect:** That page carries **Custom Canvas** branding and logo — report it if
  it doesn't.
- **Expect:** Sales tax now appears, calculated for your address.
- **Do:** Pay with your real card.

### 9.6 — Coming back

- **Expect:** You return to Custom Canvas, to your orders, with a success
  message. The order is listed as **Paid**.
- **Note the time and take a screenshot.**

### 9.7 — Check your bank

- **Do:** Look at your banking app.
- **Expect:** A pending charge for the full amount, showing as **CUSTOM CANVAS** —
  exactly that, in capitals. It is configured to read that way, so anything else
  is a defect.
- **Report:** If it shows as anything else — a random company name, a Stripe
  reference, gibberish — that is important.

### 9.8 — Your confirmation email

- **Expect:** An email, subject **"Order confirmed: Morning in Montrose"**.
- **Check:** Are the amounts in the email the same as what you paid? Is the
  service fee shown? Does it say what happens next?

### 9.9 — The piece is off the market

- **Do:** In a signed-out window, open `Morning in Montrose`.
- **Expect:** It says it's no longer available, and it has left the browse feed.
- **⚠ Report immediately if a second person could still buy it.**

> ### ⇄ SWITCH TO: the Artist

### 9.10 — The artist finds out

- **Expect:** A notification, and **an email with the subject "You made a
  sale: Morning in Montrose"**.
- **Expect:** The Studio's needs-attention area says there's an order awaiting
  shipment.

### 9.11 — The artist's money

- **Do:** Open **Sales & Money**.
- **Expect:** The order listed, marked **Paid**, showing the artist's payout as
  **$22.00** — that's $20 minus the 15% commission ($3.00), plus the $5 shipping.
- **Expect:** **Total Earnings $22.00**, **Awaiting Shipment 1**.
- **⚠ If the payout is not exactly $22.00, report it with a screenshot.**

### 9.12 — The protection badge

- **Expect:** Somewhere on that order, a badge saying something like **"Not
  protected yet"** which you can open to see what's still required.
- **Do:** Open it and read the list.
- **Expect:** It should be telling you to ship the order, add a tracking number
  and a carrier, and get delivery confirmed. It should **not** be telling you to
  add photos — you added three, and that was locked in when the piece sold.
- **Read it as an artist would.** Is it clear what you're being asked to do and
  why? Or does it feel like a threat? Tell us.

### 9.13 — Ship it

- **Do:** Click **Mark as Shipped**.
- **Expect:** A window headed **Ship Order** asking for a **Carrier** (USPS, UPS,
  FedEx, DHL) and a **Tracking Number**.
- **Do:** First try saving with both boxes empty.
- **Expect:** It asks for them.
- **Do:** Choose **USPS**, type any tracking number like `9400111899223197428490`,
  and save.
- **Expect:** A confirmation and the order changes to **Shipped**.

### 9.14 — The buyer sees the tracking

> ### ⇄ SWITCH TO: the Art Lover
>
> - **Expect:** An email with the subject **"Your order has shipped: Morning in
>   Montrose"**.
> - **Do:** Open **Orders**.
> - **Expect:** The order shows as **Shipped**, with the tracking number and the
>   city it's shipping to.

### 9.15 — Mark it delivered

> ### ⇄ SWITCH TO: the Artist
>
> - **Do:** In **Sales & Money**, click **Mark Delivered**.
> - **Expect:** The order becomes **Delivered**.
> - **Do:** Look at the protection badge again.
> - **Expect:** It should now say **Protected**. If it doesn't, open it and write
>   down exactly which line is still failing — that's the finding.

### 9.16 — Leave a review

> ### ⇄ SWITCH TO: the Art Lover
>
> - **Do:** In **Orders**, on the delivered order, click **Leave a Review**.
> - **Expect:** A star rating and a comment box.
> - **Do:** Give 5 stars and write a sentence. Submit.
> - **Expect:** A thank-you, and the button is replaced by a note that you've
>   already reviewed.
> - **Do:** Go to Nora's public page.
> - **Expect:** Your review is displayed, with her overall rating updated.
> - **Do:** Try to review the same order again.
> - **Expect:** You can't.
>
> ### ⇄ SWITCH TO: the Artist — expect a notification and an email with the
> subject **"New 5-star review from …"**.

---

## Part 10 — The refund

*This one moves through all three roles in sequence. The policy is: the buyer
asks the artist, the artist agrees, and Custom Canvas moves the money.*

### 10.1 — There is no self-service cancel

*As the buyer.*

- **Do:** Look at your order in **Orders**.
- **Expect:** There is no "cancel order" button. That's deliberate.

### 10.2 — Ask for a refund

- **Do:** Click **Request a refund**.
- **Expect:** You are taken into a conversation with the artist, with a message
  already written that includes your order number and the piece's title.
- **Do:** Add a sentence explaining why and send it.

### 10.3 — The artist decides

> ### ⇄ SWITCH TO: the Artist
>
> - **Expect:** The message arrives, and a notification.
> - **Do:** Go to **Sales & Money**, find the order, click **Approve refund**.
> - **Expect:** A confirmation box that explains exactly what will happen: the
>   buyer gets the price and shipping back, the service fee is **not** refunded,
>   and the artist's payout is reversed.
> - **Read that box carefully.** Is it clear? Would an artist understand they're
>   giving back $22.00?
> - **Do:** Click **Cancel** first, and check nothing happened.
> - **Do:** Then do it again and approve.
> - **Expect:** The row changes to say Custom Canvas is settling the payment.

### 10.4 — The buyer waits

> ### ⇄ SWITCH TO: the Art Lover
>
> - **Expect:** The order says something like *"Refund approved — Custom Canvas
>   is settling your payment."*
> - **Expect:** The money has **not** moved yet. That's correct — an
>   administrator still has to release it.

### 10.5 — The administrator settles it

> ### ⇄ SWITCH TO: the Administrator
>
> - **Expect:** A notification that a refund needs settling. Clicking it takes
>   you to **Orders**.
> - **Do:** Open **Orders**. Find the order — it should have a **Settle refund**
>   button that no other order has.
> - **Do:** Click it.
> - **Expect:** A confirmation spelling out the exact amounts: what the buyer
>   gets back including tax, that the service fee and its tax are kept, and that
>   the artist's payout of $22.00 is reversed.
> - **Check those numbers against what was actually paid.** Write them down.
> - **Do:** Confirm.
> - **Expect:** The order status becomes **Refunded**.

### 10.6 — Everyone's view afterwards

- **As the buyer:** the order shows **Refunded**.
- **As the artist:** the sale shows **Refunded**, and Total Earnings has dropped
  back to $0.00.
- **As the administrator:** total revenue reflects the refund.

### 10.7 — The piece comes back

- **Do:** In a signed-out window, open `Morning in Montrose`.
- **Expect:** It is **for sale again** — it was never shipped for real, so it
  goes back on the market.

### 10.8 — The money actually comes back

- **Do:** Check your bank over the next few days.
- **Expect:** **$26.06 minus the service fee** — you get the $20 price, the $5
  shipping and the tax on them; the $1.06 fee is kept. Card refunds usually take
  5–10 working days.
- **Do:** Write down the exact amount and the date it landed, and send that to
  Chris. **This is the single most valuable number in the whole test.**

### 10.9 — Try to refund it twice

> ### ⇄ SWITCH TO: the Administrator
>
> - **Do:** Try to settle the same refund again.
> - **Expect:** You can't — the button is gone, or it refuses.

---

## Part 11 — Commissions

*A commission is a custom piece. No money changes hands through the site — it's
a conversation with a structure around it.*

### 11.1 — Request one

*As the buyer.*

- **Do:** Go to Nora's page and find the commission panel. Request a commission.
- **Expect:** A form asking for a title, a description of what you want, and a
  budget range.
- **Do:** Try submitting it empty.
- **Expect:** It tells you what's needed.
- **Do:** Fill it in — `A portrait of my dog`, a couple of sentences, budget
  $200–$400 — and submit.
- **Expect:** You land **in a conversation** with the artist. Your inbox has a
  Commissions section, and this thread is marked as a new request.

### 11.2 — The artist sees it

> ### ⇄ SWITCH TO: the Artist
>
> - **Expect:** A notification, **an email with the subject "New commission
>   request: A portrait of my dog"**, and the request in needs-attention.
> - **Do:** Open the conversation.
> - **Expect:** A side panel (on a phone, a "commission details" sheet) showing
>   the brief and the budget, with actions: **Send Quote** and **Decline**.

### 11.3 — Send a quote

- **Do:** Click **Send Quote**.
- **Expect:** Boxes for a price, a timeline and notes.
- **Do:** Try sending it with a nonsense price like `abc` or `-50`.
- **Expect:** It refuses politely.
- **Do:** Quote $300, four weeks, and send.
- **Expect:** A quote card appears in the conversation itself, not just in the
  panel.

### 11.4 — The buyer accepts

> ### ⇄ SWITCH TO: the Art Lover
>
> - **Expect:** The quote card in the conversation with **Accept Quote** and
>   **Decline**, and the same in the side panel.
> - **Do:** Click **Accept Quote**.
> - **Expect:** The status changes to in-progress **straight away**, everywhere
>   it's shown — in the thread, the panel and the inbox list.

### 11.5 — Progress updates

> ### ⇄ SWITCH TO: the Artist
>
> - **Do:** From the side panel, post a progress update — a note, a photo and a
>   percentage.
> - **Expect:** It appears in the conversation as an update and in the panel's
>   timeline.

### 11.6 — The buyer is told

> ### ⇄ SWITCH TO: the Art Lover
>
> - **Expect:** A notification, and an email saying the artist posted an update.
> - **Do:** Click the notification.
> - **Expect:** It takes you straight into the conversation.

### 11.7 — Deliver it

> ### ⇄ SWITCH TO: the Artist — click **Mark as Delivered** in the side panel.

### 11.8 — Confirm receipt

> ### ⇄ SWITCH TO: the Art Lover
>
> - **Expect:** The panel shows it as delivered, with **Confirm Receipt** and
>   **Report Issue**.
> - **Do:** Click **Confirm Receipt**.
> - **Expect:** It closes as completed.

### 11.9 — Stale buttons

> ### ⇄ SWITCH TO: the Artist
>
> - **Do:** If any old buttons are still on screen from an earlier stage (like
>   Decline), click one.
> - **Expect:** A clear message that it's no longer possible — **not** a silent
>   change or a corrupted status.

### 11.10 — A second commission, declined

- **Do:** As the buyer, request another commission. As the artist, **Decline**
  it.
- **Expect:** The buyer is told, and the status shows as declined for both.

### 11.11 — A commission the buyer cancels

- **Do:** As the buyer, request a third one, then use **Cancel Request** before
  the artist quotes.
- **Expect:** It cancels cleanly.

### 11.12 — Report an issue

- **Do:** On a delivered commission, use **Report Issue** and describe a problem.
- **Expect:** A confirmation. (The administrator picks this up at step 13.7.)

### 11.13 — Commissions when the artist is away

- **Do:** As the artist, turn on away mode. As the buyer, look at Nora's page.
- **Expect:** Commissions are paused and the away notice explains why.
- **Do:** As the buyer, send her a message.
- **Expect:** **One** automatic reply with her away message — not one every time
  you write.
- **Do:** Turn away mode off again.

### 11.14 — Old links

- **Do:** Type https://customcanvas.shop/commissions into the address bar.
- **Expect:** It takes you to the Commissions section of your inbox.

---

## Part 12 — The Partner

*A partner is a gallery, an art school, or a similar organisation. Sign in with
your `+partner` account.*

### 12.1 — Finish the partner setup

- **Do:** Sign in with your `+partner` address.
- **Expect:** The site takes you to the **Set Up Your Partner Profile** form on
  its own — a partner who hasn't filled it in should always land there, however
  they arrive.
- **Report:** If you instead see a dashboard with a "Pending Review" badge before
  you've set anything up — the automatic hand-off failed.

### 12.2 — Fill in the organisation

- **Expect:** A page headed **Set Up Your Partner Profile** with a dropdown for
  the type of organisation, then **Organization Name**, **Address**, **City**,
  **Neighborhood** and **Website**.
- **Do:** Choose a school if that's an option, and call it **Glassell School of
  Art** — the same name you typed into the artist's education at step 4.11.
  City `Houston`. Click **Submit for Verification**.
- **Expect:** A **Pending Verification** state.

### 12.3 — Pending, but not blocked

- **Do:** Go to the dashboard.
- **Expect:** A **Pending Review** badge and a note saying you can still set up
  your profile and add artists while you wait.
- **Do:** Check whether you can actually do those things while pending.

### 12.4 — Get verified

> ### ⇄ SWITCH TO: the Administrator
>
> - **Do:** Open **Galleries**. Find your partner in the pending list.
> - **Expect:** The organisation's details, and a way to verify or reject it.
> - **Do:** Verify it.
> - **Expect:** A confirmation, and it moves to the verified list.

### 12.5 — The badge

*Back as the partner.*

- **Do:** Reload the dashboard.
- **Expect:** A verified badge instead of the pending one.

### 12.6 — Edit the public profile

- **Do:** Use **Edit Profile**. Add a banner image and a description. Save.
- **Do:** Use **View Public Page**.
- **Expect:** Your organisation's page with the banner, the description and the
  verified badge.

### 12.7 — Build a roster

- **Do:** On the dashboard, click **Add Artist**. Search for `Nora`.
- **Expect:** She's found. Add her.
- **Expect:** A confirmation and she appears in your represented list.
- **Do:** Look at your public page.
- **Expect:** She's shown as represented.

### 12.8 — Remove and re-add

- **Do:** Remove her.
- **Expect:** It asks you to confirm first, then she goes.
- **Do:** Add her back.

### 12.9 — Alumni appear automatically

- **Expect:** Because Nora's education says **Glassell School of Art**, she
  should appear on your page under an alumni/students section **without you
  adding her**.
- **Report:** If she doesn't, that's a finding — say whether she appears in the
  roster, the alumni section, both or neither.

### 12.10 — Curate your picks

- **Do:** Find the picks section. Search for a piece by title and add it.
- **Expect:** A confirmation and the piece in your picks.
- **Do:** Add pieces until it stops you.
- **Expect:** A limit of **six**, enforced clearly.

### 12.11 — Write a curator's note

- **Do:** Add a public note to one of your picks — a sentence about why you chose
  it. Save.
- **Do:** Look at your public page.
- **Expect:** The note appears with the piece, in quote marks.

### 12.12 — Reorder and remove

- **Do:** Reorder your picks and check the public page follows. Remove one.
- **Expect:** Removing asks for confirmation and says the piece stays listed —
  it just leaves your picks.

### 12.13 — The picks shelf on the home page

- **Do:** Go to the home page signed out.
- **Expect:** A shelf crediting your organisation, showing your picks, with a way
  through to your page.

### 12.14 — Partners are people too

- **Do:** As the partner, save a piece and send Nora a message.
- **Expect:** Both work. In the conversation, your organisation's badge shows
  next to your name.

---

## Part 13 — The Administrator, part two

*Sign in as the Administrator.*

### 13.1 — Users

- **Do:** Open **Users**.
- **Expect:** All your accounts listed with names, email addresses and roles.
  Search by name and by email. Each row has a **Send password reset** button.
- **Do:** Click **Send password reset** on your **artist** account and confirm.
  Check your inbox: an email **"Reset your Custom Canvas password"** saying an
  administrator started the reset. Click its link, set a new password, sign in
  with it — then set it back to your usual one.
- **Note:** There is still no way to create a user or change someone's role
  here. Expected, not a bug.

### 13.2 — Listings

- **Do:** Open **Listings**. Search for a piece.
- **Expect:** Everything, **including drafts and hidden pieces** that the public
  can't see.
- **Do:** Hide one of Nora's listings.
- **Expect:** It vanishes from the public browse feed. Check that in a signed-out
  window.
- **Do:** Put it back.

### 13.3 — Orders

- **Do:** Open **Orders**.
- **Expect:** A table with the order, the buyer, the amount, the commission, the
  status and the date, plus totals for revenue and artist payouts and a status
  filter.
- **Do:** Use the filter for each status in turn.
- **Check:** The commission column should read **$3.00** on the $20 order —
  the 15%, not the buyer's service fee.

### 13.4 — Featured shelf

- **Do:** Open **Featured**. Search for a piece by title and add it.
- **Expect:** A confirmation.
- **Do:** Add pieces until it stops you.
- **Expect:** A limit of **ten**.
- **Do:** Reorder with the up/down arrows.
- **Do:** Go to the home page and reload.
- **Expect:** The featured shelf reflects your order.
- **Do:** Remove one.
- **Expect:** It asks you to confirm.

### 13.5 — A featured piece that stops being available

- **Do:** Feature a piece. As the artist, hide that piece. As the admin, reload
  Featured.
- **Expect:** The row shows it as unavailable but still lets you remove it — it
  shouldn't break the page.

### 13.6 — Local Verified queue

- **Do:** Open **Verifications**.
- **Expect:** Nora's request from step 6.12, showing what she wrote.
- **Do:** Approve it.
- **Expect:** A confirmation and it leaves the queue.

### 13.7 — Disputes

- **Do:** Open **Disputes**.
- **Expect:** Anything reported — including the commission issue from 11.12 and
  any reported message from Part 14.
- **Do:** Click **Resolve** on one.
- **Expect:** A choice of outcome — **Dismiss**, **Action Taken**, **Reviewed** —
  and a box for internal notes.
- **Do:** Resolve it with notes.
- **Expect:** It moves to the resolved list, and it's still readable there.

### 13.8 — The pending-reports counter

- **Do:** Go back to the admin home.
- **Expect:** The **Pending Reports** counter matches how many are actually
  waiting, and turns into a link when there's something to look at.

### 13.9 — Services directory

- **Do:** Open **Services**. Add three entries: an art photographer, a framer and
  a printer, each with a name, a short description, city Houston, and a contact
  email or website.
- **Expect:** They save and are listed.
- **Do:** Reorder them and make one inactive.

> ### ⇄ SWITCH TO: the Artist — open the **Services** tab in the Studio.
> **Expect:** The providers you added, grouped as **Art photography**,
> **Framing**, **Printing**. The inactive one should not be there.
> **Expect:** It's clear that booking and paying happens with the provider, not
> through Custom Canvas.

### 13.10 — Charts and stats

- **Do:** Back on the admin home, look at the two 30-day charts.
- **Expect:** They render, they're labelled, and the shape matches what actually
  happened this week.

### 13.11 — Recent activity

- **Expect:** Recent orders and recent sign-ups, both linking through to the full
  lists.

### 13.12 — Admin notifications

- **Do:** Check the bell as the admin.
- **Expect:** Notifications for the artist application and the refund approval,
  each linking to the right admin page.

### 13.13 — Admin pages are actually locked

- **Do:** Sign out completely. Type https://customcanvas.shop/admin into the
  address bar.
- **Expect:** You are refused. You should **not** see any admin content.
- **Do:** Sign in as the **buyer** and try again.
- **Expect:** Refused again.
- **Do:** Try https://customcanvas.shop/admin/orders and
  https://customcanvas.shop/admin/users as the buyer too.
- **⚠ If any admin page shows real data to a non-admin, stop everything and tell
  Chris immediately.**

### 13.14 — Artist pages are locked too

- **Do:** As the **buyer**, try https://customcanvas.shop/studio and
  https://customcanvas.shop/studio/sales.
- **Expect:** Refused. You must not see another person's sales.

### 13.15 — Someone else's order

- **Do:** As the buyer, note the order address from your **Orders** page. Then
  sign in as the **partner** and paste the same address in.
- **Expect:** You can't see somebody else's order.

### 13.16 — Judge the admin panel as a person

- **Read it as an owner would.** If you ran this company, could you find out how
  the business is doing in thirty seconds? What number would you want that isn't
  there?

---

## Part 14 — Safety, settings and the awkward stuff

### 14.1 — Report a message

- **Do:** As the buyer, open the conversation with Nora, open its menu, choose
  **Report user**.
- **Expect:** A reason to choose from — inappropriate behaviour, spam, scam or
  misleading, other — and a place to explain.
- **Do:** Submit one.
- **Expect:** A confirmation that it will be reviewed.
- **Check:** It appears in the admin's **Disputes** (step 13.7).

### 14.2 — Block somebody

- **Do:** As the buyer, open the conversation menu and **Block** Nora.
- **Expect:** A confirmation box before it happens.
- **Do:** Confirm.

### 14.3 — Check the block actually works

> ### ⇄ SWITCH TO: the Artist
> - **Do:** Try to send the buyer a message.
> - **Expect:** You can't. **If the message goes through, that's a serious
>   finding** — write down exactly what you saw.

### 14.4 — Unblock

- **Do:** As the buyer, unblock her.
- **Expect:** Messages work again in both directions.

### 14.5 — No reporting on listings

- **Do:** Look at a listing page for a "report this listing" control.
- **Expect:** There isn't one. Reporting lives in conversations, on people and
  messages. That's deliberate.

### 14.6 — Every dangerous action asks first

- **Do:** Go through these and check **each one asks you to confirm** before
  doing anything: deleting a listing, deleting a series, removing a partner pick,
  blocking someone, approving a refund, removing a featured piece.
- **Expect:** In every confirmation box, the safe choice (Cancel) sits on the
  **left** and the dangerous one on the right.
- **Report:** Any destructive action that just happens with no warning.

### 14.7 — Delete a listing

- **Do:** As the artist, create a throwaway listing and delete it.
- **Expect:** It confirms, then it's gone from Work and from the public site.

### 14.8 — The back button

- **Do:** Use the browser's back button in a few places — after a purchase, in
  the middle of the artist wizard, after sending a message.
- **Expect:** Nothing breaks, nothing duplicates, you never end up on a dead
  page.

### 14.9 — Two tabs at once

- **Do:** Open the same conversation in two tabs and send a message from one.
- **Expect:** No duplicates, no crash.

### 14.10 — Refresh in awkward places

- **Do:** Reload the page while on checkout, mid-wizard, and inside a
  conversation.
- **Expect:** You end up somewhere sensible each time.

### 14.11 — Delete an account

- **Do:** Make a fifth throwaway account with `+throwaway` in the address,
  confirm it, sign in, go to **My Account**, and use the **Danger Zone** to
  delete it.
- **Expect:** It makes you type `DELETE` to confirm.
- **Do:** Then try to sign in with it.
- **Expect:** You can't.

### 14.12 — Sign out everywhere

- **Do:** Sign out of each of your four accounts.
- **Expect:** Clean sign-out, back to the public site, and the protected pages
  are no longer reachable.

---

## Part 15 — On your phone

*Everything above was on a computer. Now do the parts that matter most on an
actual phone, on mobile data if you can — not just a narrowed browser window.*

### 15.1 — The home page

- **Expect:** Loads quickly. The menu button works. Shelves scroll sideways with
  a finger. **The page itself never scrolls sideways.**

### 15.2 — Browse and open a piece

- **Expect:** Photos fill the screen properly. The carousel swipes. Nothing is
  cut off.

### 15.3 — Messaging on a phone

- **Do:** Open a conversation and tap the message box.
- **Expect — this is the one that usually breaks:** when the keyboard comes up,
  **the message box and the send button stay visible.** You should never have to
  scroll to find where to type.

### 15.4 — The commission panel on a phone

- **Expect:** The side panel becomes a sheet you can open, and everything in it
  still works.

### 15.5 — The Studio on a phone

- **Do:** Sign in as the artist on the phone.
- **Expect:** The five tabs are reachable, and the numbers are readable without
  zooming.

### 15.6 — Upload a photo from the phone

- **Do:** Create a listing on the phone using photos from your camera roll.
- **Expect:** It works. Note how long it takes.

### 15.7 — Buying on a phone

- **Do:** Go as far as the Stripe payment page — **you do not have to pay again.**
- **Expect:** The checkout is readable and the totals are clear on a small
  screen.

### 15.8 — Sharing

- **Do:** Use the share button and send a piece to yourself in a text message.
- **Expect:** A preview card with the artwork.

---

## Part 16 — Emails you should have received

By the end you should have all of these. Tick off what arrived; tell us anything
that didn't, anything that went to spam, and anything that looked wrong.

| # | Email | When it should have arrived |
|---|---|---|
| 1 | Confirm your signup (×3) | Part 1 |
| 2 | Password reset | Step 1.8 |
| 3 | A note about your Custom Canvas application | Step 6.1 |
| 4 | You're approved — your shop is live | Step 6.3 |
| 5 | New message from … | Step 8.9 |
| 6 | Order confirmed: Morning in Montrose | Step 9.8 |
| 7 | You made a sale: Morning in Montrose | Step 9.10 |
| 8 | Your order has shipped: Morning in Montrose | Step 9.14 |
| 9 | New 5-star review from … | Step 9.16 |
| 10 | New commission request: A portrait of my dog | Step 11.2 |
| 11 | … posted an update on your commission | Step 11.6 |
| 12 | Reset your Custom Canvas password (admin-started) | Step 13.1 |

**For each one, tell us:** did it arrive, how long did it take, did it land in
the inbox or in spam, does it look like a real company sent it, and does it say
clearly what to do next?

**Also note anything you received that isn't on this list** — and anything you
expected and didn't get. There is deliberately **no email when a refund is
settled**; if you think there should be, say so.

---

## Part 17 — Known limits: please don't report these

These are already understood. Reporting them costs us both time.

1. **Payouts take 14 days.** The artist's money sits in Stripe for two weeks
   before it reaches a bank. That's deliberate — it means a refund can't
   overdraw someone's account.
2. **Card refunds take 5–10 working days** to show on a statement. Not instant.
3. **Local pickup can't be confirmed by either side.** If you set an artist to
   pickup-only, there is no button for the buyer or the artist to confirm the
   handoff. It's a known gap.
4. **The service fee is never refunded**, on any refund, for anyone. Working as
   intended.
5. **Sales tax on refunds** is returned on the price and shipping, but not on the
   service fee. Deliberate.
6. **Commissions don't take payment through the site.** Quotes and progress are
   tracked; the money is arranged between the two of you.
7. **Videos can't be uploaded** anywhere. Photos only.
8. **If you make more than about thirty listings in one minute** you may get
   temporarily blocked. Expected.
9. **Anything you make will be deleted** at the end of this round.

---

## Appendix A — Your account card

Fill this in at step 1.9 and keep it next to you.

```
Testing started:  ____________________

Password (the three you made): ____________________
Administrator password:        ____________________

Administrator   (Chris gives you this one)             browser: ____________
Artist          ____________________@______________   browser: ____________
Art Lover       ____________________@______________   browser: ____________
Partner         ____________________@______________   browser: ____________

Artist display name:      ____________________
Artist page address:      customcanvas.shop/artist/____________________
Partner organisation:     ____________________

Purchase made on:         ______________  Card used: ____________
Amount charged:           $__________     Bank shows: ____________
Refund landed on:         ______________  Amount:     $__________
```

---

## Appendix B — Bug log

Copy this block for every problem. Anything at all — if you're unsure whether
something counts, it counts.

```
─────────────────────────────────────────
Step number:      ______
What I did:
What I expected:
What actually happened:
Screenshot:       yes / no
Device/browser:
Roughly when:
How bad (1 annoying / 2 confusing / 3 broken / 4 costs money or leaks data):
─────────────────────────────────────────
```

### And three questions to answer at the end

Take ten minutes on these when you're done. They're worth more than any single
bug.

1. **If you were an artist with real paintings to sell, would you put them on
   this site?** Why, or why not? What would you need to see first?
2. **If you were a buyer, would you spend $500 here?** What would stop you?
3. **What is the single worst moment in the whole thing** — the point where you
   most wanted to give up?
