'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CaptchaField, captchaEnabled } from '@/components/auth/CaptchaField';
import Link from 'next/link';
import { useAuth, postSignupPath } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const roles = [
  { value: 'artist', label: 'Artist', desc: 'List and sell your art' },
  { value: 'user', label: 'Art Lover', desc: 'Discover and buy art' },
  { value: 'gallery', label: 'Partner', desc: 'Galleries, schools & organizations' },
];

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { signUp, resendConfirmation } = useAuth();
  const router = useRouter();
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!acceptedTerms) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.');
      return;
    }
    if (captchaEnabled && !captcha) {
      setError('Please complete the verification below.');
      return;
    }
    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUp(email, password, role, fullName, captcha);
      if (needsEmailConfirmation) {
        setConfirmationSent(true);
        setCaptcha('');
        setCaptchaReset((n) => n + 1);
      } else {
        // The project signed them straight in — no confirmation gate, so a
        // "check your email" screen would be a lie. Go to setup.
        router.push(postSignupPath(role));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
      setCaptcha('');
      setCaptchaReset((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (captchaEnabled && !captcha) return;
    setResendState('sending');
    try {
      await resendConfirmation(email, role, captcha);
      setResendState('sent');
    } catch {
      setResendState('failed');
    } finally {
      setCaptcha('');
      setCaptchaReset((n) => n + 1);
    }
  };

  if (confirmationSent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-4 text-2xl font-bold text-ink">Check Your Email</h1>
          <p className="text-muted">
            We sent a confirmation link to <span className="font-medium">{email}</span>.
            Click the link to activate your account — it signs you in and takes you straight to setup.
          </p>
          {/* Registering an email that already has an account looks identical
              from here (anti-enumeration: no session, no error) but no email
              is coming — give that person their actual way in. */}
          <p className="mt-3 text-sm text-muted">
            Already have an account with this email? No new email is sent —{' '}
            <Link href="/login" className="text-terraText hover:underline">sign in</Link> or{' '}
            <Link href="/forgot-password" className="text-terraText hover:underline">reset your password</Link> instead.
          </p>
          <div className="mt-4 space-y-3 text-left">
            <p className="text-center text-sm text-muted">
              Nothing after a couple of minutes? Check spam, then resend it.
            </p>
            <CaptchaField onVerify={setCaptcha} resetSignal={captchaReset} />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              loading={resendState === 'sending'}
              disabled={captchaEnabled && !captcha}
              onClick={handleResend}
            >
              Resend confirmation email
            </Button>
            {resendState === 'sent' && (
              <p className="text-center text-sm text-green-700">Sent — give it a minute to arrive.</p>
            )}
            {resendState === 'failed' && (
              <p className="text-center text-sm text-red-600">Couldn&apos;t resend — wait a moment and try again.</p>
            )}
          </div>
          <Link href="/login" className="mt-4 inline-block text-sm text-terraText hover:underline">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-ink">Create Account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Full Name" id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <Input label="Email" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Password" id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />

          <div>
            <label className="mb-2 block text-sm font-medium text-ink">I am a...</label>
            <div className="grid grid-cols-3 gap-2">
              {roles.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  aria-pressed={role === r.value}
                  className={`rounded-lg border p-3 text-center text-sm transition-colors
                    ${role === r.value ? 'border-terra bg-orange-50 text-terraText' : 'border-line hover:bg-sand/50'}`}
                >
                  <div className="font-medium">{r.label}</div>
                  <div className="mt-0.5 text-xs text-muted">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 rounded border-line"
            />
            <span>
              I agree to the{' '}
              <Link href="/terms" target="_blank" className="text-terraText hover:underline">Terms of Service</Link>{' '}
              and{' '}
              <Link href="/privacy" target="_blank" className="text-terraText hover:underline">Privacy Policy</Link>.
            </span>
          </label>

          <CaptchaField onVerify={setCaptcha} resetSignal={captchaReset} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={loading} disabled={!acceptedTerms || (captchaEnabled && !captcha)} className="w-full">Create Account</Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-terraText hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
