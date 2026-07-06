import { getResend } from '@/lib/resend';

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Custom Canvas <onboarding@resend.dev>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function sendWelcomeEmail(to: string, name: string, role: string): Promise<void> {
  const roleMessage = role === 'artist'
    ? 'Start by completing your profile and uploading your first piece.'
    : role === 'gallery'
    ? 'Your gallery application is under review. We\'ll notify you once verified.'
    : 'Discover one-of-a-kind pieces from Houston\'s most talented emerging artists.';

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: 'Welcome to Custom Canvas!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Welcome to Custom Canvas, ${name}!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Thank you for joining our community of artists and collectors.</p>
        <p style="color:#666;font-size:16px;line-height:1.5">${roleMessage}</p>
        <a href="${APP_URL}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Get Started</a>
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
    subject: `New message from ${senderName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">New message from ${senderName}</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">&ldquo;${preview}&rdquo;</p>
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
    subject: `New commission request: ${title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">New Commission Request</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${artistName}, you have a new commission request: <strong>${title}</strong></p>
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
    subject: `Order confirmed: ${listingTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Order Confirmed</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${buyerName}, your purchase has been confirmed!</p>
        <div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:16px 0">
          <p style="margin:0;font-weight:bold;color:#111">${listingTitle}</p>
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
    subject: `You made a sale: ${listingTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">You made a sale!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Congratulations ${artistName}, someone just purchased your work!</p>
        <div style="background:#FFF7ED;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #E8704A33">
          <p style="margin:0;font-weight:bold;color:#111">${listingTitle}</p>
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
        <p style="margin:4px 0 0;font-family:monospace;font-weight:bold;color:#111">${trackingNumber}</p>
      </div>`
    : '';

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your order has shipped: ${listingTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Your order has shipped!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${buyerName}, great news — <strong>${listingTitle}</strong> is on its way to you!</p>
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
    subject: `New ${rating}-star review from ${reviewerName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">You received a review!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${artistName}, ${reviewerName} left you a review.</p>
        <div style="background:#FFF7ED;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #E8704A33">
          <p style="margin:0;font-size:20px;color:#F59E0B">${stars}</p>
          ${comment ? `<p style="margin:8px 0 0;color:#666;font-style:italic">&ldquo;${comment}&rdquo;</p>` : ''}
          <p style="margin:4px 0 0;color:#999;font-size:13px">— ${reviewerName}</p>
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
    subject: `${artistName} posted an update on your commission`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">New commission update</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${buyerName}, <strong>${artistName}</strong> shared progress on your commission:</p>
        <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #E8704A;color:#444">${note}</blockquote>
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
    subject: `Buyers love progress updates — post one for ${buyerName}?`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Keep ${buyerName} in the loop</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${artistName}, it's been a couple of weeks since the last update on <strong>${commissionTitle}</strong>. A quick note or WIP photo goes a long way.</p>
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
    subject: `How was ${listingTitle}?`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" />
        <h2 style="color:#111">Share your experience</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Hi ${buyerName}, we'd love to hear how <strong>${listingTitle}</strong> turned out. A quick review helps the artist and other collectors.</p>
        <a href="${APP_URL}/orders?review=${orderId}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Leave a review</a>
      </div>
    `,
  });
}

export async function sendArtistDripEmail(to: string, name: string, stage: string): Promise<void> {
  const content: Record<string, { subject: string; heading: string; body: string }> = {
    artist_day1: { subject: 'Your Custom Canvas profile is waiting', heading: 'Let\'s get your work seen', body: 'Finish your profile and upload your first piece — Houston is waiting to discover you.' },
    artist_day3: { subject: 'Houston is waiting to see your work', heading: 'A few minutes to go live', body: 'Add your story, a couple of photos, and your first listing to publish your profile.' },
    artist_day7: { subject: 'Your profile is almost ready', heading: 'One last nudge', body: 'Complete your profile to start selling and taking commissions on Custom Canvas.' },
  };
  const c = content[stage] ?? content.artist_day1;
  await getResend().emails.send({
    from: FROM_EMAIL, to, subject: c.subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" /><h2 style="color:#111">${c.heading}</h2><p style="color:#666;font-size:16px;line-height:1.5">Hi ${name}, ${c.body}</p><a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Finish my profile</a></div>`,
  });
}

export async function sendBuyerDripEmail(to: string, name: string): Promise<void> {
  await getResend().emails.send({
    from: FROM_EMAIL, to, subject: 'Meet some of Houston\'s artists',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><img src="${APP_URL}/email-logo.png" width="180" height="44" alt="Custom Canvas" style="display:block;margin:0 0 20px" /><h2 style="color:#111">Discover Houston art</h2><p style="color:#666;font-size:16px;line-height:1.5">Hi ${name}, there's a whole community of Houston artists to explore on Custom Canvas. Find a piece — or an artist — you love.</p><a href="${APP_URL}/" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">Explore art</a></div>`,
  });
}


// ---- Bulk listing alerts (Build 3 Phase 3) ----

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    subject: `${artistName} just listed new work`,
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
    subject: `Price drop: ${listingTitle}`,
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
