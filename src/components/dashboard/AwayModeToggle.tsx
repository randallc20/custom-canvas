'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDateOnly } from '@/utils/formatDateOnly';
import { captureException } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';
import { useOwnArtistProfile } from '@/hooks/useArtistProfileId';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function AwayModeToggle() {
  const { artist, refetch } = useOwnArtistProfile();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [until, setUntil] = useState('');
  const [saving, setSaving] = useState(false);

  // Seed the form from the row the first time it arrives; after that the
  // artist owns what is in the boxes.
  const seeded = useRef(false);
  useEffect(() => {
    if (!artist || seeded.current) return;
    seeded.current = true;
    setMessage(artist.away_message ?? '');
    setUntil(artist.away_until ?? '');
  }, [artist]);

  if (!artist) return null;

  const enable = async () => {
    setSaving(true);
    // Read the current commission state fresh so we restore the right value later.
    const { data: fresh } = await supabase.from('artist_profiles').select('commissions_open').eq('id', artist.id).single();
    // .select('id').maybeSingle(): a zero-row update (RLS refusal) must fail
    // visibly, not toast success over a shop that never paused.
    const { data: updated, error } = await supabase.from('artist_profiles').update({
      away_mode: true,
      away_message: message || null,
      away_until: until || null,
      commissions_open_before_away: fresh?.commissions_open ?? artist.commissions_open,
      commissions_open: false,
    }).eq('id', artist.id).select('id').maybeSingle();
    if (error || !updated) { captureException(error ?? new Error('away-mode enable matched zero rows'), { where: 'AwayModeToggle.enable' }); toast('Could not enable away mode', 'error'); }
    else { refetch(); toast('Away mode on — your shop is paused.', 'success'); }
    setSaving(false);
  };

  const disable = async () => {
    setSaving(true);
    const { data } = await supabase.from('artist_profiles').select('commissions_open_before_away').eq('id', artist.id).single();
    const { data: updated, error } = await supabase.from('artist_profiles').update({
      away_mode: false,
      away_message: null,
      away_until: null,
      commissions_open: data?.commissions_open_before_away ?? true,
      commissions_open_before_away: null,
    }).eq('id', artist.id).select('id').maybeSingle();
    if (error || !updated) { captureException(error ?? new Error('away-mode disable matched zero rows'), { where: 'AwayModeToggle.disable' }); toast('Could not turn off away mode', 'error'); }
    else { refetch(); toast('Welcome back — your shop is live again.', 'success'); }
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-line p-6">
      <h2 className="mb-1 text-lg font-semibold text-ink">Away mode</h2>
      <p className="mb-4 text-sm text-muted">
        Pause Buy Now and commissions while you&apos;re out. Your work stays visible and buyers can still save and follow.
      </p>
      {artist.away_mode ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-sand/50 p-3 text-sm text-ink">
            You&apos;re away{artist.away_until ? ` until ${formatDateOnly(artist.away_until, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}.
          </div>
          <Button variant="outline" onClick={disable} loading={saving}>Turn off away mode</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <Input label="Return date (optional)" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
          <Input label="Away message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Back from Spring Break April 2!" />
          <Button onClick={enable} loading={saving}>Set my shop to away</Button>
        </div>
      )}
    </div>
  );
}
