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

const LABELS: Record<keyof Prefs, string> = {
  marketing: 'Product news & marketing',
  new_listing_alerts: 'New work from artists I follow',
  message_notifications: 'New message emails',
  price_drop_alerts: 'Price drops on saved art',
};

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
      <div className="space-y-3">
        {(Object.keys(LABELS) as (keyof Prefs)[]).map((key) => (
          <label key={key} className="flex items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={prefs[key]}
              onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))}
              className="rounded border-line"
            />
            {LABELS[key]}
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Purchase and payout emails are always sent.</p>
      <Button className="mt-4" onClick={save} loading={saving}>Save Preferences</Button>
    </div>
  );
}
