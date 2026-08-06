'use client';

import { Turnstile } from '@marsidev/react-turnstile';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** True when Cloudflare Turnstile is configured (prod). Staging/dev without
 *  the key skip the widget entirely and don't require a token. */
export const captchaEnabled = !!SITE_KEY;

interface CaptchaFieldProps {
  onVerify: (token: string) => void;
  /** Bump to force a fresh token after a failed submit (tokens are single-use). */
  resetSignal?: number;
}

export function CaptchaField({ onVerify, resetSignal = 0 }: CaptchaFieldProps) {
  if (!SITE_KEY) return null;
  return (
    <div className="flex justify-center">
      <Turnstile
        key={resetSignal}
        siteKey={SITE_KEY}
        onSuccess={onVerify}
        onExpire={() => onVerify('')}
        onError={() => onVerify('')}
        options={{ theme: 'light' }}
      />
    </div>
  );
}
