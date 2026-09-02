'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

// How long to wait for the PKCE code in the URL to turn into a session before
// calling the link dead. The browser client exchanges it on load; AuthContext
// reports the user once the profile is fetched.
const PKCE_EXCHANGE_GRACE_MS = 10_000;

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // 'checking' until we know whether a recovery session exists. Without one,
  // updateUser would only fail at submit time with "Auth session missing!";
  // say it up front and offer a fresh link instead (01 appendix).
  const [session, setSession] = useState<'checking' | 'ready' | 'missing'>('checking');
  const { user, loading: authLoading, updatePassword } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      setSession('ready');
      return;
    }
    if (authLoading) return;
    const params = new URLSearchParams(window.location.search);
    // The public (PKCE) flow arrives as ?code=…; the exchange may still be in
    // flight when AuthContext first reports "no user". An ?error= param is
    // GoTrue saying the link was expired or already used.
    const exchangePending = params.has('code') && !params.has('error');
    if (!exchangePending) {
      setSession('missing');
      return;
    }
    const timer = setTimeout(() => setSession('missing'), PKCE_EXCHANGE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [user, authLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      router.push('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (session === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (session === 'missing') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-4 text-2xl font-bold text-ink">This reset link has expired</h1>
          <p className="text-muted">
            Password reset links work once and expire after an hour. Request a new one and
            we&apos;ll email it to you.
          </p>
          <Link href="/forgot-password" className="mt-6 inline-block text-sm text-terra hover:underline">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-2xl font-bold text-ink">Set New Password</h1>
        <p className="mb-6 text-sm text-muted">
          Choose a strong password for your Custom Canvas account.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="New Password"
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <Input
            label="Confirm Password"
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Update Password
          </Button>
        </form>
      </div>
    </div>
  );
}
