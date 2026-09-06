'use client';

import { useEffect, useState } from 'react';
import Icon from './ui/Icon';

/** Floating "back to top" affordance for long note and transcript pages. */
export default function ScrollButtons() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = null;

    const onScroll = () => {
      if (frame) return;
      // Coalesce to one read per frame — scroll fires far faster than paint.
      frame = requestAnimationFrame(() => {
        setVisible(window.scrollY > 420);
        frame = null;
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <button
      className={`scroll-top ${visible ? 'visible' : ''}`}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Volver arriba"
      tabIndex={visible ? 0 : -1}
    >
      <Icon name="arrow-up" size={18} />

      <style jsx>{`
        .scroll-top {
          position: fixed;
          right: var(--sp-5);
          bottom: calc(var(--sp-5) + var(--safe-b));
          z-index: 900;
          display: grid;
          place-items: center;
          width: 42px;
          height: 42px;
          border: 1px solid var(--border);
          border-radius: 50%;
          background: var(--surface);
          color: var(--text-muted);
          box-shadow: var(--shadow-md);
          opacity: 0;
          transform: translateY(12px) scale(0.9);
          pointer-events: none;
          transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease-out),
            color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
        }

        .scroll-top.visible {
          opacity: 1;
          transform: none;
          pointer-events: auto;
        }

        .scroll-top:hover {
          color: var(--accent);
          border-color: var(--accent);
        }

        @media (max-width: 899px) {
          .scroll-top {
            right: var(--sp-3);
            bottom: calc(var(--sp-3) + var(--safe-b) + 64px);
          }
        }
      `}</style>
    </button>
  );
}
