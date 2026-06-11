'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { artistProfileSchema, ArtistProfileFormData } from '@/schemas/artistSchema';
import { useAuth } from '@/context/AuthContext';
import { useUpdateArtistProfile } from '@/hooks/useArtist';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { CompletenessBar } from '@/components/artist/CompletenessBar';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { ArtistProfile } from '@/types/artist';
import { calculateCompletenessScore } from '@/utils/completenessScore';
import { useToast } from '@/components/ui/Toast';

export default function EditArtistProfilePage() {
  const { user } = useAuth();
  const updateProfile = useUpdateArtistProfile();
  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<ArtistProfileFormData>({
    resolver: zodResolver(artistProfileSchema),
    values: artist ? {
      display_name: artist.display_name,
      bio: artist.bio ?? '',
      artist_statement: artist.artist_statement ?? '',
      influences: artist.influences ?? '',
      school: artist.school ?? '',
      graduation_year: artist.graduation_year,
      status: artist.status,
      neighborhood: artist.neighborhood ?? '',
      city: artist.city,
      website_url: artist.website_url ?? '',
      fulfillment_pref: artist.fulfillment_pref,
      commissions_open: artist.commissions_open,
      commission_desc: artist.commission_desc ?? '',
      commission_min_cents: artist.commission_min_cents,
      commission_turnaround: artist.commission_turnaround ?? '',
      accent_color: artist.accent_color,
      bio_layout: artist.bio_layout,
    } : undefined,
  });

  const watched = watch();
  const score = calculateCompletenessScore(watched as Partial<ArtistProfile>);

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('*').eq('profile_id', user.id).single()
      .then(({ data }) => { setArtist(data); setLoading(false); });
  }, [user]);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const onSubmit = async (data: ArtistProfileFormData) => {
    if (!artist) return;
    try {
      await updateProfile.mutateAsync({ id: artist.id, data: { ...data, completeness_score: score } });
      toast('Profile updated successfully!', 'success');
    } catch {
      toast('Failed to update profile. Please try again.', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Edit Profile</h1>
      <div className="mb-6">
        <CompletenessBar score={score} />
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-gray-900">Basics</legend>
          <Input label="Display Name" {...register('display_name')} error={errors.display_name?.message} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Bio</label>
            <textarea {...register('bio')} rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20" />
          </div>
          <Input label="School" {...register('school')} />
          <Input label="Graduation Year" type="number" {...register('graduation_year', { valueAsNumber: true })} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
            <select {...register('status')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select status</option>
              <option value="student">Student</option>
              <option value="recent_grad">Recent Graduate</option>
              <option value="working_artist">Working Artist</option>
            </select>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-gray-900">About Your Work</legend>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Artist Statement</label>
            <textarea {...register('artist_statement')} rows={5} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20" />
          </div>
          <Input label="Influences" {...register('influences')} />
          <Input label="Website" {...register('website_url')} placeholder="https://" />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-gray-900">Location</legend>
          <Input label="City" {...register('city')} error={errors.city?.message} />
          <Input label="Neighborhood" {...register('neighborhood')} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Fulfillment Preference</label>
            <select {...register('fulfillment_pref')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select preference</option>
              <option value="ships_national">Ships Nationally</option>
              <option value="ships_local">Ships Locally</option>
              <option value="pickup_only">Pickup Only</option>
              <option value="artist_delivered">Artist Delivered</option>
            </select>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-gray-900">Commissions</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" {...register('commissions_open')} className="rounded border-gray-300" />
            <span className="text-sm text-gray-700">Open to commissions</span>
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Commission Description</label>
            <textarea {...register('commission_desc')} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20" />
          </div>
          <Input label="Minimum Price ($)" type="number" {...register('commission_min_cents', { valueAsNumber: true })} />
          <Input label="Turnaround Time" {...register('commission_turnaround')} placeholder="e.g. 2-4 weeks" />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-lg font-semibold text-gray-900">Customization</legend>
          <Input label="Accent Color" type="color" {...register('accent_color')} error={errors.accent_color?.message} />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Bio Layout</label>
            <select {...register('bio_layout')} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="left">Left-aligned</option>
              <option value="center">Centered</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>
        </fieldset>

        <Button type="submit" loading={isSubmitting} className="w-full">Save Changes</Button>
      </form>
    </div>
  );
}
