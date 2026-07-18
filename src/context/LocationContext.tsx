'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { BuyerLocation, LOCATION_STORAGE_KEY } from '@/lib/location';

interface LocationContextValue {
  /** The buyer's chosen community, or null for "browse everywhere". */
  location: BuyerLocation | null;
  /** False until localStorage has been read (avoids hero copy flicker). */
  ready: boolean;
  setLocation: (loc: BuyerLocation | null) => void;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocationState] = useState<BuyerLocation | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
      if (raw) setLocationState(JSON.parse(raw));
    } catch {
      // corrupt value — start fresh
    }
    setReady(true);
  }, []);

  const setLocation = useCallback((loc: BuyerLocation | null) => {
    setLocationState(loc);
    try {
      if (loc) localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc));
      else localStorage.removeItem(LOCATION_STORAGE_KEY);
    } catch {
      // storage unavailable (private mode) — context still works for the session
    }
  }, []);

  return (
    <LocationContext.Provider value={{ location, ready, setLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
