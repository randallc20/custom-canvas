import { resend } from '@/lib/resend';

const FROM_EMAIL = 'Custom Canvas <noreply@customcanvas.art>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function sendWelcomeEmail(to: string, name: string, role: string): Promise<void> {
  const roleMessage = role === 'artist'
    ? 'Start by completing your profile and uploading your first piece.'
    : role === 'gallery'
    ? 'Your gallery application is under review. We\'ll notify you once verified.'
    : 'Discover one-of-a-kind pieces from Houston\'s most talented emerging artists.';

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: 'Welcome to Custom Canvas!',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
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
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `New message from ${senderName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
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
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `New commission request: ${title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
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
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Order confirmed: ${listingTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
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
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `You made a sale: ${listingTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#111">You made a sale!</h2>
        <p style="color:#666;font-size:16px;line-height:1.5">Congratulations ${artistName}, someone just purchased your work!</p>
        <div style="background:#FFF7ED;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #E8704A33">
          <p style="margin:0;font-weight:bold;color:#111">${listingTitle}</p>
          <p style="margin:4px 0 0;color:#666">Sale price: ${amount}</p>
          <p style="margin:4px 0 0;color:#E8704A;font-weight:bold">Your payout: ${payoutAmount}</p>
        </div>
        <p style="color:#666;font-size:14px">Please ship the piece promptly and update the order status.</p>
        <a href="${APP_URL}/orders" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px">View Order</a>
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

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your order has shipped: ${listingTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
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

  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `New ${rating}-star review from ${reviewerName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
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
