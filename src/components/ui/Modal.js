'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

/**
 * Accessible modal dialog: portals to <body>, traps Escape, restores focus and
 * locks background scrolling while open.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  icon,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
}) {
  const panelRef = useRef(null);
  const bodyRef = useRef(null);
  const previouslyFocused = useRef(null);

  /**
   * `onClose` fuera de las dependencias del efecto.
   *
   * Quien usa el modal pasa casi siempre una flecha inline
   * (`onClose={() => setShowCreate(false)}`), que cambia de identidad en cada
   * render. Con `onClose` en las dependencias, cada tecla escrita en un campo
   * del modal re-renderizaba al padre, el efecto se limpiaba y se volvía a
   * ejecutar, y su última línea devolvía el foco al principio del diálogo. El
   * síntoma era no poder escribir: cada carácter mandaba el foco a «Cerrar».
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocused.current = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Llevar el foco al primer campo del cuerpo, no al primer elemento
    // enfocable del diálogo: una lista de selectores CSS casa en orden de
    // documento, y la cabecera —con el botón de cerrar— va antes que el
    // cuerpo. Sin esto, abrir «Nueva nota» dejaba el cursor en «Cerrar».
    const field = bodyRef.current?.querySelector(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
    );
    const fallback = panelRef.current?.querySelector(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'
    );
    (field || fallback)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      if (previouslyFocused.current instanceof HTMLElement) {
        previouslyFocused.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const widths = { sm: '400px', md: '520px', lg: '720px', xl: '960px' };

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        style={{ maxWidth: widths[size] || widths.md }}
      >
        {title && (
          <div className="modal-header">
            <div className="row">
              {icon && <Icon name={icon} size={18} style={{ color: 'var(--accent)' }} />}
              <h3>{title}</h3>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar">
              <Icon name="x" size={16} />
            </button>
          </div>
        )}
        <div className="modal-body" ref={bodyRef}>
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
