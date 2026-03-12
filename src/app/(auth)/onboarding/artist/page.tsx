'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { artistProfileSchema, ArtistProfileFormData } from '@/schemas/artistSchema';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';
import { slugify } from '@/utils/slugify';

const STEPS = ['Basics', 'About', 'Preferences'];

export default function ArtistOnboardingPage() {
  const [step, setStep] = useState(0);
  const { user } = useAuth();
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ArtistProfileFormData>({
    resolver: zodResolver(artistProfileSchema),
    defaultValues: { city: 'Houston', accent_color: '#E8704A', bio_layout: 'left' },
  });

  const onSubmit = async (data: ArtistProfileFormData) => {
    if (!user) return;
    const slug = slugify(data.display_name);
    await supabase.from('artist_profiles').insert({
      profile_id: user.id,
      slug,
      ...data,
    });
    router.push('/dashboard');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <div className="mb-2 flex justify-between text-sm text-gray-500">
            {STEPS.map((s, i) => (
              <span key={s} className={i <= step ? 'font-medium text-[#E8704A]' : ''}>{s}</span>
            ))}
          </div>
          <div className="h-2 rounded-full bg-gray-200">
            <div className="h-2 rounded-full bg-[#E8704A] transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {step === 0 && (
            <>
              <Input label="Display Name" id="display_name" {...register('display_name')} error={errors.display_name?.message} />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Bio</label>
                <textarea {...register('bio')} rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20" />
              </div>
              <Input label="School / University" id="school" {...register('school')} />
            </>
          )}
          {step === 1 && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Artist Statement</label>
                <textarea {...register('artist_statement')} rows={5} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20" />
              </div>
              <Input label="Influences" id="influences" {...register('influences')} />
            </>
          )}
          {step === 2 && (
            <>
              <Input label="Neighborhood" id="neighborhood" {...register('neighborhood')} />
              <select {...register('fulfillment_pref')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Select fulfillment preference</option>
                <option value="ships_national">Ships Nationally</option>
                <option value="ships_local">Ships Locally</option>
                <option value="pickup_only">Pickup Only</option>
                <option value="artist_delivered">Artist Delivered</option>
              </select>
              <label className="flex items-center gap-2">
                <input type="checkbox" {...register('commissions_open')} className="rounded border-gray-300" />
                <span className="text-sm text-gray-700">Open to commissions</span>
              </label>
            </>
          )}

          <div className="flex gap-3">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>Back</Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setStep(step + 1)}>Next</Button>
            ) : (
              <Button type="submit" loading={isSubmitting}>Complete Setup</Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
