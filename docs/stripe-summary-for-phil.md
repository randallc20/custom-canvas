# Custom Canvas payments — where we landed

A plain-language summary of the payment decisions. No code, no jargon.

---

## How money will move

A collector buys a $1,000 painting. Here is what happens:

| | |
|---|---|
| Collector pays | **$1,030.18** plus sales tax |
| → to the artist | **$850.00** |
| → to Custom Canvas | **~$147** |
| → to Stripe | **~$33** |

The artist gets 85% of their asking price, always. We get 15%. Stripe's processing cost
is added on top as a "Service fee" the buyer pays, so it comes out of neither our
commission nor the artist's.

That last part is a change we just made. Previously the fee was capped at $15, so on
anything above about $300 we quietly ate the difference — on a $1,000 sale we netted
$135 instead of $150.

**Our 15% is now close to a real 15%, but not perfectly clean.** Stripe also charges
its percentage on the sales tax portion of each order, which the buyer fee does not
cover, and Stripe Tax has its own small per-transaction cost. On a $1,000 sale that is
roughly $3 total, so we net about $147 rather than $150. We could raise the buyer fee
slightly to close the gap — it is a decision worth making together rather than
drifting into.

One consequence to be aware of: the fee is no longer capped, so it scales with price.
A $100 piece now costs the buyer $3.30 in fees instead of $5. A $1,000 piece costs
$30.18 instead of $15, and a $5,000 piece costs $149.64. Buyers at the high end will
notice that line.

## Artists connect their own bank accounts

When an artist joins, they go through Stripe's own setup and enter their legal name,
date of birth, Social Security number, and bank account details **on Stripe's site, not
ours**. We never see or store any of it.

This matters for two reasons. It is a much better experience for them — it looks and
feels like the standard secure flow they have seen elsewhere. And it means we are not
holding a database full of artists' Social Security numbers, which is a category of
risk we simply do not want.

They also get their own small Stripe dashboard where they can see their earnings and
change their bank account without emailing us.

## Who is responsible when a sale goes wrong

Some buyers dispute charges — the painting arrived damaged, they do not recognize the
charge, occasionally the card was stolen. When that happens the buyer's bank pulls the
money back. This is not optional and no return policy prevents it; a "no returns"
policy governs refunds we choose to give, not what a bank can claw back.

Because we are the merchant of record, that money comes out of our account first, and
we then recover the artist's share from them. Two things reduce how often this bites:

1. **We will require extra card verification on expensive orders.** When a buyer
   authenticates that way, responsibility for fraud disputes shifts entirely to their
   bank. We cannot lose those. This is free.
2. **We will hold artist payouts for about two weeks after delivery.** The money sits
   in the artist's Stripe balance rather than their checking account during the window
   when disputes actually arrive. If one lands, it comes out of a balance instead of
   out of an artist who has already spent it.

We should tell artists about this plainly in the artist agreement. Someone discovering
it from a negative balance is how you lose an artist and everyone they talk to.

## What it costs us to run

About **$68 a month** at ten actively selling artists — Stripe charges $2 per active
artist plus a small per-payout fee. Dormant artists cost nothing. At fifty active
artists it is around $340 a month.

There is a free alternative, but it would require building all the artist payment
screens ourselves — several weeks of work to save $68 a month. Not worth it now. Worth
revisiting if we get large.

## One thing that needs a professional

Because we process the payments, at tax time Stripe reports the **full amount buyers
paid** — including the artists' 85% — as our gross receipts. On $500,000 of sales, the
IRS receives a form saying $500,000, while our actual income is about $75,000 in
commission.

This is normal for marketplaces and entirely fixable: we report the gross and deduct
the artist payments as a cost. But it has to be done correctly, and it is not something
consumer tax software walks you through. Getting it wrong does not produce an error
message — it produces a letter from the IRS a year and a half later.

**Recommendation: pay an accountant once, in year one, to set up the books correctly.**
A few hundred dollars, fully deductible, and it is the single cheapest way to avoid the
one structural trap that catches businesses like ours.

While we are on it, two facts worth knowing as we start spending on client
entertainment: business meals with clients are **50% deductible**, and entertainment —
golf, sporting events, concert tickets — has been **entirely non-deductible since
2018**. If we take a collector to a game and then to dinner, the game is worth nothing
at tax time and the dinner is worth half, and only if they are billed separately.

## What is left before we can take money

1. Link the business bank account to Stripe — it is not connected yet, so we currently
   have nowhere for money to land
2. Get the Texas sales tax permit (free, same-day, at comptroller.texas.gov)
3. A handful of technical fixes, already written up for the developer
4. Decide whether to nudge the buyer fee up to close the sales-tax gap described above
5. One real test purchase, start to finish

Everything else on the Stripe side is done — the account is approved and both payments
and payouts are switched on.
