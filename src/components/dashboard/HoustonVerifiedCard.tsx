'use client';

import { useEffect, useState } from 'react';
import { captureException } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

export function HoustonVerifiedCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [artist, setArtist] = useState<{ id: string; is_houston_verified: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [connectionType, setConnectionType] = useState('school');
  const [details, setDetails] = useState('');
  const [links, setLinks] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('artist_profiles').select('id, is_houston_verified').eq('profile_id', user.id).single()
      .then(async ({ data }) => {
        if (!data) return;
        setArtist(data);
        const { data: req } = await supabase.from('verification_requests').select('id').eq('artist_id', data.id).eq('status', 'pending').maybeSingle();
        setPending(!!req);
      });
  }, [user]);

  if (!artist || artist.is_houston_verified) return null;

  const submit = async () => {
    if (!details.trim()) { toast('Tell us how you\'re connected to your local art community.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('verification_requests').insert({
      artist_id: artist.id, connection_type: connectionType, details: details.trim(), links: links.trim() || null,
    });
    if (error) { captureException(error, { where: 'HoustonVerifiedCard.submit' }); toast('Could not submit request', 'error'); }
    else { setPending(true); setOpen(false); toast('Request submitted — we\'ll review it soon.', 'success'); }
    setSaving(false);
  };

  return (
    <div className="rounded-xl border border-line p-6">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">Get Local Verified</h2>
        {pending && <Badge variant="warning">Under review</Badge>}
      </div>
      <p className="mb-4 text-sm text-muted">
        The Local Verified badge tells buyers you&apos;re a real, rooted member of your local art community. Tell us how you&apos;re connected to the city.
      </p>
      {pending ? (
        <p className="text-sm text-muted">Your request is in the queue — we&apos;ll notify you when it&apos;s reviewed.</p>
      ) : open ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">How are you connected?</label>
            <select value={connectionType} onChange={(e) => setConnectionType(e.target.value)} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink">
              <option value="school">Local art school</option>
              <option value="neighborhood">Live in the community</option>
              <option value="studio">Local studio space</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Input label="Details" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. MFA at UH, studio in the Heights" />
          <Input label="Links (optional)" value={links} onChange={(e) => setLinks(e.target.value)} placeholder="Portfolio, school page, etc." />
          <div className="flex gap-2">
            <Button onClick={submit} loading={saving}>Submit</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setOpen(true)}>Request verification</Button>
      )}
    </div>
  );
}
