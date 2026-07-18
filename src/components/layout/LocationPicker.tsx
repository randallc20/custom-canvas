'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useLocation } from '@/context/LocationContext';
import {
  resolveZip,
  resolveGeolocation,
  parseCityInput,
  formatLocation,
} from '@/lib/location';

/** Navbar pill + modal: pick your community by device location, city, or
 *  ZIP (for people who'd rather not share location). Stored locally only. */
export function LocationPicker({ variant = 'pill' }: { variant?: 'pill' | 'hero' } = {}) {
  const { location, ready, setLocation } = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<'geo' | 'input' | null>(null);

  if (!ready) return null;

  const apply = (loc: NonNullable<ReturnType<typeof parseCityInput>>) => {
    setLocation(loc);
    setOpen(false);
    setInput('');
    toast(`Showing art near ${formatLocation(loc)}`, 'success');
  };

  const handleGeolocate = async () => {
    setBusy('geo');
    const loc = await resolveGeolocation();
    setBusy(null);
    if (loc) apply(loc);
    else toast('Could not detect your location — try a city or ZIP instead.', 'error');
  };

  const handleInput = async () => {
    const value = input.trim();
    if (!value) return;
    setBusy('input');
    // ZIP if it looks like one; otherwise treat as a city name.
    const loc = /^\d{5}$/.test(value) ? await resolveZip(value) : parseCityInput(value);
    setBusy(null);
    if (loc) apply(loc);
    else toast('We couldn’t find that — check the city or 5-digit ZIP.', 'error');
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          variant === 'hero'
            ? 'press rounded-full bg-terra px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-terraDark'
            : 'flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-sand/50'
        }
        aria-label="Choose your location"
      >
        {variant === 'pill' && (
        <svg className="h-4 w-4 text-terra" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        )}
        <span className={variant === 'hero' ? '' : 'max-w-[9rem] truncate'}>
          {variant === 'hero'
            ? 'Choose your city'
            : location ? formatLocation(location) : 'Set location'}
        </span>
      </button>

      <Modal isOpen={open} title="Where should we look for art?" onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Choose your community to see local artists first. Your choice is saved only
            on this device. &ldquo;Use my current location&rdquo; sends your coordinates to a
            geocoding service once to find your city — type a city or ZIP instead if
            you&apos;d rather not share your location.
          </p>

          <Button variant="outline" className="w-full" onClick={handleGeolocate} loading={busy === 'geo'}>
            Use my current location
          </Button>

          <div className="flex items-center gap-3 text-xs text-muted">
            <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="City (e.g. Houston) or ZIP (e.g. 77005)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInput()}
            />
            <Button onClick={handleInput} loading={busy === 'input'} disabled={!input.trim()}>
              Go
            </Button>
          </div>

          {location && (
            <button
              onClick={() => { setLocation(null); setOpen(false); }}
              className="w-full text-center text-sm text-muted hover:text-ink"
            >
              Clear — browse everywhere
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
