'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { galleryProfileSchema, GalleryProfileFormData } from '@/schemas/gallerySchema';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';
import { withSessionRetry, isRlsDenial } from '@/lib/sessionRetry';
import { slugify } from '@/utils/slugify';
import { PARTNER_TYPE_LABELS, type PartnerType } from '@/types/gallery';

export default function GalleryOnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<GalleryProfileFormData>({
    resolver: zodResolver(galleryProfileSchema),
    defaultValues: { partner_type: 'gallery' },
  });

  // Right after an autoconfirm signup, `user` is briefly null while
  // AuthContext fetches the profile (loading already went false on the
  // anonymous initial mount) — bouncing on !user alone would skip onboarding
  // entirely. Ask the auth client directly: only a genuinely session-less
  // visitor goes to login.
  const [noSession, setNoSession] = useState(false);
  useEffect(() => {
    if (user) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && !session) setNoSession(true);
    });
    return () => { mounted = false; };
  }, [user]);
  useEffect(() => {
    if (noSession) router.push('/login');
  }, [noSession, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const onSubmit = async (data: GalleryProfileFormData) => {
    setError('');
    const slug = slugify(data.gallery_name) + '-' + Date.now().toString(36);
    const insertProfile = () =>
      supabase.from('gallery_profiles').insert({
        profile_id: user.id,
        slug,
        ...data,
        // '' is "no website"; the column's CHECK (00052) accepts NULL or http(s).
        website_url: data.website_url || null,
      });

    // Same fresh-session race as artist onboarding: an RLS refusal moments
    // after signup means the session cookie hasn't attached yet.
    const { error: insertError } = await withSessionRetry(insertProfile, (r) => isRlsDenial(r.error));

    if (insertError) {
      setError(
        isRlsDenial(insertError)
          ? 'We couldn’t verify your session — refresh this page and try again.'
          : insertError.message
      );
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-ink">Pending Verification</h1>
          <p className="mt-2 text-muted">
            Your partner profile is under review. We&apos;ll notify you once verified.
          </p>
          <p className="mt-1 text-sm text-muted">
            In the meantime, you can browse and discover local artists.
          </p>
          <Link href="/" className="mt-6 inline-block rounded-lg bg-terraText px-5 py-2.5 text-sm font-medium text-white hover:bg-terraTextDark">
            Explore Art
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <h1 className="mb-6 text-2xl font-bold text-ink">Set Up Your Partner Profile</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">What type of organization are you?</label>
            <select {...register('partner_type')} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm">
              {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map((t) => (
                <option key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <Input label="Organization Name" id="gallery_name" {...register('gallery_name')} error={errors.gallery_name?.message} />
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">
              Tell artists about your organization and what you&apos;re looking for.
            </label>
            <textarea {...register('bio')} rows={4} className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20" />
          </div>
          <Input label="Address" id="address" {...register('address')} />
          <Input label="City" id="city" {...register('city')} error={errors.city?.message} />
          <Input label="Neighborhood" id="neighborhood" {...register('neighborhood')} />
          <Input label="Website" id="website_url" {...register('website_url')} placeholder="https://" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={isSubmitting} className="w-full">Submit for Verification</Button>
        </form>
      </div>
    </div>
  );
}
