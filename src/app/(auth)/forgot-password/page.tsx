'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CaptchaField, captchaEnabled } from '@/components/auth/CaptchaField';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (captchaEnabled && !captcha) {
      setError('Please complete the verification below.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email, captcha);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setCaptcha('');
      setCaptchaReset((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-4 text-2xl font-bold text-ink">Check Your Email</h1>
          <p className="text-muted">
            We sent a password reset link to <span className="font-medium">{email}</span>.
            Click the link in the email to set a new password.
          </p>
          <Link href="/login" className="mt-6 inline-block text-sm text-terra hover:underline">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-bold text-ink">Forgot Password?</h1>
        <p className="mb-6 text-sm text-muted">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <CaptchaField onVerify={setCaptcha} resetSignal={captchaReset} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={loading} disabled={captchaEnabled && !captcha} className="w-full">
            Send Reset Link
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Remember your password?{' '}
          <Link href="/login" className="text-terra hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
