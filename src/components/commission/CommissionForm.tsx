'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { commissionRequestSchema, CommissionRequestFormData } from '@/schemas/commissionSchema';
import { useCreateCommission } from '@/hooks/useCommissions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface CommissionFormProps {
  artistId: string;
  artistName: string;
}

export function CommissionForm({ artistId, artistName }: CommissionFormProps) {
  const router = useRouter();
  const createCommission = useCreateCommission();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CommissionRequestFormData>({
    resolver: zodResolver(commissionRequestSchema),
    defaultValues: { artist_id: artistId },
  });

  const onSubmit = async (data: CommissionRequestFormData) => {
    await createCommission.mutateAsync({
      artist_id: data.artist_id,
      requester_id: '',
      conversation_id: null,
      title: data.title,
      description: data.description,
      budget_min_cents: data.budget_min_cents,
      budget_max_cents: data.budget_max_cents,
    });
    router.push('/messages');
  };

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Commission Request for {artistName}</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <input type="hidden" {...register('artist_id')} />
        <Input label="Title" id="title" {...register('title')} error={errors.title?.message} placeholder="e.g. Portrait of my dog" />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
          <textarea {...register('description')} rows={5} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20" placeholder="Describe what you're looking for..." />
          {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Min Budget ($)" id="budget_min" type="number" {...register('budget_min_cents', { valueAsNumber: true, setValueAs: (v: string) => Math.round(parseFloat(v) * 100) })} error={errors.budget_min_cents?.message} />
          <Input label="Max Budget ($)" id="budget_max" type="number" {...register('budget_max_cents', { valueAsNumber: true, setValueAs: (v: string) => Math.round(parseFloat(v) * 100) })} error={errors.budget_max_cents?.message} />
        </div>
        <Button type="submit" loading={isSubmitting} className="w-full">Submit Request</Button>
      </form>
    </div>
  );
}
