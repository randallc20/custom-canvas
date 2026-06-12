import { Resend } from 'resend';

// Lazy singleton — instantiating at module scope crashes `next build`
// when RESEND_API_KEY is absent (e.g. CI without secrets).
let client: Resend | null = null;

export function getResend(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}
