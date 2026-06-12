'use client';

import { useEffect, useRef } from 'react';

/**
 * Adds 'is-revealed' to the element (styled by the global `.reveal` utility)
 * the first time it scrolls into view. Pair with a `--reveal-delay` inline
 * style for staggering.
 */
export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          el.classList.add('is-revealed');
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -5% 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
