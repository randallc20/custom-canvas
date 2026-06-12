'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { supabase } from '@/lib/supabase';
import type { GalleryProfile } from '@/types/gallery';
import type { ArtistProfile } from '@/types/artist';

export function GalleryDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [gallery, setGallery] = useState<GalleryProfile | null>(null);
  const [artists, setArtists] = useState<(ArtistProfile & { gallery_role?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ArtistProfile[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadGalleryData();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadGalleryData = async () => {
    if (!user) return;
    const { data: g } = await supabase
      .from('gallery_profiles')
      .select('*')
      .eq('profile_id', user.id)
      .single();

    if (!g) { setLoading(false); return; }
    setGallery(g);

    const { data: ga } = await supabase
      .from('gallery_artists')
      .select('role, artist:artist_profiles(*)')
      .eq('gallery_id', g.id);

    const mapped = (ga ?? []).map((row: Record<string, unknown>) => ({
      ...(row.artist as ArtistProfile),
      gallery_role: row.role as string,
    }));
    setArtists(mapped);
    setLoading(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !gallery) return;
    setSearching(true);
    const { data } = await supabase
      .from('artist_profiles')
      .select('*')
      .ilike('display_name', `%${searchQuery}%`)
      .limit(10);

    const existingIds = new Set(artists.map((a) => a.id));
    setSearchResults((data ?? []).filter((a) => !existingIds.has(a.id)));
    setSearching(false);
  };

  const handleAddArtist = async (artistId: string) => {
    if (!gallery) return;
    try {
      await supabase
        .from('gallery_artists')
        .insert({ gallery_id: gallery.id, artist_id: artistId });
      toast('Artist added to your gallery.', 'success');
      setShowAddModal(false);
      setSearchQuery('');
      setSearchResults([]);
      loadGalleryData();
    } catch {
      toast('Failed to add artist.', 'error');
    }
  };

  const handleRemoveArtist = async (artistId: string) => {
    if (!gallery) return;
    try {
      await supabase
        .from('gallery_artists')
        .delete()
        .eq('gallery_id', gallery.id)
        .eq('artist_id', artistId);
      toast('Artist removed.', 'success');
      setArtists((prev) => prev.filter((a) => a.id !== artistId));
    } catch {
      toast('Failed to remove artist.', 'error');
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Gallery Dashboard</h1>

      <div className="mb-8 rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">Verification:</span>
            {gallery?.is_verified ? (
              <Badge variant="verified">Verified</Badge>
            ) : (
              <Badge variant="warning">Pending Review</Badge>
            )}
          </div>
          <div className="flex gap-3">
            <Link href="/profile/edit"><Button variant="outline" size="sm">Edit Profile</Button></Link>
            {gallery?.slug && (
              <Link href={`/gallery/${gallery.slug}`}>
                <Button variant="outline" size="sm">View Public Page</Button>
              </Link>
            )}
          </div>
        </div>
        {!gallery?.is_verified && (
          <p className="mt-3 text-sm text-gray-500">
            Your gallery is under review. You can still set up your profile and add represented artists while you wait.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Represented Artists ({artists.length})
          </h2>
          <Button size="sm" onClick={() => setShowAddModal(true)}>Add Artist</Button>
        </div>

        {artists.length === 0 ? (
          <EmptyState
            title="No artists added yet"
            description="Search for artists to add them to your gallery's roster."
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {artists.map((artist) => (
              <div key={artist.id} className="flex items-center justify-between py-3">
                <Link href={`/artist/${artist.slug}`} className="flex items-center gap-3 hover:opacity-80">
                  <Avatar src={artist.banner_image_url} alt={artist.display_name} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{artist.display_name}</p>
                    {artist.neighborhood && (
                      <p className="text-xs text-gray-500">{artist.neighborhood}</p>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <Badge>{artist.gallery_role ?? 'represented'}</Badge>
                  <button
                    onClick={() => handleRemoveArtist(artist.id)}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showAddModal} title="Add Artist" onClose={() => { setShowAddModal(false); setSearchQuery(''); setSearchResults([]); }}>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search by artist name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} loading={searching}>Search</Button>
          </div>
          {searchResults.length > 0 ? (
            <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto">
              {searchResults.map((artist) => (
                <div key={artist.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Avatar src={artist.banner_image_url} alt={artist.display_name} size="sm" />
                    <p className="text-sm font-medium text-gray-900">{artist.display_name}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleAddArtist(artist.id)}>Add</Button>
                </div>
              ))}
            </div>
          ) : searchQuery && !searching ? (
            <p className="text-sm text-gray-500">No artists found. Try a different search.</p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
