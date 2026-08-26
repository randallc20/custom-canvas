'use client';

import { useEffect, useState } from 'react';
import { captureException } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function AwayModeToggle() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [artist, setArtist] = useState<{ id: string; away_mode: boolean; away_message: string | null; away_until: string | null; commissions_open: boolean } | null>(null);
  const [message, setMessage] = useState('');
  const [until, setUntil] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id, away_mode, away_message, away_until, commissions_open').eq('profile_id', user.id).single()
      .then(({ data }) => {
        if (data) {
          setArtist(data);
          setMessage(data.away_message ?? '');
          setUntil(data.away_until ?? '');
        }
      });
  }, [user]);

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
    else { setArtist({ ...artist, away_mode: true }); toast('Away mode on — your shop is paused.', 'success'); }
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
    else { setArtist({ ...artist, away_mode: false }); toast('Welcome back — your shop is live again.', 'success'); }
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
            You&apos;re away{artist.away_until ? ` until ${new Date(artist.away_until).toLocaleDateString()}` : ''}.
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
