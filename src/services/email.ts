import * as Sentry from '@sentry/nextjs';
import { getResend } from '@/lib/resend';

// In production, a missing EMAIL_FROM must be loud — the resend.dev fallback
// would silently send every transactional email from the wrong domain.
if (process.env.VERCEL_ENV === 'production' && !process.env.EMAIL_FROM) {
  throw new Error('EMAIL_FROM is required in production');
}
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Custom Canvas <onboarding@resend.dev>';
// Replies to any transactional email land in a real, monitored inbox.
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? 'support@customcanvas.shop';
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


type SendPayload = Parameters<ReturnType<typeof getResend>['emails']['send']>[0];

/** Every single-send goes through here. The Resend SDK returns
 *  `{ data: null, error }` rather than throwing, so a rotated key, an
 *  unverified domain, or a suspended account used to produce no signal at all.
 *  Resolves true on success, false on a reported error (already captured to
 *  Sentry, naming the template and the recipient's domain — never the
 *  address); only a thrown SDK/network error rejects. */
async function sendTemplate(template: string, payload: SendPayload): Promise<boolean> {
  const { error } = await getResend().emails.send(payload);
  if (!error) return true;
  const to = Array.isArray(payload.to) ? payload.to[0] : payload.to;
  const domain = typeof to === 'string' ? to.split('@')[1] ?? 'unknown' : 'unknown';
  Sentry.captureMessage(
    `Email send failed: template=${template} to=@${domain} — ${error.name}: ${error.message}`,
    'error'
  );
  return false;
}

export async function sendArtistApprovedEmail(to: string, name: string): Promise<boolean> {
  return sendTemplate('artist_approved', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: 'You\'re approved — your Custom Canvas shop is live',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Welcome to Custom Canvas, ${escapeHtml(name)}!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Your application has been approved. Your profile and listings are now live and visible to buyers in your community.</p>
        <a href="${APP_URL}/studio" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Go to your Studio</a>
      </div>
    `,
  });
}

export async function sendArtistRejectedEmail(to: string, name: string, reason: string): Promise<boolean> {
  return sendTemplate('artist_rejected', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: 'A note about your Custom Canvas application',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Thanks for applying, ${escapeHtml(name)}</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">We took a look at your application and it needs a few changes before we can approve it:</p>
        <p style="color:#111;font-size:16px;line-height:1.5;padding:12px 16px;background:#faf3ef;border-radius:6px">${escapeHtml(reason)}</p>
        <p style="color:#666;font-size:16px;line-height:1.5">Update your profile and resubmit for review whenever you're ready — we'll take another look.</p>
        <a href="${APP_URL}/studio" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Update &amp; resubmit</a>
      </div>
    `,
  });
}

/** Admin-triggered recovery: the reset link comes from auth.admin.generateLink
 *  (service role — unaffected by the captcha gate on the public /recover
 *  endpoint) and we deliver it ourselves so the admin can rescue any account,
 *  including another admin's, without ever seeing or choosing a password. */
export async function sendAdminPasswordResetEmail(
  to: string,
  name: string | null,
  actionLink: string
): Promise<boolean> {
  return sendTemplate('admin_password_reset', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: 'Reset your Custom Canvas password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Password reset${name ? ` for ${escapeHtml(name)}` : ''}</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">A Custom Canvas administrator started a password reset for your account. Click the button below to choose a new password. The link expires after one hour.</p>
        <a href="${actionLink}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Choose a new password</a>
        <p style="color:#666;font-size:14px;line-height:1.5;margin-top:16px">Didn't expect this? You can ignore it — your current password keeps working until a new one is set.</p>
      </div>
    `,
  });
}

export async function sendNewMessageEmail(
  to: string,
  senderName: string,
  preview: string,
  conversationUrl: string
): Promise<boolean> {
  return sendTemplate('new_message', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: `New message from ${plain(senderName)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
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
): Promise<boolean> {
  return sendTemplate('commission_request', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: `New commission request: ${plain(title)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
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
  orderId: string,
  artistName: string
): Promise<boolean> {
  return sendTemplate('order_confirmation', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: `Order confirmed: ${plain(listingTitle)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Order Confirmed</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(buyerName)}, your purchase has been confirmed!</p>
        <div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0">
          <p style="margin:0;font-weight:bold;color:#111">${escapeHtml(listingTitle)}</p>
          <p style="margin:4px 0 0;color:#666">Sold by ${escapeHtml(artistName)}</p>
          <p style="margin:4px 0 0;color:#666">Total: ${amount}</p>
          <p style="margin:4px 0 0;color:#999;font-size:13px">Order #${orderId.slice(0, 8)}</p>
        </div>
        <p style="color:#666;font-size:14px;line-height:1.5">${escapeHtml(artistName)} is the seller of this artwork; Custom Canvas operates the marketplace and handled the payment. This charge will appear as <strong>CUSTOM CANVAS</strong> on your card statement.</p>
        <p style="color:#666;font-size:14px;line-height:1.5">Questions about the piece or the delivery go to the artist in <a href="${APP_URL}/messages" style="color:#A84928">Messages</a>. Our <a href="${APP_URL}/terms-of-sale" style="color:#A84928">Terms of Sale</a> and <a href="${APP_URL}/shipping-returns" style="color:#A84928">Shipping, Returns &amp; Refunds Policy</a> cover what happens if something goes wrong.</p>
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
): Promise<boolean> {
  return sendTemplate('new_sale', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: `You made a sale: ${plain(listingTitle)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
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
): Promise<boolean> {
  const trackingBlock = trackingNumber
    ? `<div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0">
        <p style="margin:0;color:#666;font-size:13px">Tracking number:</p>
        <p style="margin:4px 0 0;font-family:monospace;font-weight:bold;color:#111">${escapeHtml(trackingNumber)}</p>
      </div>`
    : '';

  return sendTemplate('shipping_update', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: `Your order has shipped: ${plain(listingTitle)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Your order has shipped!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(buyerName)}, great news — <strong>${escapeHtml(listingTitle)}</strong> is on its way to you!</p>
        ${trackingBlock}
        <a href="${APP_URL}/orders" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">View Order</a>
      </div>
    `,
  });
}

/** The buyer's payment landed after another collector's order already held
 *  the piece; the webhook refunded them in full. Until 04-r3 P2 they learned
 *  of it only from a Refunded row on their Orders page. */
export async function sendOversoldRefundEmail(
  to: string,
  buyerName: string,
  listingTitle: string,
  amount: string
): Promise<boolean> {
  return sendTemplate('oversold_refund', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: `Refunded: ${plain(listingTitle)} sold moments before your payment`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">We had to refund your order</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(buyerName)}, we're sorry — <strong>${escapeHtml(listingTitle)}</strong> was sold to another collector moments before your payment went through. Original artwork is one of a kind, so we can't fulfil a second order for it.</p>
        <div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0">
          <p style="margin:0;color:#666">Refunded in full: <strong style="color:#111">${amount}</strong></p>
          <p style="margin:4px 0 0;color:#999;font-size:13px">It can take a few days to appear on your statement.</p>
        </div>
        <p style="color:#666;font-size:14px;line-height:1.5">Nothing else is needed from you. If you'd like help finding something similar, just reply to this email.</p>
        <a href="${APP_URL}/discover" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Keep browsing</a>
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
): Promise<boolean> {
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

  return sendTemplate('review_received', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: `New ${rating}-star review from ${plain(reviewerName)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
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
): Promise<boolean> {
  return sendTemplate('commission_update', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: `${plain(artistName)} posted an update on your commission`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
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
): Promise<boolean> {
  return sendTemplate('commission_nudge', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: `Buyers love progress updates — post one for ${plain(buyerName)}?`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
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
): Promise<boolean> {
  return sendTemplate('review_request', {
    from: FROM_EMAIL,
    replyTo: SUPPORT_EMAIL,
    to,
    subject: `How was ${plain(listingTitle)}?`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Share your experience</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(buyerName)}, we'd love to hear how <strong>${escapeHtml(listingTitle)}</strong> turned out. A quick review helps the artist and other collectors.</p>
        <a href="${APP_URL}/orders?review=${orderId}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Leave a review</a>
      </div>
    `,
  });
}

export async function sendArtistDripEmail(to: string, name: string, stage: string): Promise<boolean> {
  // Copy reflects the submit-for-review flow: artists build, then SUBMIT —
  // they can't self-publish, so never promise "go live" as their own action.
  const content: Record<string, { subject: string; heading: string; body: string }> = {
    artist_day1: { subject: 'Your Custom Canvas shop is waiting', heading: 'Let\'s get your work seen', body: 'Add your story and your first piece, then submit your shop for review — we approve new artists quickly.' },
    artist_day3: { subject: 'A few minutes from submitting your shop', heading: 'Almost ready to submit', body: 'Add your story, a couple of good photos, and your first listing — then hit "Submit for review" in your Studio and we\'ll take a look.' },
    artist_day7: { subject: 'Your shop is almost ready to submit', heading: 'One last nudge', body: 'Finish your shop and submit it for review to start selling and taking commissions on Custom Canvas.' },
  };
  const c = content[stage] ?? content.artist_day1;
  return sendTemplate('artist_drip', {
    from: FROM_EMAIL, replyTo: SUPPORT_EMAIL, to, subject: c.subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" /><h2 style="color:#111">${c.heading}</h2><p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(name)}, ${c.body}</p><a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Finish my profile</a></div>`,
  });
}

export async function sendBuyerDripEmail(to: string, name: string): Promise<boolean> {
  return sendTemplate('buyer_drip', {
    from: FROM_EMAIL, replyTo: SUPPORT_EMAIL, to, subject: 'Meet the artists near you',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" /><h2 style="color:#111">Discover local art</h2><p style="color:#666;font-size:16px;line-height:1.5">Hi ${escapeHtml(name)}, there's a whole community of local artists to explore on Custom Canvas. Find a piece — or an artist — you love.</p><a href="${APP_URL}/" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Explore art</a></div>`,
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
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
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
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="32" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
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
      chunk.map((e) => ({ from: FROM_EMAIL, replyTo: SUPPORT_EMAIL, ...e }))
    );
    if (error) {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureMessage(`Bulk email chunk failed: ${error.message}`, 'warning');
    }
  }
}
