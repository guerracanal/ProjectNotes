'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import TranscriptModal from '../TranscriptModal';
import TranscriptReader from './TranscriptReader';
import MeetingPoster from './MeetingPoster';
import { parseTime } from '@/lib/transcript';
import { meetingTitle } from '@/lib/meetings';

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * La reunión que debe abrir el lector.
 *
 * El enlace profundo lleva el nombre del fichero de vídeo, porque es lo que
 * guarda el json de la transcripción. Ese vídeo puede no estar —no se
 * sincroniza—, así que además del nombre exacto se prueba sin extensión: una
 * cita a «reunion.mp4» tiene que abrir la reunión «reunion» aunque el vídeo se
 * haya quedado en el otro equipo.
 */
function findMeeting(meetings, openedBase, mediaParam) {
  if (!meetings?.length) return null;
  if (openedBase) return meetings.find((m) => m.baseName === openedBase) || null;
  if (!mediaParam) return null;

  const sinExtension = mediaParam.replace(/\.[^./\\]+$/, '');
  return (
    meetings.find((m) => m.name === mediaParam) ||
    meetings.find((m) => m.baseName === mediaParam || m.baseName === sinExtension) ||
    null
  );
}

/** One recording, plus its transcript and summary if they exist. */
function MeetingCard({ meeting, projectPath, onRun, onOpenReader }) {
  const [expanded, setExpanded] = useState(Boolean(meeting.summaryContent));
  // Sin grabación —lo normal desde que los vídeos no se sincronizan— el hueco
  // del reproductor lo ocupa la portada.
  const hasMedia = Boolean(meeting.name);
  const src = hasMedia
    ? `/api/projects/${encodePath(projectPath)}/${encodeURIComponent(meeting.name)}?type=file`
    : null;
  const MediaTag = meeting.kind === 'audio' ? 'audio' : 'video';

  return (
    <article className="meeting card">
      <header className="m-head">
        <div className="m-title">
          <span className="m-icon">
            <Icon name={meeting.kind === 'audio' ? 'mic' : hasMedia ? 'video' : 'file-text'} size={17} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate" title={meeting.baseName}>{meetingTitle(meeting.baseName)}</h3>
            {meeting.date && (
              <span className="m-date">
                {new Date(meeting.date).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
        </div>

        <div className="m-badges">
          {meeting.segmentsPath ? (
            <span className="badge badge-accent">
              <Icon name="clock" size={11} />
              Con marcas de tiempo
            </span>
          ) : (
            meeting.transcriptPath && (
              <span className="badge badge-info">
                <Icon name="file-text" size={11} />
                Transcrita
              </span>
            )
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
        <div className="m-media">
          {hasMedia ? (
            <MediaTag controls preload="metadata" playsInline className={meeting.kind === 'audio' ? 'audio' : 'video'}>
              <source src={src} />
              Tu navegador no puede reproducir este fichero.
            </MediaTag>
          ) : (
            <MeetingPoster meeting={meeting} />
          )}

          <div className="m-actions">
            {meeting.transcriptPath ? (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => onOpenReader(meeting)}>
                  <Icon name="file-text" size={14} />
                  {meeting.segmentsPath ? 'Leer y navegar' : 'Ver transcripción'}
                </button>
                {!meeting.summaryContent && (
                  <button className="btn btn-soft btn-sm" onClick={() => onRun(meeting, 'summary')}>
                    <Icon name="sparkles" size={14} />
                    Generar resumen
                  </button>
                )}
                {!meeting.segmentsPath && hasMedia && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onRun(meeting, 'transcript')}
                    title="Rehacer la transcripción para obtener marcas de tiempo"
                  >
                    <Icon name="clock" size={14} />
                    Añadir marcas de tiempo
                  </button>
                )}
              </>
            ) : hasMedia ? (
              <button className="btn btn-primary btn-sm" onClick={() => onRun(meeting, 'transcript')}>
                <Icon name="mic" size={14} />
                Transcribir
              </button>
            ) : null}
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
        .meeting { overflow: hidden; }

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

        .m-title h3 { font-size: var(--fs-sm); font-weight: 650; }
        .m-date { font-size: var(--fs-xs); color: var(--text-subtle); }

        .m-badges { display: flex; gap: var(--sp-1); flex-wrap: wrap; }

        .m-body {
          display: grid;
          grid-template-columns: ${meeting.summaryContent ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr'};
          gap: var(--sp-4);
          padding: var(--sp-4);
        }

        .m-media .video {
          width: 100%;
          border-radius: var(--r-md);
          background: #000;
          aspect-ratio: 16 / 9;
        }

        .m-media .audio { width: 100%; }

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

        .m-summary-head span { flex: 1; text-align: left; }
        .m-summary-head :global(svg:first-child) { color: var(--accent); }

        .m-summary .markdown {
          max-height: 340px;
          overflow-y: auto;
          padding: var(--sp-3);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          background: var(--surface-2);
        }

        @media (max-width: 899px) {
          .m-body { grid-template-columns: 1fr; }
        }
      `}</style>
    </article>
  );
}

export default function MeetingsTab({ projectPath, meetings }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [modal, setModal] = useState(null);
  // Which meeting the reader is showing, when it was opened from the list.
  // A deep link opens it through the URL instead, so this stays null there.
  //
  // Se identifica por el nombre base y no por el del fichero de vídeo: sin
  // grabación no hay nombre de fichero, y el lector no llegaba a abrirse.
  const [openedBase, setOpenedBase] = useState(null);

  // Deep link: ?tab=meetings&media=kickoff.mp4&t=847 opens the reader at that
  // moment. This is what the assistant's citations link to.
  const mediaParam = searchParams.get('media');
  const timeParam = searchParams.get('t');

  // Derived rather than mirrored into state: the URL is the source of truth,
  // and syncing it through an effect would cost an extra render on every
  // citation followed.
  const readerMeeting = findMeeting(meetings, openedBase, mediaParam);
  // Only honour ?t= when the reader was opened by the URL; opening from the
  // list should start at the beginning even if a stale t= is still around.
  const readerStartAt = openedBase ? null : parseTime(timeParam);

  const closeReader = useCallback(() => {
    setOpenedBase(null);
    // Drop the deep-link params, or the reader would reopen on refresh.
    if (mediaParam || timeParam) {
      router.replace(`/project/${encodePath(projectPath)}?tab=meetings`, { scroll: false });
    }
  }, [router, projectPath, mediaParam, timeParam]);

  if (!meetings || meetings.length === 0) {
    return (
      <EmptyState
        icon="video"
        title="Sin reuniones"
        description="Coloca ficheros de vídeo (.mp4, .webm, .mkv) o de audio (.mp3, .m4a, .wav) en la carpeta del proyecto y aparecerán aquí, listos para transcribir con Whisper y resumir. Una transcripción sin su grabación también cuenta como reunión."
      />
    );
  }

  if (readerMeeting) {
    return (
      <TranscriptReader
        key={readerMeeting.baseName}
        projectPath={projectPath}
        meeting={readerMeeting}
        startAt={readerStartAt}
        onBack={closeReader}
      />
    );
  }

  return (
    <div className="meetings">
      {meetings.map((meeting) => (
        <MeetingCard
          key={meeting.baseName}
          meeting={meeting}
          projectPath={projectPath}
          onRun={(m, mode) => setModal({ meeting: m, mode })}
          onOpenReader={(m) => setOpenedBase(m.baseName)}
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
