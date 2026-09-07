'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Icon from './ui/Icon';

/**
 * ⌘K palette: jump to any project, or search the full text of every note and
 * transcript. Project matching is local and instant; content search debounces
 * against /api/search.
 */
export default function CommandPalette({ isOpen, onClose }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState([]);
  const [contentHits, setContentHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setContentHits([]);
    setCursor(0);
    fetch('/api/projects/all')
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => setProjects([]));
    // Focus after the dialog paints so mobile keyboards open reliably.
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Debounced full-text search.
  useEffect(() => {
    const term = query.trim();
    if (!isOpen || term.length < 2) {
      setContentHits([]);
      setSearching(false);
      return undefined;
    }

    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&limit=8`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setContentHits(data.results || []);
      } catch (error) {
        if (error.name !== 'AbortError') setContentHits([]);
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen]);

  const projectMatches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const pool = term
      ? projects.filter(
          (p) => p.name.toLowerCase().includes(term) || p.path.toLowerCase().includes(term)
        )
      : projects.slice(0, 8);
    return pool.slice(0, 8);
  }, [projects, query]);

  const items = useMemo(
    () => [
      ...projectMatches.map((p) => ({
        kind: 'project',
        id: `p:${p.path}`,
        title: p.name,
        subtitle: p.path,
        href: `/project/${p.path.split('/').map(encodeURIComponent).join('/')}`,
      })),
      ...contentHits.map((hit) => {
        const project = hit.project.split('/').map(encodeURIComponent).join('/');
        // A spoken hit opens the transcript reader at the right moment; a
        // written one opens the file in the notes tab.
        const href =
          hit.media && hit.start !== null && hit.start !== undefined
            ? `/project/${project}?tab=meetings&media=${encodeURIComponent(hit.media)}&t=${Math.floor(hit.start)}`
            : `/project/${project}?tab=notes&file=${encodeURIComponent(hit.title)}`;

        return {
          kind: 'content',
          id: `c:${hit.path}`,
          title: hit.title,
          subtitle: hit.project,
          excerpt: hit.matches?.[0]?.excerpt,
          time: hit.start,
          icon: hit.media ? 'mic' : 'file-text',
          href,
        };
      }),
    ],
    [projectMatches, contentHits]
  );

  useEffect(() => {
    setCursor(0);
  }, [items.length]);

  const go = useCallback(
    (item) => {
      if (!item) return;
      onClose();
      router.push(item.href);
    },
    [onClose, router]
  );

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(items[cursor]);
    }
  };

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Buscar">
        <div className="palette-input">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar proyectos, notas y transcripciones…"
            aria-label="Consulta de búsqueda"
          />
          {searching && <span className="spinner" />}
          <kbd className="kbd">esc</kbd>
        </div>

        <div className="palette-list no-scrollbar" ref={listRef}>
          {items.length === 0 && (
            <p className="palette-empty">
              {query.trim().length >= 2
                ? 'Sin resultados. Prueba con otro término.'
                : 'Escribe para buscar en todos tus proyectos y notas.'}
            </p>
          )}

          {projectMatches.length > 0 && <div className="palette-group">Proyectos</div>}
          {items.map((item, index) => (
            <div key={item.id}>
              {item.kind === 'content' &&
                (index === 0 || items[index - 1].kind === 'project') && (
                  <div className="palette-group">En el contenido</div>
                )}
              <button
                data-index={index}
                className={`palette-row ${index === cursor ? 'active' : ''}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(item)}
              >
                <Icon name={item.kind === 'project' ? 'folder' : item.icon || 'file-text'} size={16} />
                <span className="palette-text">
                  <span className="palette-title truncate">{item.title}</span>
                  <span className="palette-sub truncate">{item.subtitle}</span>
                  {item.excerpt && <span className="palette-excerpt">{item.excerpt}</span>}
                </span>
                <Icon name="arrow-right" size={14} className="palette-go" />
              </button>
            </div>
          ))}
        </div>

        <div className="palette-foot">
          <span><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> navegar</span>
          <span><kbd className="kbd">↵</kbd> abrir</span>
        </div>
      </div>

      <style jsx>{`
        .palette-overlay {
          position: fixed;
          inset: 0;
          z-index: 4000;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: clamp(var(--sp-4), 9vh, 120px) var(--sp-4) var(--sp-4);
          background: var(--overlay);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          animation: fade-in var(--dur) var(--ease-out);
        }

        .palette {
          width: 100%;
          max-width: 620px;
          max-height: min(70dvh, 560px);
          display: flex;
          flex-direction: column;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--r-xl);
          box-shadow: var(--shadow-lg);
          overflow: hidden;
          animation: scale-in var(--dur) var(--ease-out);
        }

        .palette-input {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          padding: var(--sp-4);
          border-bottom: 1px solid var(--border);
          color: var(--text-subtle);
        }

        .palette-input input {
          flex: 1;
          min-width: 0;
          border: none;
          background: none;
          outline: none;
          font-size: var(--fs-md);
          color: var(--text);
        }

        .palette-input input::placeholder {
          color: var(--text-subtle);
        }

        .palette-list {
          flex: 1;
          overflow-y: auto;
          padding: var(--sp-2);
        }

        .palette-group {
          padding: var(--sp-2) var(--sp-3) var(--sp-1);
          font-size: var(--fs-2xs);
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--text-subtle);
        }

        .palette-row {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          width: 100%;
          padding: var(--sp-2) var(--sp-3);
          border-radius: var(--r-md);
          text-align: left;
          color: var(--text-muted);
          transition: background var(--dur-fast) var(--ease);
        }

        .palette-row.active {
          background: var(--accent-soft);
          color: var(--accent);
        }

        .palette-text {
          display: flex;
          flex-direction: column;
          gap: 1px;
          flex: 1;
          min-width: 0;
        }

        .palette-title {
          font-size: var(--fs-sm);
          font-weight: 600;
          color: var(--text);
        }

        .palette-row.active .palette-title {
          color: var(--accent);
        }

        .palette-sub {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
        }

        .palette-excerpt {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        :global(.palette-go) {
          opacity: 0;
          flex-shrink: 0;
          transition: opacity var(--dur-fast) var(--ease);
        }

        .palette-row.active :global(.palette-go) {
          opacity: 1;
        }

        .palette-empty {
          padding: var(--sp-8) var(--sp-4);
          text-align: center;
          font-size: var(--fs-sm);
          color: var(--text-subtle);
        }

        .palette-foot {
          display: flex;
          gap: var(--sp-4);
          padding: var(--sp-2) var(--sp-4);
          border-top: 1px solid var(--border);
          background: var(--surface-2);
          font-size: var(--fs-xs);
          color: var(--text-subtle);
        }

        .palette-foot span {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        @media (max-width: 640px) {
          .palette-overlay {
            padding: var(--sp-3);
            align-items: flex-start;
          }
          .palette {
            max-height: 82dvh;
          }
          .palette-foot {
            display: none;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
