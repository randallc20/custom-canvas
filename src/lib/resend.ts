import { Resend } from 'resend';

// A missing key in production must be loud at boot, exactly like EMAIL_FROM
// in services/email.ts — otherwise every transactional send quietly returns
// `{ error }` and nobody gets an email. Guarded so `next build` / CI without
// secrets still passes.
if (process.env.VERCEL_ENV === 'production' && !process.env.RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is required in production');
}

// Lazy singleton — instantiating at module scope crashes `next build`
// when RESEND_API_KEY is absent (e.g. CI without secrets).
let client: Resend | null = null;

export function getResend(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}
