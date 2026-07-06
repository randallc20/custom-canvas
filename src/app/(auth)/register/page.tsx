'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
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
  const { signUp } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!acceptedTerms) {
      setError('Please accept the Terms of Service and Privacy Policy to continue.');
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password, role, fullName);
      setConfirmationSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  if (confirmationSent) {
    const onboardingPath = role === 'artist' ? '/onboarding/artist' : role === 'gallery' ? '/onboarding/gallery' : null;

    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="mb-4 text-2xl font-bold text-ink">Check Your Email</h1>
          <p className="text-muted">
            We sent a confirmation link to <span className="font-medium">{email}</span>.
            Click the link to activate your account.
          </p>
          {onboardingPath && (
            <p className="mt-3 text-sm text-muted">
              Already confirmed?{' '}
              <button
                onClick={() => router.push(onboardingPath)}
                className="text-terra hover:underline"
              >
                Continue to setup
              </button>
            </p>
          )}
          <Link href="/login" className="mt-4 inline-block text-sm text-terra hover:underline">
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
                    ${role === r.value ? 'border-terra bg-orange-50 text-terra' : 'border-line hover:bg-sand/50'}`}
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
              <Link href="/terms" target="_blank" className="text-terra hover:underline">Terms of Service</Link>{' '}
              and{' '}
              <Link href="/privacy" target="_blank" className="text-terra hover:underline">Privacy Policy</Link>.
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={loading} disabled={!acceptedTerms} className="w-full">Create Account</Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-terra hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
