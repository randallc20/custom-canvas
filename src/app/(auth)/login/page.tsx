'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CaptchaField, captchaEnabled } from '@/components/auth/CaptchaField';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, user } = useAuth();
  const [captcha, setCaptcha] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const router = useRouter();

  // The /auth/callback route lands here with ?confirmed=1 when it verified the
  // email but couldn't mint a session (e.g. the link was opened in a different
  // browser than the one that signed up).
  useEffect(() => {
    setJustConfirmed(new URLSearchParams(window.location.search).get('confirmed') === '1');
  }, []);

  useEffect(() => {
    if (user) {
      // Honor a returnUrl (e.g. mid-checkout) before falling back to role home.
      const returnUrl = new URLSearchParams(window.location.search).get('returnUrl');
      // A single leading slash only: '//evil.com' and '/\evil.com' both pass a
      // bare startsWith('/') and resolve to an off-origin URL, handing a
      // freshly-authenticated user to an attacker under our own login.
      if (returnUrl && /^\/(?![/\\])/.test(returnUrl)) {
        router.push(returnUrl);
      } else if (user.role === 'artist') {
        router.push('/studio');
      } else if (user.role === 'gallery') {
        router.push('/dashboard');
      } else if (user.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/');
      }
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (captchaEnabled && !captcha) {
      setError('Please complete the verification below.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password, captcha);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password. Please try again.');
      setCaptcha('');
      setCaptchaReset((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold text-ink">Welcome Back</h1>
        {justConfirmed && (
          <p className="mb-4 rounded-lg border border-line bg-sand/50 p-3 text-sm text-ink">
            Your email is confirmed — sign in to continue.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Email" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Password" id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm text-terra hover:underline">
              Forgot password?
            </Link>
          </div>
          <CaptchaField onVerify={setCaptcha} resetSignal={captchaReset} />
          <Button type="submit" loading={loading} disabled={captchaEnabled && !captcha} className="w-full">Sign In</Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-terra hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
