'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './ui/Icon';
import { useToast } from '@/contexts/ToastContext';

/**
 * Compact readout of the knowledge index that powers search and the assistant,
 * with a one-click reindex for after a bulk import or Drive sync.
 */
export default function KnowledgeStatus() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge');
      if (res.ok) setStats(await res.json());
    } catch {
      /* the sidebar stays usable without this readout */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reindex = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/knowledge', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fallo al reindexar');
      setStats(data);
      toast.success(`Índice reconstruido: ${data.documents} documentos, ${data.chunks} fragmentos`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (!stats) return null;

  return (
    <div className="knowledge-status">
      <div className="ks-head">
        <Icon name="database" size={14} />
        <span className="ks-title">Base de conocimiento</span>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={reindex}
          disabled={busy}
          title="Reconstruir el índice"
          aria-label="Reconstruir el índice"
        >
          {busy ? <span className="spinner" /> : <Icon name="refresh" size={13} />}
        </button>
      </div>
      <p className="ks-meta">
        {stats.documents} docs · {stats.chunks} fragmentos
        {stats.transcripts > 0 && ` · ${stats.transcripts} transcripciones`}
      </p>
      <p className="ks-meta ks-mode">
        {stats.semantic ? `Híbrido (${stats.embeddingProvider})` : 'Léxico BM25'}
        {!stats.chatEnabled && ' · chat sin clave'}
      </p>

      <style jsx>{`
        .knowledge-status {
          padding: var(--sp-2) var(--sp-3);
          margin-bottom: var(--sp-2);
          border-radius: var(--r-md);
          background: var(--surface-3);
        }
        .ks-head {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          color: var(--text-muted);
        }
        .ks-title {
          flex: 1;
          font-size: var(--fs-2xs);
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .ks-meta {
          font-size: var(--fs-2xs);
          color: var(--text-subtle);
          line-height: 1.5;
        }
        .ks-mode {
          opacity: 0.85;
        }
      `}</style>
    </div>
  );
}
