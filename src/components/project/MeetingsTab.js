'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import TranscriptModal from '../TranscriptModal';

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** One meeting = a video file, plus its optional transcript and summary. */
function MeetingCard({ meeting, projectPath, onRun }) {
  const [expanded, setExpanded] = useState(Boolean(meeting.summaryContent));
  const src = `/api/projects/${encodePath(projectPath)}/${encodeURIComponent(meeting.name)}?type=file`;

  return (
    <article className="meeting card">
      <header className="m-head">
        <div className="m-title">
          <span className="m-icon">
            <Icon name="video" size={17} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate">{meeting.baseName}</h3>
            <span className="m-date">
              {new Date(meeting.mtime).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>

        <div className="m-badges">
          {meeting.transcriptPath && (
            <span className="badge badge-info">
              <Icon name="file-text" size={11} />
              Transcrita
            </span>
          )}
          {meeting.summaryContent && (
            <span className="badge badge-success">
              <Icon name="sparkles" size={11} />
              Resumida
            </span>
          )}
        </div>
      </header>

      <div className="m-body">
        <div className="m-video">
          <video controls preload="metadata" playsInline>
            <source src={src} />
            Tu navegador no puede reproducir este vídeo.
          </video>

          <div className="m-actions">
            {meeting.transcriptPath ? (
              <>
                <a
                  className="btn btn-secondary btn-sm"
                  href={`/api/projects/${encodePath(projectPath)}/${encodeURIComponent(`${meeting.baseName}_transcripcion.txt`)}?type=file`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="file-text" size={14} />
                  Ver transcripción
                </a>
                {!meeting.summaryContent && (
                  <button className="btn btn-soft btn-sm" onClick={() => onRun(meeting, 'summary')}>
                    <Icon name="sparkles" size={14} />
                    Generar resumen
                  </button>
                )}
              </>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => onRun(meeting, 'transcript')}>
                <Icon name="mic" size={14} />
                Transcribir
              </button>
            )}
          </div>
        </div>

        {meeting.summaryContent && (
          <div className="m-summary">
            <button className="m-summary-head" onClick={() => setExpanded((v) => !v)}>
              <Icon name="sparkles" size={15} />
              <span>Resumen</span>
              <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} />
            </button>
            {expanded && (
              <div className="markdown markdown-compact">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{meeting.summaryContent}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .meeting {
          overflow: hidden;
        }

        .m-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-3);
          padding: var(--sp-4);
          border-bottom: 1px solid var(--border);
          flex-wrap: wrap;
        }

        .m-title {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          min-width: 0;
        }

        .min-w-0 { min-width: 0; }

        .m-icon {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          flex-shrink: 0;
          border-radius: var(--r-md);
          background: var(--accent-soft);
          color: var(--accent);
        }

        .m-title h3 {
          font-size: var(--fs-sm);
          font-weight: 650;
        }

        .m-date {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
        }

        .m-badges {
          display: flex;
          gap: var(--sp-1);
          flex-wrap: wrap;
        }

        .m-body {
          display: grid;
          grid-template-columns: ${meeting.summaryContent ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr'};
          gap: var(--sp-4);
          padding: var(--sp-4);
        }

        .m-video video {
          width: 100%;
          border-radius: var(--r-md);
          background: #000;
          aspect-ratio: 16 / 9;
        }

        .m-actions {
          display: flex;
          gap: var(--sp-2);
          margin-top: var(--sp-3);
          flex-wrap: wrap;
        }

        .m-summary {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          min-width: 0;
        }

        .m-summary-head {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-2) var(--sp-3);
          border-radius: var(--r-md);
          background: var(--surface-2);
          font-size: var(--fs-sm);
          font-weight: 600;
          color: var(--text);
        }

        .m-summary-head span {
          flex: 1;
          text-align: left;
        }

        .m-summary-head :global(svg:first-child) {
          color: var(--accent);
        }

        .m-summary .markdown {
          max-height: 340px;
          overflow-y: auto;
          padding: var(--sp-3);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          background: var(--surface-2);
        }

        @media (max-width: 899px) {
          .m-body {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </article>
  );
}

export default function MeetingsTab({ projectPath, meetings }) {
  const [modal, setModal] = useState(null);

  if (!meetings || meetings.length === 0) {
    return (
      <EmptyState
        icon="video"
        title="Sin reuniones grabadas"
        description="Coloca ficheros .mp4, .webm o .mkv en la carpeta del proyecto y aparecerán aquí, listos para transcribir con Whisper y resumir."
      />
    );
  }

  return (
    <div className="meetings">
      {meetings.map((meeting) => (
        <MeetingCard
          key={meeting.path}
          meeting={meeting}
          projectPath={projectPath}
          onRun={(m, mode) => setModal({ meeting: m, mode })}
        />
      ))}

      {modal && (
        <TranscriptModal
          meeting={modal.meeting}
          projectPath={projectPath}
          mode={modal.mode}
          onClose={() => setModal(null)}
        />
      )}

      <style jsx>{`
        .meetings {
          display: flex;
          flex-direction: column;
          gap: var(--sp-4);
        }
      `}</style>
    </div>
  );
}
