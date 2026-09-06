'use client';

import { useState } from 'react';
import { captureException } from '@/lib/sentry';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

const formSchema = z
  .object({
    title: z.string().min(2, 'Title must be at least 2 characters').max(200),
    description: z.string().min(10, 'Please describe your vision in at least 10 characters').max(5000),
    budget_min: z.number({ error: 'Enter a number' }).min(1, 'Minimum $1'),
    budget_max: z.number({ error: 'Enter a number' }).min(1, 'Minimum $1'),
  })
  .refine((data) => data.budget_max >= data.budget_min, {
    message: 'Max budget must be at least the minimum',
    path: ['budget_max'],
  });

type FormValues = z.infer<typeof formSchema>;

interface CommissionFormProps {
  artistId: string;
  artistName: string;
}

export function CommissionForm({ artistId, artistName }: CommissionFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: artistId,
          title: data.title,
          description: data.description,
          budget_min_cents: Math.round(data.budget_min * 100),
          budget_max_cents: Math.round(data.budget_max * 100),
        }),
      });

      if (!res.ok) {
        // Carry the server's own reason — a 403 from the acceptance gate or a
        // 429 from the limiter says exactly what to do; "Failed to submit"
        // says nothing. Same lesson as the quote card.
        const body = await res.json().catch(() => ({} as Record<string, unknown>));
        throw new Error(typeof body.error === 'string' ? body.error : 'Failed to submit request');
      }

      const created = await res.json();
      toast('Commission request sent!', 'success');
      router.push(created?.conversation_id ? `/messages/${created.conversation_id}` : '/messages?tab=commissions');
    } catch (err) {
      // `TypeError: Failed to fetch` is the BROWSER saying the request never
      // completed on its side — connection dropped, tab torn down, offline —
      // not the server saying no. The server may already have created the
      // commission: a Sentry report on 2026-09-06 carried the exact timestamp
      // of a row that had landed. Reporting it as an app error was noise, and
      // "please try again" invited a duplicate request. Say what actually
      // happened and where to look before resending.
      const networkFailure = err instanceof TypeError;
      if (!networkFailure) captureException(err, { where: 'CommissionForm.submit' });
      toast(
        networkFailure
          ? 'The connection dropped before we heard back. Check Messages — if your request is there, it went through; if not, send it again.'
          : err instanceof Error ? err.message : 'Something went wrong. Please try again.',
        'error',
      );
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="mb-2 text-xl font-bold text-ink">Request a Commission</h2>
      <p className="mb-6 text-sm text-muted">Tell {artistName} what you have in mind.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Input
          label="Title"
          id="title"
          {...register('title')}
          error={errors.title?.message}
          placeholder="e.g. Portrait of my dog in watercolor"
        />
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-ink">
            Description
          </label>
          <textarea
            id="description"
            {...register('description')}
            rows={5}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm
              placeholder:text-muted
              focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/20"
            placeholder="Describe the piece you'd like — subject, size, style, colors, timeline, anything that helps the artist understand your vision..."
          />
          {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Min Budget ($)"
            id="budget_min"
            type="number"
            step="1"
            min="1"
            {...register('budget_min', { valueAsNumber: true })}
            error={errors.budget_min?.message}
            placeholder="100"
          />
          <Input
            label="Max Budget ($)"
            id="budget_max"
            type="number"
            step="1"
            min="1"
            {...register('budget_max', { valueAsNumber: true })}
            error={errors.budget_max?.message}
            placeholder="500"
          />
        </div>
        <Button type="submit" loading={submitting} className="w-full">
          Send Request
        </Button>
      </form>
    </div>
  );
}
