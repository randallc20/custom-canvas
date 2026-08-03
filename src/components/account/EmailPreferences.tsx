'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('email_preferences').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.email_preferences) setPrefs({ ...DEFAULTS, ...data.email_preferences });
        setLoading(false);
      });
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ email_preferences: prefs }).eq('id', user.id);
    toast(error ? 'Could not save preferences' : 'Email preferences saved', error ? 'error' : 'success');
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
              onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
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
