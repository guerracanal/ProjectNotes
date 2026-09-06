'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './ui/Icon';

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Full-screen image viewer with keyboard and swipe navigation. */
export default function ImageLightbox({ images, currentIndex, onClose, onNavigate }) {
  const touchStart = useRef(null);

  const go = useCallback(
    (delta) => {
      const next = (currentIndex + delta + images.length) % images.length;
      onNavigate(next);
    },
    [currentIndex, images.length, onNavigate]
  );

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };

    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  const image = images[currentIndex];
  if (!image || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="lb-overlay"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStart.current;
        // 60px keeps a deliberate swipe from being confused with a tap.
        if (Math.abs(delta) > 60) go(delta > 0 ? -1 : 1);
        touchStart.current = null;
      }}
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
    >
      <button className="lb-close" onClick={onClose} aria-label="Cerrar">
        <Icon name="x" size={20} />
      </button>

      {images.length > 1 && (
        <>
          <button
            className="lb-nav prev"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Imagen anterior"
          >
            <Icon name="chevron-left" size={22} />
          </button>
          <button
            className="lb-nav next"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Imagen siguiente"
          >
            <Icon name="chevron-right" size={22} />
          </button>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="lb-image"
        src={`/api/projects/${encodePath(image.path)}?type=file`}
        alt={image.name}
        onClick={(e) => e.stopPropagation()}
      />

      <div className="lb-info" onClick={(e) => e.stopPropagation()}>
        <span className="truncate">{image.name}</span>
        <span className="lb-counter">
          {currentIndex + 1} / {images.length}
        </span>
        <a
          className="btn btn-ghost btn-icon btn-sm"
          href={`/api/projects/${encodePath(image.path)}?type=file`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir en una pestaña"
        >
          <Icon name="external" size={15} />
        </a>
      </div>

      <style jsx>{`
        .lb-overlay {
          position: fixed;
          inset: 0;
          z-index: 4500;
          display: grid;
          place-items: center;
          padding: var(--sp-6);
          background: rgba(4, 5, 10, 0.92);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          animation: fade-in var(--dur) var(--ease-out);
        }

        .lb-image {
          max-width: 100%;
          max-height: calc(100dvh - 140px);
          object-fit: contain;
          border-radius: var(--r-md);
          box-shadow: var(--shadow-lg);
          animation: scale-in var(--dur) var(--ease-out);
        }

        .lb-close {
          position: absolute;
          top: calc(var(--sp-4) + var(--safe-t));
          right: var(--sp-4);
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          transition: background var(--dur-fast) var(--ease);
        }

        .lb-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .lb-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          transition: background var(--dur-fast) var(--ease);
        }

        .lb-nav:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .lb-nav.prev { left: var(--sp-4); }
        .lb-nav.next { right: var(--sp-4); }

        .lb-info {
          position: absolute;
          bottom: calc(var(--sp-4) + var(--safe-b));
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          max-width: calc(100vw - var(--sp-8));
          padding: var(--sp-2) var(--sp-3);
          border-radius: var(--r-full);
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          font-size: var(--fs-xs);
        }

        .lb-counter {
          font-variant-numeric: tabular-nums;
          opacity: 0.7;
          flex-shrink: 0;
        }

        @media (max-width: 640px) {
          .lb-overlay { padding: var(--sp-2); }
          .lb-nav { display: none; }
        }
      `}</style>
    </div>,
    document.body
  );
}
