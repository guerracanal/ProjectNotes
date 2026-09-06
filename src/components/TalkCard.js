'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from './ui/Icon';

function LinkChip({ href, icon, children, tone = 'default' }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`chip tone-${tone}`}>
      <Icon name={icon} size={13} />
      <span>{children}</span>

      <style jsx>{`
        .chip {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-1);
          padding: 5px var(--sp-3);
          border: 1px solid var(--border);
          border-radius: var(--r-full);
          background: var(--surface-2);
          font-size: var(--fs-xs);
          font-weight: 550;
          color: var(--text-muted);
          transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease),
            background var(--dur-fast) var(--ease);
        }
        .chip:hover {
          border-color: currentColor;
          background: var(--surface);
        }
        .tone-video:hover { color: var(--danger); }
        .tone-slides:hover { color: var(--warning); }
        .tone-doc:hover { color: var(--accent); }
        .tone-notes:hover { color: var(--success); }
        .tone-default:hover { color: var(--accent); }
      `}</style>
    </a>
  );
}

export default function TalkCard({ talk }) {
  const videos = talk.video || [];
  const slides = talk.slides || [];
  const custom = talk.customLinks || [];

  return (
    <article className="talk card card-hover">
      <header className="talk-head">
        <h3>{talk.title}</h3>
        {talk.date && (
          <span className="badge">
            <Icon name="clock" size={11} />
            {talk.date}
          </span>
        )}
      </header>

      {talk.summary && (
        <div className="markdown markdown-compact talk-summary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{talk.summary}</ReactMarkdown>
        </div>
      )}

      <div className="talk-links">
        {talk.link && (
          <LinkChip href={talk.link} icon="link" tone="doc">
            Documentación
          </LinkChip>
        )}
        {talk.notes && (
          <LinkChip href={talk.notes} icon="file-text" tone="notes">
            Notas
          </LinkChip>
        )}
        {slides.map((slide, i) => (
          <LinkChip key={`s-${i}`} href={slide} icon="presentation" tone="slides">
            {slides.length > 1 ? `Slides ${i + 1}` : 'Slides'}
          </LinkChip>
        ))}
        {videos.map((video, i) => (
          <LinkChip key={`v-${i}`} href={video} icon="video" tone="video">
            {videos.length > 1 ? `Vídeo ${i + 1}` : 'Vídeo'}
          </LinkChip>
        ))}
        {custom.map((link, i) => (
          <LinkChip key={`c-${i}`} href={link.url} icon="external">
            {link.label}
          </LinkChip>
        ))}
      </div>

      <style jsx>{`
        .talk {
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
          padding: var(--sp-4);
        }

        .talk-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--sp-3);
        }

        .talk-head h3 {
          font-size: var(--fs-md);
          font-weight: 650;
          min-width: 0;
        }

        .talk-summary {
          color: var(--text-muted);
          max-height: 220px;
          overflow-y: auto;
        }

        .talk-links {
          display: flex;
          flex-wrap: wrap;
          gap: var(--sp-2);
          margin-top: auto;
        }
      `}</style>
    </article>
  );
}
