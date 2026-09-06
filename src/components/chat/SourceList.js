'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '../ui/Icon';

/** Citation chips under an assistant answer, expandable to show the excerpt. */
export default function SourceList({ sources }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sources">
      <button className="sources-toggle" onClick={() => setOpen((v) => !v)}>
        <Icon name="quote" size={13} />
        <span>{sources.length} fuente{sources.length === 1 ? '' : 's'}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} />
      </button>

      {open && (
        <ul className="sources-list">
          {sources.map((source) => (
            <li key={source.ref}>
              <Link
                href={`/project/${source.project.split('/').map(encodeURIComponent).join('/')}?tab=notes&file=${encodeURIComponent(source.title)}`}
                className="source-item"
              >
                <span className="source-ref">{source.ref}</span>
                <span className="source-text">
                  <span className="source-title truncate">
                    {source.title}
                    {source.heading && <span className="source-heading"> › {source.heading}</span>}
                  </span>
                  <span className="source-project truncate">{source.project}</span>
                  <span className="source-excerpt">{source.excerpt}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .sources {
          margin-top: var(--sp-3);
          padding-top: var(--sp-2);
          border-top: 1px dashed var(--border);
        }

        .sources-toggle {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-1);
          padding: 2px var(--sp-2);
          border-radius: var(--r-full);
          background: var(--accent-soft);
          color: var(--accent);
          font-size: var(--fs-2xs);
          font-weight: 600;
        }

        .sources-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: var(--sp-1);
          margin-top: var(--sp-2);
        }

        :global(.source-item) {
          display: flex;
          gap: var(--sp-2);
          padding: var(--sp-2);
          border-radius: var(--r-sm);
          background: var(--surface-3);
          transition: background var(--dur-fast) var(--ease);
        }

        :global(.source-item):hover {
          background: var(--surface-hover);
        }

        .source-ref {
          display: grid;
          place-items: center;
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          border-radius: var(--r-xs);
          background: var(--accent);
          color: var(--accent-contrast);
          font-size: var(--fs-2xs);
          font-weight: 700;
        }

        .source-text {
          display: flex;
          flex-direction: column;
          gap: 1px;
          min-width: 0;
        }

        .source-title {
          font-size: var(--fs-xs);
          font-weight: 600;
          color: var(--text);
        }

        .source-heading {
          font-weight: 400;
          color: var(--text-muted);
        }

        .source-project {
          font-size: var(--fs-2xs);
          color: var(--text-subtle);
        }

        .source-excerpt {
          font-size: var(--fs-2xs);
          color: var(--text-muted);
          line-height: 1.45;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
