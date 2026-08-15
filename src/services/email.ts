import { getResend } from '@/lib/resend';

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Custom Canvas <onboarding@resend.dev>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// Every user-supplied value (names, titles, message previews, notes) MUST go
// through escapeHtml before interpolation into template HTML — a display name
// like <a href="evil">…</a> would otherwise render as live markup in a
// genuinely-from-us email (phishing vector). Subjects aren't HTML but must
// not carry line breaks; run them through plain().
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plain(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

export async function sendWelcomeEmail(to: string, name: string, role: string): Promise<void> {
  const roleMessage = role === 'artist'
    ? 'Start by completing your profile and uploading your first piece.'
    : role === 'gallery'
    ? 'Your gallery application is under review. We\'ll notify you once verified.'
    : 'Discover one-of-a-kind pieces from the artists in your community.';

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: 'Welcome to Custom Canvas!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Welcome to Custom Canvas, ${escapeHtml(name)}!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Thank you for joining our community of artists and collectors.</p>
        <p style="color:#666;font-size:16px;line-height:1.5">${roleMessage}</p>
        <a href="${APP_URL}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Get Started</a>
      </div>
    `,
  });
}

export async function sendArtistApprovedEmail(to: string, name: string): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: 'You\'re approved — your Custom Canvas shop is live',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Welcome to Custom Canvas, ${name}!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Your application has been approved. Your profile and listings are now live and visible to buyers in your community.</p>
        <a href="${APP_URL}/studio" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Go to your Studio</a>
      </div>
    `,
  });
}

export async function sendArtistRejectedEmail(to: string, name: string, reason: string): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: 'A note about your Custom Canvas application',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Thanks for applying, ${name}</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">We took a look at your application and it needs a few changes before we can approve it:</p>
        <p style="color:#111;font-size:16px;line-height:1.5;padding:12px 16px;background:#faf3ef;border-radius:6px">${reason}</p>
        <p style="color:#666;font-size:16px;line-height:1.5">Update your profile and resubmit for review whenever you're ready — we'll take another look.</p>
        <a href="${APP_URL}/studio" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Update &amp; resubmit</a>
      </div>
    `,
  });
}

export async function sendNewMessageEmail(
  to: string,
  senderName: string,
  preview: string,
  conversationUrl: string
): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `New message from ${plain(senderName)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">New message from ${escapeHtml(senderName)}</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">&ldquo;${escapeHtml(preview)}&rdquo;</p>
        <a href="${conversationUrl}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">View Conversation</a>
      </div>
    `,
  });
}

export async function sendCommissionRequestEmail(
  to: string,
  artistName: string,
  title: string
): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `New commission request: ${plain(title)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">New Commission Request</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(artistName)}, you have a new commission request: <strong>${escapeHtml(title)}</strong></p>
        <a href="${APP_URL}/commissions" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">View Request</a>
      </div>
    `,
  });
}

export async function sendOrderConfirmationEmail(
  to: string,
  buyerName: string,
  listingTitle: string,
  amount: string,
  orderId: string
): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Order confirmed: ${plain(listingTitle)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Order Confirmed</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(buyerName)}, your purchase has been confirmed!</p>
        <div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0">
          <p style="margin:0;font-weight:bold;color:#111">${escapeHtml(listingTitle)}</p>
          <p style="margin:4px 0 0;color:#666">Total: ${amount}</p>
          <p style="margin:4px 0 0;color:#999;font-size:13px">Order #${orderId.slice(0, 8)}</p>
        </div>
        <a href="${APP_URL}/orders" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">View Order</a>
      </div>
    `,
  });
}

export async function sendNewSaleEmail(
  to: string,
  artistName: string,
  listingTitle: string,
  amount: string,
  payoutAmount: string
): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `You made a sale: ${plain(listingTitle)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">You made a sale!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Congratulations ${escapeHtml(artistName)}, someone just purchased your work!</p>
        <div style="background:#FFF7ED;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #E8704A33">
          <p style="margin:0;font-weight:bold;color:#111">${escapeHtml(listingTitle)}</p>
          <p style="margin:4px 0 0;color:#666">Sale price: ${amount}</p>
          <p style="margin:4px 0 0;color:#E8704A;font-weight:bold">Your payout: ${payoutAmount}</p>
        </div>
        <p style="color:#666;font-size:14px">Please ship the piece promptly and update the order status.</p>
        <a href="${APP_URL}/sales" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">View Order</a>
      </div>
    `,
  });
}

export async function sendShippingUpdateEmail(
  to: string,
  buyerName: string,
  listingTitle: string,
  trackingNumber: string | null
): Promise<void> {
  const trackingBlock = trackingNumber
    ? `<div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0">
        <p style="margin:0;color:#666;font-size:13px">Tracking number:</p>
        <p style="margin:4px 0 0;font-family:monospace;font-weight:bold;color:#111">${escapeHtml(trackingNumber)}</p>
      </div>`
    : '';

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your order has shipped: ${plain(listingTitle)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Your order has shipped!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(buyerName)}, great news — <strong>${escapeHtml(listingTitle)}</strong> is on its way to you!</p>
        ${trackingBlock}
        <a href="${APP_URL}/orders" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">View Order</a>
      </div>
    `,
  });
}

export async function sendReviewReceivedEmail(
  to: string,
  artistName: string,
  rating: number,
  comment: string | null,
  reviewerName: string
): Promise<void> {
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `New ${rating}-star review from ${plain(reviewerName)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">You received a review!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(artistName)}, ${escapeHtml(reviewerName)} left you a review.</p>
        <div style="background:#FFF7ED;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #E8704A33">
          <p style="margin:0;font-size:20px;color:#F59E0B">${stars}</p>
          ${comment ? `<p style="margin:8px 0 0;color:#666;font-style:italic">&ldquo;${escapeHtml(comment)}&rdquo;</p>` : ''}
          <p style="margin:4px 0 0;color:#999;font-size:13px">— ${escapeHtml(reviewerName)}</p>
        </div>
        <a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">View Dashboard</a>
      </div>
    `,
  });
}

export async function sendCommissionUpdateEmail(
  to: string,
  buyerName: string,
  artistName: string,
  note: string,
  commissionId: string
): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${plain(artistName)} posted an update on your commission`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">New commission update</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(buyerName)}, <strong>${escapeHtml(artistName)}</strong> shared progress on your commission:</p>
        <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #E8704A;color:#444">${escapeHtml(note)}</blockquote>
        <a href="${APP_URL}/commissions/${commissionId}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">View Update</a>
      </div>
    `,
  });
}

export async function sendCommissionNudgeEmail(
  to: string,
  artistName: string,
  buyerName: string,
  commissionTitle: string,
  commissionId: string
): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Buyers love progress updates — post one for ${plain(buyerName)}?`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Keep ${escapeHtml(buyerName)} in the loop</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(artistName)}, it's been a couple of weeks since the last update on <strong>${escapeHtml(commissionTitle)}</strong>. A quick note or WIP photo goes a long way.</p>
        <a href="${APP_URL}/commissions/${commissionId}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Post an update</a>
      </div>
    `,
  });
}

export async function sendReviewRequestEmail(
  to: string,
  buyerName: string,
  listingTitle: string,
  orderId: string
): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `How was ${plain(listingTitle)}?`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Share your experience</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(buyerName)}, we'd love to hear how <strong>${escapeHtml(listingTitle)}</strong> turned out. A quick review helps the artist and other collectors.</p>
        <a href="${APP_URL}/orders?review=${orderId}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Leave a review</a>
      </div>
    `,
  });
}

export async function sendArtistDripEmail(to: string, name: string, stage: string): Promise<void> {
  const content: Record<string, { subject: string; heading: string; body: string }> = {
    artist_day1: { subject: 'Your Custom Canvas profile is waiting', heading: 'Let\'s get your work seen', body: 'Finish your profile and upload your first piece — your community is waiting to discover you.' },
    artist_day3: { subject: 'Your community is waiting to see your work', heading: 'A few minutes to go live', body: 'Add your story, a couple of photos, and your first listing to publish your profile.' },
    artist_day7: { subject: 'Your profile is almost ready', heading: 'One last nudge', body: 'Complete your profile to start selling and taking commissions on Custom Canvas.' },
  };
  const c = content[stage] ?? content.artist_day1;
  await getResend().emails.send({
    from: FROM_EMAIL, to, subject: c.subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" /><h2 style="color:#111">${c.heading}</h2><p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(name)}, ${c.body}</p><a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Finish my profile</a></div>`,
  });
}

export async function sendBuyerDripEmail(to: string, name: string): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL, to, subject: 'Meet the artists near you',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" /><h2 style="color:#111">Discover local art</h2><p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(name)}, there's a whole community of local artists to explore on Custom Canvas. Find a piece — or an artist — you love.</p><a href="${APP_URL}/" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Explore art</a></div>`,
  });
}


// ---- Bulk listing alerts (Build 3 Phase 3) ----

const unsubscribeFooter = (unsubscribeUrl: string) =>
  `<p style="color:#999;font-size:12px;margin-top:24px">You're getting this because you follow artists or save work on Custom Canvas. <a href="${unsubscribeUrl}" style="color:#999">Unsubscribe</a></p>`;

export interface BulkEmail {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
}

function unsubscribeUrl(token: string): string {
  return `${APP_URL}/unsubscribe?token=${token}`;
}

// RFC 8058 one-click unsubscribe — Gmail/Yahoo require these on bulk mail.
function bulkHeaders(unsubUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export function buildNewListingEmail(
  to: string,
  name: string,
  artistName: string,
  listingTitle: string,
  listingId: string,
  unsubscribeToken: string
): BulkEmail {
  const artist = escapeHtml(artistName);
  const title = escapeHtml(listingTitle);
  const unsub = unsubscribeUrl(unsubscribeToken);
  return {
    to,
    subject: `${plain(artistName)} just listed new work`,
    headers: bulkHeaders(unsub),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">New work from ${artist}</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(name)}, ${artist} — an artist you follow — just listed <strong>${title}</strong>.</p>
        <a href="${APP_URL}/listing/${listingId}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">See the piece</a>
        ${unsubscribeFooter(unsub)}
      </div>
    `,
  };
}

export function buildPriceDropEmail(
  to: string,
  name: string,
  listingTitle: string,
  newPrice: string,
  oldPrice: string,
  listingId: string,
  unsubscribeToken: string
): BulkEmail {
  const title = escapeHtml(listingTitle);
  const unsub = unsubscribeUrl(unsubscribeToken);
  return {
    to,
    subject: `Price drop: ${plain(listingTitle)}`,
    headers: bulkHeaders(unsub),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">A piece you saved dropped in price</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(name)}, <strong>${title}</strong> is now ${newPrice} (was ${oldPrice}).</p>
        <a href="${APP_URL}/listing/${listingId}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">See the piece</a>
        ${unsubscribeFooter(unsub)}
      </div>
    `,
  };
}

// One batch API call per 100 recipients (Resend's batch cap) instead of N
// individual sends that would trip the per-second rate limit.
export async function sendBulkEmails(emails: BulkEmail[]): Promise<void> {
  const resend = getResend();
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    const { error } = await resend.batch.send(
      chunk.map((e) => ({ from: FROM_EMAIL, ...e }))
    );
    if (error) {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureMessage(`Bulk email chunk failed: ${error.message}`, 'warning');
    }
  }
}
