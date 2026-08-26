'use client';

import { useEffect, useState } from 'react';
import { captureException } from '@/lib/sentry';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

interface Service {
  id: string;
  name: string;
  category: 'photographer' | 'framing' | 'printing' | 'other';
  blurb: string | null;
  city: string;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  is_active: boolean;
  display_order: number;
}

const CATEGORIES = ['photographer', 'framing', 'printing', 'other'] as const;
const EMPTY_FORM = {
  name: '', category: 'photographer' as Service['category'], blurb: '', city: 'Houston',
  contact_email: '', contact_phone: '', website_url: '',
};

export default function AdminServicesPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <Content />
      </AuthGuard>
    </PageShell>
  );
}

function Content() {
  const { toast } = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => {
    fetch('/api/admin/services')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setServices(Array.isArray(data) ? data : []);
        setLoading(false);
      });
  };
  useEffect(load, []);

  const set = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) return toast('Name is required', 'error');
    setSaving(true);
    const res = await fetch(editingId ? `/api/admin/services/${editingId}` : '/api/admin/services', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, blurb: form.blurb || null }),
    });
    if (res.ok) {
      toast(editingId ? 'Service updated' : 'Service added', 'success');
      setForm(EMPTY_FORM);
      setEditingId(null);
      load();
    } else {
      captureException(new Error(`service save failed (HTTP ${res.status})`), { where: 'admin.services.save' });
      toast('Save failed — check the fields (valid email/URL?)', 'error');
    }
    setSaving(false);
  };

  const toggleActive = async (s: Service) => {
    const res = await fetch(`/api/admin/services/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !s.is_active }),
    });
    if (res.ok) load();
  };

  const startEdit = (s: Service) => {
    setEditingId(s.id);
    setForm({
      name: s.name, category: s.category, blurb: s.blurb ?? '', city: s.city,
      contact_email: s.contact_email ?? '', contact_phone: s.contact_phone ?? '',
      website_url: s.website_url ?? '',
    });
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-ink">Artist Services</h1>
      <p className="mb-6 text-sm text-muted">
        Curated providers artists can hire directly — photographers first. Shown to signed-in
        artists under Studio → Services.
      </p>

      <div className="mb-8 space-y-3 rounded-xl border border-line p-4">
        <p className="text-sm font-semibold text-ink">{editingId ? 'Edit service' : 'Add a service'}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" id="svc-name" value={form.name} onChange={set('name')} />
          <div>
            <label htmlFor="svc-cat" className="mb-1 block text-sm font-medium text-ink">Category</label>
            <select id="svc-cat" value={form.category} onChange={set('category')}
              className="w-full rounded-lg border border-line bg-surface p-2 text-sm text-ink">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Input label="City" id="svc-city" value={form.city} onChange={set('city')} />
          <Input label="Contact email" id="svc-email" type="email" value={form.contact_email} onChange={set('contact_email')} />
          <Input label="Contact phone" id="svc-phone" value={form.contact_phone} onChange={set('contact_phone')} />
          <Input label="Website" id="svc-url" placeholder="https://…" value={form.website_url} onChange={set('website_url')} />
        </div>
        <Input label="Blurb (what they offer, rates if shareable)" id="svc-blurb" value={form.blurb} onChange={set('blurb')} />
        <div className="flex gap-2">
          <Button size="sm" loading={saving} onClick={save}>{editingId ? 'Save changes' : 'Add service'}</Button>
          {editingId && (
            <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</Button>
          )}
        </div>
      </div>

      {services.length === 0 ? (
        <EmptyState title="No services yet" description="Add your first vetted provider above." />
      ) : (
        <div className="space-y-3">
          {services.map((s) => (
            <div key={s.id} className={`rounded-xl border border-line p-4 ${s.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">
                    {s.name} <span className="text-xs text-muted">· {s.category} · {s.city}</span>
                    {!s.is_active && <span className="ml-2 text-xs font-medium text-red-600">hidden</span>}
                  </p>
                  {s.blurb && <p className="mt-1 text-sm text-muted">{s.blurb}</p>}
                  <p className="mt-1 text-xs text-muted">
                    {[s.contact_email, s.contact_phone, s.website_url].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(s)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(s)}>
                    {s.is_active ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
