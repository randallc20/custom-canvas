'use client';

import { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/context/AuthContext';
import { UnreadProvider } from '@/context/UnreadContext';
import { LocationProvider } from '@/context/LocationContext';
import { MatureProvider } from '@/context/MatureContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { AcceptanceInterstitial } from '@/components/legal/AcceptanceInterstitial';

export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UnreadProvider>
          <NotificationProvider>
            <LocationProvider>
              <MatureProvider>
              <ToastProvider>
                <ConfirmProvider>
                  {/* Ruling D11: asks every signed-in account to accept the
                      counsel set. Renders nothing when there is nothing
                      outstanding, and needs the toast + auth contexts above
                      it. */}
                  <AcceptanceInterstitial />
                  {children}
                </ConfirmProvider>
              </ToastProvider>
              </MatureProvider>
            </LocationProvider>
          </NotificationProvider>
        </UnreadProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
