'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { readMaturePreference, writeMaturePreference } from '@/lib/maturePreference';

interface MatureContextValue {
  /** True when the viewer has opted in to seeing mature work. */
  showMature: boolean;
  /** False until localStorage has been read. Feed queries wait for it, so a
   *  first paint cannot briefly include mature work before the preference
   *  arrives — the failure mode this whole ruling exists to prevent. */
  ready: boolean;
  setShowMature: (show: boolean) => void;
}

const MatureContext = createContext<MatureContextValue | undefined>(undefined);

export function MatureProvider({ children }: { children: ReactNode }) {
  const [showMature, setState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(readMaturePreference());
    setReady(true);
  }, []);

  const setShowMature = useCallback((show: boolean) => {
    setState(show);
    writeMaturePreference(show);
  }, []);

  return (
    <MatureContext.Provider value={{ showMature, ready, setShowMature }}>
      {children}
    </MatureContext.Provider>
  );
}

export function useMature(): MatureContextValue {
  const ctx = useContext(MatureContext);
  if (!ctx) throw new Error('useMature must be used within MatureProvider');
  return ctx;
}
