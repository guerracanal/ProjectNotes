'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';

const ToastContext = createContext(null);

const ICONS = {
  success: 'check-circle',
  error: 'alert-circle',
  warning: 'alert-triangle',
  info: 'info',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message, { type = 'info', duration = 4000, title } = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((list) => [...list, { id, message, type, title }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
      return id;
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      show: push,
      success: (m, o) => push(m, { ...o, type: 'success' }),
      error: (m, o) => push(m, { ...o, type: 'error', duration: 6000 }),
      warning: (m, o) => push(m, { ...o, type: 'warning' }),
      info: (m, o) => push(m, { ...o, type: 'info' }),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-viewport" role="region" aria-live="polite" aria-label="Notificaciones">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role="status">
            <Icon name={ICONS[t.type]} size={18} className="toast-icon" />
            <div className="toast-body">
              {t.title && <strong>{t.title}</strong>}
              <span>{t.message}</span>
            </div>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Cerrar">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>

      <style jsx global>{`
        .toast-viewport {
          position: fixed;
          z-index: 5000;
          bottom: calc(var(--sp-5) + var(--safe-b));
          right: var(--sp-5);
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          max-width: min(380px, calc(100vw - var(--sp-8)));
          pointer-events: none;
        }
        .toast {
          display: flex;
          align-items: flex-start;
          gap: var(--sp-3);
          padding: var(--sp-3) var(--sp-4);
          border-radius: var(--r-md);
          border: 1px solid var(--border);
          background: var(--surface);
          box-shadow: var(--shadow-lg);
          font-size: var(--fs-sm);
          pointer-events: auto;
          animation: slide-up var(--dur) var(--ease-out);
        }
        .toast-body {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          min-width: 0;
          color: var(--text);
          word-break: break-word;
        }
        .toast-icon { flex-shrink: 0; margin-top: 1px; }
        .toast-success .toast-icon { color: var(--success); }
        .toast-error .toast-icon { color: var(--danger); }
        .toast-warning .toast-icon { color: var(--warning); }
        .toast-info .toast-icon { color: var(--info); }
        .toast-success { border-left: 3px solid var(--success); }
        .toast-error { border-left: 3px solid var(--danger); }
        .toast-warning { border-left: 3px solid var(--warning); }
        .toast-info { border-left: 3px solid var(--info); }
        .toast-close {
          flex-shrink: 0;
          display: grid;
          place-items: center;
          width: 22px;
          height: 22px;
          border-radius: var(--r-xs);
          color: var(--text-subtle);
          transition: background var(--dur-fast) var(--ease);
        }
        .toast-close:hover { background: var(--surface-hover); color: var(--text); }

        @media (max-width: 640px) {
          .toast-viewport {
            left: var(--sp-3);
            right: var(--sp-3);
            bottom: calc(var(--sp-3) + var(--safe-b) + 64px);
            max-width: none;
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
