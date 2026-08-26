'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { artistProfileSchema, ArtistProfileFormData } from '@/schemas/artistSchema';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { AGREEMENT_SUMMARY, ARTIST_AGREEMENT_VERSION } from '@/lib/agreement';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';
import { slugify } from '@/utils/slugify';

// One structure drives the progress bar, per-step validation on Next, and the
// submit-time "which step is wrong" message — they can no longer drift apart.
const STEP_DEFS: { name: string; fields: (keyof ArtistProfileFormData)[] }[] = [
  { name: 'Basics', fields: ['display_name', 'bio', 'school'] },
  { name: 'About', fields: ['artist_statement', 'influences'] },
  { name: 'Preferences', fields: ['city', 'neighborhood', 'fulfillment_pref', 'commissions_open', 'accent_color', 'bio_layout'] },
  { name: 'Agreement', fields: [] },
];
const STEPS = STEP_DEFS.map((s) => s.name);
const FIELD_STEP: Record<string, string> = Object.fromEntries(
  STEP_DEFS.flatMap((s) => s.fields.map((f) => [f, s.name]))
);

export default function ArtistOnboardingPage() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting }, trigger } = useForm<ArtistProfileFormData>({
    resolver: zodResolver(artistProfileSchema),
    defaultValues: {
      accent_color: '#E8704A',
      bio_layout: 'left',
      commissions_open: false,
    },
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    router.push('/login');
    return null;
  }

  const handleNext = async () => {
    const fields = STEP_DEFS[step]?.fields ?? [];
    if (fields.length > 0) {
      const valid = await trigger(fields);
      if (!valid) return;
    }
    setStep(step + 1);
  };

  /** Validation failures on submit attach to fields from earlier steps, whose
   *  inline errors are not on screen — without this, the button just looks
   *  broken. Name the step so they know where to go back to. */
  const onInvalid = (errs: Record<string, unknown>) => {
    const first = Object.keys(errs)[0];
    setError(
      first && FIELD_STEP[first]
        ? `Something on the ${FIELD_STEP[first]} step needs fixing — go back and check it.`
        : 'Something above needs fixing before you can finish.'
    );
  };

  const onSubmit = async (data: ArtistProfileFormData) => {
    setError('');
    if (!agreed) {
      setError('Please accept the Artist Agreement to continue.');
      return;
    }
    // Backstop for the guard's silent-empty edge (an expired token can make an
    // existing row invisible without an error): never insert a second profile —
    // if one exists, this account is already set up.
    const { data: existing } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (existing) {
      await queryClient.invalidateQueries({ queryKey: ['artist-profile-exists', user.id] });
      await queryClient.invalidateQueries({ queryKey: ['own-artist-profile', user.id] });
      router.push('/studio');
      return;
    }

    const slug = slugify(data.display_name) + '-' + Date.now().toString(36);
    const insertProfile = () =>
      supabase.from('artist_profiles').insert({
        profile_id: user.id,
        slug,
        ...data,
        // Click-wrap record: the artist's own act of acceptance, stamped at
        // creation and frozen thereafter (00037 guard). The submit-for-review
        // API re-verifies this server-side.
        agreement_accepted_at: new Date().toISOString(),
        agreement_version: ARTIST_AGREEMENT_VERSION,
      });

    let { error: insertError } = await insertProfile();

    // An RLS refusal moments after signup is almost always the fresh session
    // cookie not being attached yet, not a real permissions problem — re-sync
    // the session and retry once before surfacing anything.
    if (insertError?.code === '42501') {
      await supabase.auth.refreshSession();
      ({ error: insertError } = await insertProfile());
    }

    if (insertError) {
      setError(
        insertError.code === '42501'
          ? 'We couldn’t verify your session — refresh this page and try again.'
          : insertError.message
      );
      return;
    }

    // The Studio's shared profile query is React Query-cached; without this the
    // freshly-created artist can land on a Studio that still believes it has no
    // profile row.
    await queryClient.invalidateQueries({ queryKey: ['artist-profile-exists', user.id] });
    await queryClient.invalidateQueries({ queryKey: ['own-artist-profile', user.id] });
    router.push('/studio');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <div className="mb-2 flex justify-between text-sm text-muted">
            {STEPS.map((s, i) => (
              <span key={s} className={i <= step ? 'font-medium text-terra' : ''}>{s}</span>
            ))}
          </div>
          <div className="h-2 rounded-full bg-sand">
            <div className="h-2 rounded-full bg-terra transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
          {step === 0 && (
            <>
              <Input label="Display Name" id="display_name" {...register('display_name')} error={errors.display_name?.message} />
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">
                  What drew you to art? Tell visitors about yourself.
                </label>
                <textarea {...register('bio')} rows={4} placeholder="What were you making before you knew it was called art?" className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20" />
              </div>
              <Input label="School / University" id="school" {...register('school')} />
            </>
          )}
          {step === 1 && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Artist Statement</label>
                <textarea {...register('artist_statement')} rows={5} className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20" />
              </div>
              <Input label="Influences" id="influences" {...register('influences')} />
            </>
          )}
          {step === 2 && (
            <>
              <Input label="City" id="city" {...register('city')} error={errors.city?.message} />
              <Input label="Neighborhood" id="neighborhood" {...register('neighborhood')} />
              <select
                {...register('fulfillment_pref', { setValueAs: (v) => (v === '' ? null : v) })}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              >
                <option value="">Select fulfillment preference</option>
                <option value="ships_national">Ships Nationally</option>
                <option value="ships_local">Ships Locally</option>
                <option value="pickup_only">Pickup Only</option>
                <option value="artist_delivered">Artist Delivered</option>
              </select>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('commissions_open')} className="rounded border-line" />
                <span className="text-sm text-ink">Open to commissions</span>
              </label>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-ink">The Artist Agreement — the short version</p>
              <ul className="space-y-2 rounded-xl border border-line bg-sand/40 p-4">
                {AGREEMENT_SUMMARY.map((point) => (
                  <li key={point} className="flex gap-2 text-sm text-ink">
                    <span aria-hidden className="text-terra">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                The full agreement is available at{' '}
                <a href="/artist-agreement" target="_blank" className="font-medium text-terra underline">
                  Artist Agreement (v{ARTIST_AGREEMENT_VERSION})
                </a>{' '}
                and anytime from your Studio. Your acceptance and its date are recorded.
              </p>
              <label className="flex items-start gap-2 rounded-lg border border-terra/30 bg-terraSoft/40 p-3">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 rounded border-line"
                />
                <span className="text-sm text-ink">
                  I agree to the Custom Canvas Artist Agreement, including the 15% platform
                  commission on each sale.
                </span>
              </label>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>Back</Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={handleNext}>Next</Button>
            ) : (
              <Button type="submit" loading={isSubmitting} disabled={!agreed}>Complete Setup</Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
