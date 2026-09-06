'use client';

import Modal from './Modal';

/** Replacement for window.confirm — themed, keyboard-accessible, non-blocking. */
export default function ConfirmDialog({
  isOpen,
  onCancel,
  onConfirm,
  title = 'Confirmar acción',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  busy = false,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onCancel}
      title={title}
      icon={danger ? 'alert-triangle' : 'info'}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <span className="spinner" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-muted">{message}</p>
    </Modal>
  );
}
