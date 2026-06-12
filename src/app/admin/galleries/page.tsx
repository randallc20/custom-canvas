'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { PageShell } from '@/components/layout/PageShell';
import { supabase } from '@/lib/supabase';
import type { GalleryProfile } from '@/types/gallery';

export default function AdminGalleriesPage() {
  return (
    <PageShell>
      <AuthGuard allowedRoles={['admin']}>
        <GalleriesContent />
      </AuthGuard>
    </PageShell>
  );
}

function GalleriesContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [galleries, setGalleries] = useState<(GalleryProfile & { profile?: { email: string; full_name: string | null } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pending' | 'verified'>('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadGalleries();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadGalleries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('gallery_profiles')
      .select('*, profile:profiles(email, full_name)')
      .eq('is_verified', tab === 'verified')
      .order('created_at', { ascending: tab === 'pending' });

    setGalleries((data ?? []) as typeof galleries);
    setLoading(false);
  };

  const handleVerify = async (galleryId: string) => {
    if (!user) return;
    setActionLoading(galleryId);
    const res = await fetch('/api/galleries', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ galleryId, action: 'verify' }),
    });
    if (res.ok) {
      toast('Gallery verified!', 'success');
      setGalleries((prev) => prev.filter((g) => g.id !== galleryId));
    } else {
      toast('Failed to verify gallery.', 'error');
    }
    setActionLoading(null);
  };

  const handleReject = async (galleryId: string) => {
    setActionLoading(galleryId);
    const res = await fetch('/api/galleries', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ galleryId, action: 'reject' }),
    });
    if (res.ok) {
      toast('Gallery rejected.', 'success');
      setGalleries((prev) => prev.filter((g) => g.id !== galleryId));
    } else {
      toast('Failed to reject gallery.', 'error');
    }
    setActionLoading(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Gallery Management</h1>

      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          onClick={() => setTab('pending')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'pending' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Pending
        </button>
        <button
          onClick={() => setTab('verified')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === 'verified' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Verified
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : galleries.length === 0 ? (
        <EmptyState
          title={tab === 'pending' ? 'No pending galleries' : 'No verified galleries'}
          description={tab === 'pending' ? 'All gallery applications have been reviewed.' : 'No galleries have been verified yet.'}
        />
      ) : (
        <div className="space-y-4">
          {galleries.map((gallery) => (
            <div key={gallery.id} className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{gallery.gallery_name}</h3>
                  <p className="text-sm text-gray-500">
                    {gallery.profile?.full_name ?? gallery.profile?.email}
                  </p>
                  {gallery.address && <p className="text-sm text-gray-400">{gallery.address}</p>}
                  {gallery.neighborhood && <p className="text-sm text-gray-400">{gallery.neighborhood}, {gallery.city}</p>}
                  {gallery.website_url && (
                    <p className="mt-1 text-sm text-terra">{gallery.website_url}</p>
                  )}
                  {gallery.bio && (
                    <p className="mt-2 text-sm text-gray-600">{gallery.bio}</p>
                  )}
                </div>
                <Badge variant={gallery.is_verified ? 'verified' : 'warning'}>
                  {gallery.is_verified ? 'Verified' : 'Pending'}
                </Badge>
              </div>
              {tab === 'pending' && (
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleVerify(gallery.id)}
                    loading={actionLoading === gallery.id}
                  >
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(gallery.id)}
                    loading={actionLoading === gallery.id}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
