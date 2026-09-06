'use client';

import { useEffect, useState } from 'react';
import Icon from './ui/Icon';

const DISMISS_KEY = 'projectnotes:install-dismissed';

/**
 * "Add to home screen" nudge.
 *
 * Chromium fires `beforeinstallprompt` and gives us a real install flow. iOS
 * Safari does not, so there we show the manual Share → Añadir a pantalla de
 * inicio instructions instead. Either way, dismissal is remembered.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (dismissed) return undefined;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (standalone) return undefined;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
    if (isIos && isSafari) {
      const timer = setTimeout(() => setShowIosHint(true), 4000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const dismiss = () => {
    setDeferred(null);
    setShowIosHint(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  if (!deferred && !showIosHint) return null;

  return (
    <div className="install-card" role="dialog" aria-label="Instalar ProjectNotes">
      <span className="install-mark">
        <Icon name="download" size={18} />
      </span>
      <div className="install-text">
        <strong>Instalar ProjectNotes</strong>
        {deferred ? (
          <span>Añádela a tu dispositivo y ábrela como una app.</span>
        ) : (
          <span>
            Pulsa <Icon name="upload" size={12} /> Compartir y luego «Añadir a pantalla de inicio».
          </span>
        )}
      </div>
      <div className="install-actions">
        {deferred && (
          <button className="btn btn-primary btn-sm" onClick={install}>
            Instalar
          </button>
        )}
        <button className="btn btn-ghost btn-icon btn-sm" onClick={dismiss} aria-label="Descartar">
          <Icon name="x" size={14} />
        </button>
      </div>

      <style jsx>{`
        .install-card {
          position: fixed;
          z-index: 1500;
          left: var(--sp-4);
          right: var(--sp-4);
          bottom: calc(var(--sp-4) + var(--safe-b));
          max-width: 420px;
          margin-inline: auto;
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          padding: var(--sp-3) var(--sp-4);
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          background: var(--surface);
          box-shadow: var(--shadow-lg);
          animation: slide-up var(--dur-slow) var(--ease-out);
        }

        .install-mark {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          flex-shrink: 0;
          border-radius: var(--r-md);
          background: var(--accent-soft);
          color: var(--accent);
        }

        .install-text {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          font-size: var(--fs-xs);
          color: var(--text-muted);
        }

        .install-text strong {
          font-size: var(--fs-sm);
          color: var(--text);
        }

        .install-actions {
          display: flex;
          align-items: center;
          gap: var(--sp-1);
          flex-shrink: 0;
        }

        @media (max-width: 899px) {
          .install-card {
            bottom: calc(var(--sp-3) + var(--safe-b) + 60px);
          }
        }
      `}</style>
    </div>
  );
}
