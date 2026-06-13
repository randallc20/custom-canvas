'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useUnread } from '@/context/UnreadContext';
import { NotificationDropdown } from '@/components/notification/NotificationDropdown';
import { NavSearch } from '@/components/layout/NavSearch';

export function Navbar() {
  const { user, signOut } = useAuth();
  const { unreadCount } = useUnread();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-40 border-b border-line bg-cream/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="font-display text-xl font-semibold text-ink">
          Custom Canvas
        </Link>

        <div className="hidden flex-1 justify-center px-8 md:flex">
          <NavSearch className="w-full max-w-md" />
        </div>

        <div className="hidden items-center gap-4 md:flex">
          {user ? (
            <>
              <Link href="/messages" className="relative text-muted transition-colors duration-150 hover:text-ink">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-terra text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>

              <NotificationDropdown />

              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-sand text-sm font-medium text-ink transition-colors duration-150 hover:bg-line"
                >
                  {user.full_name?.[0]?.toUpperCase() ?? user.email[0].toUpperCase()}
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 animate-fade-in rounded-xl border border-line bg-surface py-1 shadow-card">
                    {user.role === 'artist' && (
                      <Link href="/dashboard" className="block px-4 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                        Artist Dashboard
                      </Link>
                    )}
                    {user.role === 'gallery' && (
                      <Link href="/dashboard" className="block px-4 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                        Partner Dashboard
                      </Link>
                    )}
                    <Link href="/account" className="block px-4 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                      My Account
                    </Link>
                    <Link href="/saved" className="block px-4 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                      Saved Art
                    </Link>
                    <Link href="/following" className="block px-4 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                      Following
                    </Link>
                    <Link href="/orders" className="block px-4 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                      Orders
                    </Link>
                    <Link href="/commissions" className="block px-4 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                      Commissions
                    </Link>
                    <hr className="my-1" />
                    <button
                      onClick={() => { signOut(); setMenuOpen(false); }}
                      className="block w-full px-4 py-2 text-left text-sm text-ink hover:bg-sand/50"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-ink transition-colors duration-150 hover:text-terraDark">
                Log In
              </Link>
              <Link
                href="/register"
                className="press rounded-full bg-terra px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-terraDark"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>

        <button
          className="md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg className="h-6 w-6 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-line bg-cream px-4 pb-4 md:hidden">
          <div className="mt-3">
            <NavSearch />
          </div>
          <div className="mt-3 space-y-1">
            {user ? (
              <>
                <Link href="/messages" className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                  Messages {unreadCount > 0 && `(${unreadCount})`}
                </Link>
                <Link href="/notifications" className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                  Notifications
                </Link>
                <Link href="/account" className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                  My Account
                </Link>
                <Link href="/saved" className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                  Saved Art
                </Link>
                <Link href="/following" className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                  Following
                </Link>
                <Link href="/orders" className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                  Orders
                </Link>
                <Link href="/commissions" className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                  Commissions
                </Link>
                <button onClick={() => { signOut(); setMenuOpen(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-sand/50">
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                  Log In
                </Link>
                <Link href="/register" className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-sand/50" onClick={() => setMenuOpen(false)}>
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
