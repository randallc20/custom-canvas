'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { withSessionRetry } from '@/lib/sessionRetry';
import { captureException } from '@/lib/sentry';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';

interface Prefs {
  marketing: boolean;
  new_listing_alerts: boolean;
  message_notifications: boolean;
  price_drop_alerts: boolean;
}

// Order matters — message forwarding is what most people look for first.
const OPTIONS: { key: keyof Prefs; label: string; description: string }[] = [
  {
    key: 'message_notifications',
    label: 'Email me when I get a new message',
    description:
      "When someone messages you and you haven't read it yet, we'll email you the message with a link to read and reply.",
  },
  {
    key: 'new_listing_alerts',
    label: 'New work from artists I follow',
    description: 'Get an email when an artist you follow lists a new piece.',
  },
  {
    key: 'price_drop_alerts',
    label: 'Price drops on art I saved',
    description: "We'll email you if a piece you saved drops in price.",
  },
  {
    key: 'marketing',
    label: 'Product news & occasional updates',
    description: 'Now-and-then emails about new features and Custom Canvas news.',
  },
];

const DEFAULTS: Prefs = { marketing: true, new_listing_alerts: true, message_notifications: true, price_drop_alerts: true };

export function EmailPreferences() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // A slow prefs fetch must never clobber a toggle the user already flipped —
  // it used to land late, silently revert the flip, and Save then wrote the
  // reverted state behind a success toast.
  const touched = useRef(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('email_preferences').eq('id', user.id).single()
      .then(({ data }) => {
        if (!touched.current && data?.email_preferences) setPrefs({ ...DEFAULTS, ...data.email_preferences });
        setLoading(false);
      });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    // .maybeSingle() + one session-refresh retry: a fresh-session RLS race
    // used to update zero rows and still toast success (same class as the
    // artist profile save bug).
    const run = () =>
      supabase.from('profiles').update({ email_preferences: prefs }).eq('id', user.id).select('id').maybeSingle();
    const { data, error } = await withSessionRetry(run, (r) => !r.error && !r.data);
    const failed = !!error || !data;
    if (failed) captureException(error ?? new Error('email-preferences save matched zero rows'), { where: 'EmailPreferences.save' });
    toast(failed ? 'Could not save preferences — please try again' : 'Email preferences saved', failed ? 'error' : 'success');
    setSaving(false);
  };

  if (loading) return null;

  return (
    <div className="mb-8 rounded-xl border border-line p-6">
      <h2 className="mb-4 text-lg font-semibold text-ink">Email Preferences</h2>
      <div className="space-y-4">
        {OPTIONS.map(({ key, label, description }) => (
          <label key={key} className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => { touched.current = true; setPrefs((p) => ({ ...p, [key]: e.target.checked })); }}
              className="mt-0.5 h-4 w-4 rounded border-line text-terra focus:ring-terra/30"
            />
            <span className="text-sm">
              <span className="font-medium text-ink">{label}</span>
              <span className="mt-0.5 block text-xs text-muted">{description}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Purchase and payout emails are always sent.</p>
      <Button className="mt-4" onClick={save} loading={saving}>Save Preferences</Button>
    </div>
  );
}
