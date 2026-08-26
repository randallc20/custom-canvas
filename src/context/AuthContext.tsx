'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types/user';

interface AuthContextValue {
  user: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string, captchaToken?: string) => Promise<void>;
  signUp: (email: string, password: string, role: string, fullName: string, captchaToken?: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string, captchaToken?: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  resendConfirmation: (email: string, role: string, captchaToken?: string) => Promise<void>;
}

/** Where a fresh account lands after its email is confirmed (or immediately,
 *  when the project has autoconfirm on). */
export function postSignupPath(role: string): string {
  if (role === 'artist') return '/onboarding/artist';
  if (role === 'gallery') return '/onboarding/gallery';
  return '/';
}

function confirmationRedirect(role: string): string {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(postSignupPath(role))}`;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // The email column is not client-readable (00031 column privacy) — the
    // auth session is the source of truth for the user's own email, so we
    // select the public columns and merge session email into the Profile.
    const fetchProfile = async (userId: string, email: string) => {
      const run = () =>
        supabase
          .from('profiles')
          .select('id, role, full_name, avatar_url, created_at, updated_at')
          .eq('id', userId)
          .single();

      let { data, error } = await run();
      // An expired access token mid-refresh errors here; re-sync and retry
      // once before believing it. PGRST116 (zero rows) is a real answer, not
      // a transient — no retry for it.
      if (error && error.code !== 'PGRST116') {
        await supabase.auth.refreshSession();
        ({ data, error } = await run());
      }

      if (isMounted) {
        if (data) {
          setUser({ ...data, email });
        } else if (error?.code === 'PGRST116') {
          // The profile row is genuinely gone (deleted account) — signed out.
          setUser(null);
        }
        // Any other persistent error: KEEP the current user state. This used
        // to setUser(null), which made AuthGuard bounce a still-authenticated
        // user to /login (or / on a role check) on any transient failure —
        // and every onAuthStateChange event re-fetches, so each blip was a
        // fresh chance to fake-sign-out the user mid-session.
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user.id, session.user.email ?? '');
      } else if (isMounted) {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchProfile(session.user.id, session.user.email ?? '');
      } else if (isMounted) {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string, captchaToken?: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email, password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, role: string, fullName: string, captchaToken?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, full_name: fullName },
        // Without this, the confirmation link's destination is whatever the
        // Supabase dashboard's Site URL happens to be — send it somewhere we
        // control that can finish the sign-in.
        emailRedirectTo: confirmationRedirect(role),
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (error) throw error;
    // No session back = the project requires email confirmation. (An existing
    // email also lands here: Supabase returns a stub user with no session
    // to avoid account enumeration.)
    return { needsEmailConfirmation: !data.session };
  };

  const resendConfirmation = async (email: string, role: string, captchaToken?: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: confirmationRedirect(role),
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string, captchaToken?: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
      ...(captchaToken ? { captchaToken } : {}),
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, resetPassword, updatePassword, resendConfirmation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
