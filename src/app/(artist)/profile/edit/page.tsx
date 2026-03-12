'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { artistProfileSchema, ArtistProfileFormData } from '@/schemas/artistSchema';
import { useAuth } from '@/context/AuthContext';
import { useUpdateArtistProfile } from '@/hooks/useArtist';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { ArtistProfile } from '@/types/artist';
import { calculateCompletenessScore } from '@/utils/completenessScore';

export default function EditArtistProfilePage() {
  const { user } = useAuth();
  const updateProfile = useUpdateArtistProfile();
  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
    await updateProfile.mutateAsync({ id: artist.id, data: { ...data, completeness_score: score } });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Edit Profile</h1>
        <div className="text-sm text-gray-500">Completeness: <span className="font-bold text-[#E8704A]">{score}%</span></div>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="Display Name" {...register('display_name')} error={errors.display_name?.message} />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Bio</label>
          <textarea {...register('bio')} rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Artist Statement</label>
          <textarea {...register('artist_statement')} rows={5} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20" />
        </div>
        <Input label="Influences" {...register('influences')} />
        <Input label="School" {...register('school')} />
        <Input label="Neighborhood" {...register('neighborhood')} />
        <Input label="Website" {...register('website_url')} />
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('commissions_open')} className="rounded border-gray-300" />
          <span className="text-sm text-gray-700">Open to commissions</span>
        </label>
        <Button type="submit" loading={isSubmitting}>Save Changes</Button>
      </form>
    </div>
  );
}
