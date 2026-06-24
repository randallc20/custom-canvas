'use client';

import { useEffect, useRef } from 'react';

/**
 * Adds 'is-revealed' to the element (styled by the global `.reveal` utility)
 * when it scrolls into view. Pair with a `--reveal-delay` inline style for
 * staggering.
 *
 * Visibility must never depend solely on the IntersectionObserver firing, so
 * this also reveals immediately when the element is already on screen (or the
 * observer is unavailable) and includes a safety timeout — otherwise a missed
 * observer callback would leave content stuck at opacity:0 forever.
 */
export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reveal = () => el.classList.add('is-revealed');

    // Already on screen, or no observer support → reveal now.
    const rect = el.getBoundingClientRect();
    const onScreen = rect.top < (window.innerHeight || document.documentElement.clientHeight) && rect.bottom > 0;
    if (onScreen || typeof IntersectionObserver === 'undefined') {
      reveal();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          reveal();
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -5% 0px' }
    );
    observer.observe(el);

    // Safety net: never leave content hidden if the observer never fires.
    const timer = setTimeout(reveal, 1200);

    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);

  return ref;
}
