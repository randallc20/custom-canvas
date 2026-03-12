'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function GalleryDashboardPage() {
  const { user } = useAuth();
  const [gallery, setGallery] = useState<{ slug: string; is_verified: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from('gallery_profiles').select('slug, is_verified').eq('profile_id', user.id).single()
      .then(({ data }) => { setGallery(data); setLoading(false); });
  }, [user]);

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Gallery Dashboard</h1>
      <div className="rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Verification Status:</span>
          {gallery?.is_verified ? <Badge variant="verified">Verified</Badge> : <Badge variant="warning">Pending</Badge>}
        </div>
        <div className="mt-4 flex gap-3">
          <Link href="/profile/edit"><Button variant="outline">Edit Profile</Button></Link>
          {gallery?.slug && <Link href={`/gallery/${gallery.slug}`}><Button variant="outline">View Public Profile</Button></Link>}
        </div>
      </div>
    </div>
  );
}
