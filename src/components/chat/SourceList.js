'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '../ui/Icon';
import { formatTime } from '@/lib/transcript';

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Where a citation should take the reader.
 *
 * A transcript hit knows which recording it came from and at what second, so
 * it links straight into the transcript reader at that moment. Everything else
 * opens the file in the notes tab.
 */
function hrefFor(source) {
  const project = encodePath(source.project);

  if (source.media && source.start !== null && source.start !== undefined) {
    return `/project/${project}?tab=meetings&media=${encodeURIComponent(source.media)}&t=${Math.max(0, Math.floor(source.start))}`;
  }

  return `/project/${project}?tab=notes&file=${encodeURIComponent(source.title)}`;
}

/** Citation chips under an assistant answer, expandable to show the excerpt. */
export default function SourceList({ sources }) {
  const [open, setOpen] = useState(false);
  const spoken = sources.filter((s) => s.media && s.start !== null && s.start !== undefined);

  return (
    <div className="sources">
      <button className="sources-toggle" onClick={() => setOpen((v) => !v)}>
        <Icon name="quote" size={13} />
        <span>
          {sources.length} fuente{sources.length === 1 ? '' : 's'}
          {spoken.length > 0 && ` · ${spoken.length} con minuto`}
        </span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} />
      </button>

      {open && (
        <ul className="sources-list">
          {sources.map((source) => {
            const hasTime = source.media && source.start !== null && source.start !== undefined;
            return (
              <li key={source.ref}>
                <Link href={hrefFor(source)} className="source-item">
                  <span className="source-ref">{source.ref}</span>
                  <span className="source-text">
                    <span className="source-title truncate">
                      {hasTime ? source.media : source.title}
                      {!hasTime && source.heading && (
                        <span className="source-heading"> › {source.heading}</span>
                      )}
                    </span>
                    <span className="source-line">
                      <span className="source-project truncate">{source.project}</span>
                      {hasTime && (
                        <span className="source-time">
                          <Icon name="clock" size={10} />
                          {formatTime(source.start)}
                        </span>
                      )}
                    </span>
                    <span className="source-excerpt">{source.excerpt}</span>
                  </span>
                </Link>
              </li>
            );
          })}
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

        .source-line {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          min-width: 0;
        }

        .source-project {
          font-size: var(--fs-2xs);
          color: var(--text-subtle);
        }

        .source-time {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
          padding: 0 5px;
          border-radius: var(--r-full);
          background: var(--accent-soft);
          color: var(--accent);
          font-family: var(--font-mono);
          font-size: var(--fs-2xs);
          font-weight: 600;
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
