import { resend } from '@/lib/resend';

const FROM_EMAIL = 'Custom Canvas <noreply@customcanvas.art>';

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
      <h2>You have a new message from ${senderName}</h2>
      <p style="color:#666">"${preview}"</p>
      <a href="${conversationUrl}" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px">View Conversation</a>
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
      <h2>New Commission Request</h2>
      <p>Hi ${artistName}, you have a new commission request: <strong>${title}</strong></p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/commissions" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px">View Request</a>
    `,
  });
}

export async function sendOrderConfirmationEmail(
  to: string,
  orderDetails: { title: string; amount: string }
): Promise<void> {
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Order confirmed: ${orderDetails.title}`,
    html: `
      <h2>Order Confirmed</h2>
      <p>Your purchase of <strong>${orderDetails.title}</strong> for ${orderDetails.amount} has been confirmed.</p>
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/orders" style="display:inline-block;padding:12px 24px;background:#E8704A;color:#fff;text-decoration:none;border-radius:6px">View Orders</a>
    `,
  });
}
