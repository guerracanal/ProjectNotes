'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import { useToast } from '@/contexts/ToastContext';
import { formatBytes, iconForFile } from '@/lib/file-kinds';

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Parse links.md into {title, url} pairs.
 *
 * Accepts three shapes people actually write: a `## Heading` followed by a bare
 * URL, an inline `[text](url)`, and a bullet containing a markdown link.
 */
export function parseDriveLinks(markdown) {
  if (!markdown) return [];

  const links = [];
  let heading = '';

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      heading = line.replace(/^#+\s*/, '').trim();
      continue;
    }

    const inline = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (inline) {
      links.push({ title: inline[1] || heading || inline[2], url: inline[2] });
      heading = '';
      continue;
    }

    const bare = line.match(/^-?\s*(https?:\/\/\S+)$/);
    if (bare) {
      links.push({ title: heading || bare[1], url: bare[1] });
      heading = '';
    }
  }

  return links;
}

export default function DocumentsTab({ projectPath, documents, links }) {
  const router = useRouter();
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const driveLinks = useMemo(() => parseDriveLinks(links), [links]);

  const addLink = async () => {
    const cleanTitle = title.trim();
    const cleanUrl = url.trim();

    if (!cleanTitle || !cleanUrl) {
      toast.warning('Indica un título y una URL');
      return;
    }
    try {
      new URL(cleanUrl);
    } catch {
      toast.warning('La URL no es válida');
      return;
    }

    setSaving(true);
    try {
      // Written as a markdown link so links.md stays readable outside the app.
      const entry = `\n- [${cleanTitle}](${cleanUrl})\n`;
      const res = await fetch(`/api/projects/${encodePath(projectPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_file',
          name: 'links.md',
          content: `${links || '# Enlaces\n'}${entry}`,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `Error ${res.status}`);

      setTitle('');
      setUrl('');
      toast.success('Enlace añadido');
      router.refresh();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <section className="card card-pad">
        <div className="section-head">
          <h2 className="section-title">
            <Icon name="file" size={17} />
            Ficheros locales
          </h2>
          {documents.length > 0 && <span className="badge">{documents.length}</span>}
        </div>

        {documents.length === 0 ? (
          <EmptyState
            icon="file"
            title="Sin documentos"
            description="Copia PDFs, documentos de Word, hojas de cálculo o presentaciones a la carpeta del proyecto y aparecerán aquí."
          />
        ) : (
          <ul className="doc-list">
            {documents.map((doc) => (
              <li key={doc.path} className="doc-item">
                <span className="doc-icon">
                  <Icon name={iconForFile(doc.name)} size={17} />
                </span>
                <span className="doc-text">
                  <span className="doc-name truncate">{doc.name}</span>
                  <span className="doc-meta">
                    {formatBytes(doc.size)} ·{' '}
                    {new Date(doc.mtime).toLocaleDateString('es-ES')}
                  </span>
                </span>
                <a
                  className="btn btn-secondary btn-sm"
                  href={`/api/projects/${encodePath(projectPath)}/${encodeURIComponent(doc.name)}?type=file`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir
                  <Icon name="external" size={13} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card card-pad">
        <div className="section-head">
          <h2 className="section-title">
            <Icon name="link" size={17} />
            Enlaces externos
          </h2>
          {driveLinks.length > 0 && <span className="badge">{driveLinks.length}</span>}
        </div>

        <div className="link-form">
          <input
            className="input"
            placeholder="Título del documento"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Título del enlace"
          />
          <input
            className="input"
            type="url"
            placeholder="https://docs.google.com/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addLink()}
            aria-label="URL del enlace"
          />
          <button className="btn btn-primary" onClick={addLink} disabled={saving}>
            {saving ? <span className="spinner" /> : <Icon name="plus" size={15} />}
            Añadir
          </button>
        </div>

        {driveLinks.length === 0 ? (
          <p className="text-sm text-subtle" style={{ marginTop: 'var(--sp-4)' }}>
            Aún no hay enlaces. Los que añadas se guardan en <code>links.md</code>.
          </p>
        ) : (
          <div className="grid-auto" style={{ marginTop: 'var(--sp-4)' }}>
            {driveLinks.map((link, i) => (
              <a
                key={`${link.url}-${i}`}
                className="link-card card card-hover"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="link-icon">
                  <Icon name="link" size={16} />
                </span>
                <span className="link-text">
                  <strong className="truncate">{link.title}</strong>
                  <span className="truncate text-xs text-subtle">{link.url}</span>
                </span>
                <Icon name="external" size={14} className="link-go" />
              </a>
            ))}
          </div>
        )}
      </section>

      <style jsx>{`
        .doc-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: var(--sp-1);
        }

        .doc-item {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          padding: var(--sp-3);
          border-radius: var(--r-md);
          background: var(--surface-2);
          transition: background var(--dur-fast) var(--ease);
        }

        .doc-item:hover {
          background: var(--surface-3);
        }

        .doc-icon {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          flex-shrink: 0;
          border-radius: var(--r-sm);
          background: var(--surface);
          color: var(--accent);
        }

        .doc-text {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }

        .doc-name {
          font-size: var(--fs-sm);
          font-weight: 550;
          color: var(--text);
        }

        .doc-meta {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
        }

        .link-form {
          display: grid;
          grid-template-columns: 1fr 1.4fr auto;
          gap: var(--sp-2);
        }

        .link-card {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          padding: var(--sp-3);
        }

        .link-icon {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          flex-shrink: 0;
          border-radius: var(--r-sm);
          background: var(--accent-soft);
          color: var(--accent);
        }

        .link-text {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          font-size: var(--fs-sm);
        }

        :global(.link-go) {
          color: var(--text-subtle);
          flex-shrink: 0;
        }

        @media (max-width: 640px) {
          .link-form {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
