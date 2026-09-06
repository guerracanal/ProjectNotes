'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker in production only. In development the SW would
 * cache Turbopack's rapidly-changing chunks and serve stale code after edits.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // A waiting worker means a new build is ready; activate it right away
        // so the next navigation runs the current code.
        if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage('SKIP_WAITING');
            }
          });
        });
      } catch (error) {
        console.warn('Service worker registration failed:', error);
      }
    };

    // Hydration usually happens after `load` has already fired, so waiting on
    // the event alone would silently never register. Check first, subscribe
    // only if the page is genuinely still loading.
    if (document.readyState === 'complete') {
      register();
      return undefined;
    }

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
