'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../ui/Icon';
import MeetingPoster from './MeetingPoster';
import { useToast } from '@/contexts/ToastContext';
import { findSegmentAt, formatTime, parseTranscript } from '@/lib/transcript';
import { meetingTitle } from '@/lib/meetings';
import { normalize } from '@/lib/knowledge/tokenizer';

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Wrap the matches of `term` in <mark> without risking HTML injection. */
function highlight(text, term) {
  if (!term) return text;

  const haystack = normalize(text);
  const needle = normalize(term);
  if (!needle) return text;

  const parts = [];
  let cursor = 0;

  // Search over the accent-folded copy but slice the original, so accents and
  // casing survive in what the reader actually sees.
  for (;;) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) break;
    if (found > cursor) parts.push(text.slice(cursor, found));
    parts.push(
      <mark key={`${found}-${parts.length}`}>{text.slice(found, found + needle.length)}</mark>
    );
    cursor = found + needle.length;
  }

  if (cursor === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/**
 * A transcript you can read while the recording plays.
 *
 * Click any line to jump there, and the line playing right now is highlighted
 * and scrolled into view. Auto-follow switches itself off the moment the reader
 * scrolls by hand, because fighting the page for control is worse than losing
 * the highlight.
 */
export default function TranscriptReader({ projectPath, meeting, startAt = null, onBack }) {
  const toast = useToast();

  const mediaRef = useRef(null);
  const listRef = useRef(null);
  const followRef = useRef(true);
  const programmaticScroll = useRef(false);

  const [transcript, setTranscript] = useState(null);
  const [plainText, setPlainText] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState('');

  const encodedProject = encodePath(projectPath);
  const mediaSrc = meeting.name
    ? `/api/projects/${encodedProject}/${encodeURIComponent(meeting.name)}?type=file`
    : null;

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  // Load the segments, falling back to the plain-text transcript for
  // recordings transcribed before timestamps existed.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (meeting.segmentsPath) {
          const res = await fetch(
            `/api/projects/${encodePath(meeting.segmentsPath)}?type=file`
          );
          const data = await res.json();
          const parsed = parseTranscript(data.content);
          if (!cancelled && parsed) {
            setTranscript(parsed);
            setLoading(false);
            return;
          }
        }

        if (meeting.transcriptPath) {
          const res = await fetch(
            `/api/projects/${encodePath(meeting.transcriptPath)}?type=file`
          );
          const data = await res.json();
          if (!cancelled) setPlainText(data.content || '');
        }
      } catch (error) {
        if (!cancelled) toast.error(`No se pudo cargar la transcripción: ${error.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meeting.segmentsPath, meeting.transcriptPath, toast]);

  const segments = transcript?.segments;

  const seekTo = useCallback((seconds) => {
    const media = mediaRef.current;
    if (!media) {
      // Sin grabación no hay a dónde saltar, pero marcar la línea pulsada sigue
      // sirviendo para no perder el sitio en una transcripción larga.
      if (segments?.length) setActiveIndex(findSegmentAt(segments, seconds));
      return;
    }
    media.currentTime = seconds;
    // Re-enable following: a deliberate jump means the reader wants to be
    // taken along again.
    setFollow(true);
    media.play().catch(() => {
      /* autoplay blocked — the seek still happened */
    });
  }, [segments]);

  // Honour a deep link like ?t=847 once the media knows its duration.
  const appliedStart = useRef(false);
  useEffect(() => {
    if (appliedStart.current || startAt == null || !mediaRef.current) return;
    const media = mediaRef.current;

    const apply = () => {
      appliedStart.current = true;
      media.currentTime = startAt;
    };

    if (media.readyState >= 1) apply();
    else media.addEventListener('loadedmetadata', apply, { once: true });
  }, [startAt, loading]);

  const syncActiveSegment = useCallback(() => {
    const media = mediaRef.current;
    if (!media || !segments?.length) return;

    const index = findSegmentAt(segments, media.currentTime);
    setActiveIndex((prev) => (prev === index ? prev : index));
  }, [segments]);

  // Arriving from a citation seeks the media before the transcript has
  // finished loading, so the single `timeupdate` that fires finds no segments
  // to match and nothing gets highlighted. Re-sync once they are here — paused
  // media will not fire another event on its own.
  useEffect(() => {
    if (segments?.length) syncActiveSegment();
  }, [segments, syncActiveSegment]);

  // Keep the playing line in view, unless the reader took over scrolling.
  useEffect(() => {
    if (!follow || activeIndex < 0 || !listRef.current) return;

    const list = listRef.current;
    const node = list.querySelector(`[data-segment="${activeIndex}"]`);
    if (!node) return;

    programmaticScroll.current = true;

    // On desktop the list scrolls inside its own panel. `scrollIntoView` would
    // also scroll every scrollable ancestor — including the page — dragging
    // the whole layout up under the top bar. Move the list's own scrollTop
    // instead, and only fall back to `scrollIntoView` where the list is not
    // itself scrollable (the mobile layout, where the page is the scroller).
    const listScrolls = list.scrollHeight > list.clientHeight + 1;

    if (listScrolls) {
      list.scrollTo({
        top: node.offsetTop - list.clientHeight / 2 + node.offsetHeight / 2,
        behavior: 'smooth',
      });
    } else {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    // The scroll this just caused must not be mistaken for the reader
    // scrolling by hand, so ignore scroll events for a moment afterwards.
    const timer = setTimeout(() => {
      programmaticScroll.current = false;
    }, 700);
    return () => clearTimeout(timer);
  }, [activeIndex, follow]);

  const onListScroll = useCallback(() => {
    if (programmaticScroll.current) return;
    if (followRef.current) setFollow(false);
  }, []);

  const matches = useMemo(() => {
    const term = normalize(query.trim());
    if (!term || !segments) return null;
    return segments.reduce((acc, segment, index) => {
      if (normalize(segment.text).includes(term)) acc.push(index);
      return acc;
    }, []);
  }, [query, segments]);

  const visibleSegments = useMemo(() => {
    if (!segments) return [];
    if (!matches) return segments.map((segment, index) => ({ segment, index }));
    return matches.map((index) => ({ segment: segments[index], index }));
  }, [segments, matches]);

  const copyWithTimestamp = async (segment) => {
    try {
      await navigator.clipboard.writeText(`[${formatTime(segment.start)}] ${segment.text}`);
      toast.success('Fragmento copiado con su marca de tiempo');
    } catch {
      toast.error('El navegador no permitió copiar al portapapeles');
    }
  };

  const MediaTag = meeting.kind === 'audio' ? 'audio' : 'video';
  // Sin grabación se puede leer y buscar, pero no saltar a un momento: no hay
  // a dónde saltar.
  const hasMedia = Boolean(meeting.name);

  return (
    <div className="reader">
      <header className="reader-head">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onBack} aria-label="Volver a las reuniones">
          <Icon name="chevron-left" size={17} />
        </button>
        <div className="reader-title">
          <h2 className="truncate" title={meeting.baseName}>{meetingTitle(meeting.baseName)}</h2>
          <span className="reader-meta">
            {transcript
              ? `${transcript.segments.length} fragmentos · ${formatTime(transcript.duration)}`
              : 'Transcripción sin marcas de tiempo'}
          </span>
        </div>
      </header>

      <div className={`reader-body ${meeting.kind === 'audio' ? 'audio' : ''}`}>
        <div className="reader-media">
          {hasMedia ? (
            <MediaTag
              ref={mediaRef}
              controls
              preload="metadata"
              playsInline
              onTimeUpdate={syncActiveSegment}
              onSeeked={syncActiveSegment}
              className={meeting.kind === 'audio' ? 'audio-player' : 'video-player'}
            >
              <source src={mediaSrc} />
              Tu navegador no puede reproducir este fichero.
            </MediaTag>
          ) : (
            <MeetingPoster meeting={meeting} compact />
          )}

          {transcript && (
            <div className="reader-hint">
              <Icon name="info" size={13} />
              <span>
                {hasMedia
                  ? 'Pulsa cualquier línea para saltar a ese momento.'
                  : 'Cada línea lleva el minuto en que se dijo. La grabación no está aquí, así que no hay a dónde saltar.'}
              </span>
            </div>
          )}
        </div>

        <section className="reader-panel">
          <div className="panel-tools">
            <div className="search-wrap" style={{ flex: 1 }}>
              <Icon name="search" size={14} />
              <input
                type="search"
                className="input input-search"
                placeholder="Buscar en la transcripción…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={!transcript}
                aria-label="Buscar en la transcripción"
              />
            </div>

            {transcript && (
              <button
                className={`btn btn-sm ${follow ? 'btn-soft' : 'btn-secondary'}`}
                onClick={() => setFollow((v) => !v)}
                title={follow ? 'Dejar de seguir la reproducción' : 'Seguir la reproducción'}
                aria-pressed={follow}
              >
                <Icon name={follow ? 'target' : 'pin'} size={14} />
                <span className="follow-label">{follow ? 'Siguiendo' : 'Libre'}</span>
              </button>
            )}
          </div>

          {matches && (
            <p className="match-count">
              {matches.length === 0
                ? 'Sin coincidencias.'
                : `${matches.length} fragmento${matches.length === 1 ? '' : 's'} coinciden.`}
            </p>
          )}

          <div className="segment-list" ref={listRef} onScroll={onListScroll}>
            {loading && (
              <div className="segment-skeletons">
                {[92, 78, 96, 64, 88].map((w, i) => (
                  <div key={i} className="skeleton skeleton-text" style={{ width: `${w}%`, height: 34 }} />
                ))}
              </div>
            )}

            {!loading && transcript &&
              visibleSegments.map(({ segment, index }) => (
                <div
                  key={segment.id}
                  data-segment={index}
                  className={`segment ${index === activeIndex ? 'active' : ''}`}
                >
                  <button
                    className="segment-time"
                    onClick={() => seekTo(segment.start)}
                    title={`Saltar a ${formatTime(segment.start)}`}
                  >
                    {formatTime(segment.start)}
                  </button>

                  <button className="segment-text" onClick={() => seekTo(segment.start)}>
                    {segment.speaker && <strong className="segment-speaker">{segment.speaker}: </strong>}
                    {highlight(segment.text, query.trim())}
                  </button>

                  <button
                    className="segment-copy"
                    onClick={() => copyWithTimestamp(segment)}
                    title="Copiar con la marca de tiempo"
                    aria-label="Copiar con la marca de tiempo"
                  >
                    <Icon name="copy" size={13} />
                  </button>
                </div>
              ))}

            {!loading && !transcript && plainText !== null && (
              <>
                <div className="no-timestamps">
                  <Icon name="clock" size={15} />
                  <div>
                    <strong>Transcripción sin marcas de tiempo</strong>
                    <p>
                      Se generó con una versión anterior del script. Vuelve a transcribir la
                      grabación para poder saltar por el texto y que el asistente cite el minuto
                      exacto.
                    </p>
                  </div>
                </div>
                <p className="plain-text">{plainText || 'La transcripción está vacía.'}</p>
              </>
            )}

            {!loading && !transcript && plainText === null && (
              <p className="plain-text text-subtle">Esta grabación todavía no tiene transcripción.</p>
            )}
          </div>
        </section>
      </div>

      <style jsx>{`
        .reader {
          display: flex;
          flex-direction: column;
          gap: var(--sp-4);
        }

        .reader-head {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
        }

        .reader-title {
          min-width: 0;
        }

        .reader-title h2 {
          font-size: var(--fs-lg);
          font-weight: 650;
        }

        .reader-meta {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
        }

        .reader-body {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
          gap: var(--sp-4);
          align-items: start;
        }

        .reader-body.audio {
          grid-template-columns: 1fr;
        }

        .reader-media {
          position: sticky;
          top: calc(var(--topbar-h) + var(--sp-4));
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
        }

        .video-player {
          width: 100%;
          aspect-ratio: 16 / 9;
          border-radius: var(--r-lg);
          background: #000;
          border: 1px solid var(--border);
        }

        .audio-player {
          width: 100%;
        }

        .reader-hint {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          font-size: var(--fs-xs);
          color: var(--text-subtle);
        }

        .reader-panel {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          background: var(--surface);
          padding: var(--sp-3);
          max-height: calc(100dvh - var(--topbar-h) - var(--sp-10));
        }

        .panel-tools {
          display: flex;
          gap: var(--sp-2);
        }

        .match-count {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
          padding-inline: var(--sp-1);
        }

        .segment-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1px;
          scroll-padding-block: 40%;
        }

        .segment-skeletons {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          padding: var(--sp-2);
        }

        .segment {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: start;
          gap: var(--sp-2);
          padding: var(--sp-2);
          border-radius: var(--r-md);
          border-left: 2px solid transparent;
          transition: background var(--dur-fast) var(--ease),
            border-color var(--dur-fast) var(--ease);
        }

        .segment:hover {
          background: var(--surface-2);
        }

        .segment.active {
          background: var(--accent-soft);
          border-left-color: var(--accent);
        }

        .segment-time {
          font-family: var(--font-mono);
          font-size: var(--fs-2xs);
          font-variant-numeric: tabular-nums;
          color: var(--text-subtle);
          padding: 2px var(--sp-1);
          border-radius: var(--r-xs);
          flex-shrink: 0;
          margin-top: 1px;
        }

        .segment-time:hover {
          background: var(--accent);
          color: var(--accent-contrast);
        }

        .segment.active .segment-time {
          color: var(--accent);
          font-weight: 700;
        }

        .segment-text {
          text-align: left;
          font-size: var(--fs-sm);
          line-height: 1.65;
          color: var(--text-muted);
          min-width: 0;
        }

        .segment.active .segment-text {
          color: var(--text);
        }

        .segment-speaker {
          color: var(--accent);
          font-weight: 650;
        }

        .segment-copy {
          opacity: 0;
          padding: 3px;
          border-radius: var(--r-xs);
          color: var(--text-subtle);
          flex-shrink: 0;
          transition: opacity var(--dur-fast) var(--ease);
        }

        .segment:hover .segment-copy,
        .segment:focus-within .segment-copy {
          opacity: 1;
        }

        .segment-copy:hover {
          background: var(--surface-hover);
          color: var(--text);
        }

        .no-timestamps {
          display: flex;
          gap: var(--sp-3);
          padding: var(--sp-3);
          margin-bottom: var(--sp-3);
          border-radius: var(--r-md);
          background: var(--warning-soft);
          color: var(--text);
        }

        .no-timestamps :global(svg) {
          color: var(--warning);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .no-timestamps strong {
          font-size: var(--fs-sm);
        }

        .no-timestamps p {
          font-size: var(--fs-xs);
          color: var(--text-muted);
          margin-top: 2px;
        }

        .plain-text {
          white-space: pre-wrap;
          font-size: var(--fs-sm);
          line-height: 1.75;
          color: var(--text-muted);
          padding: var(--sp-2);
        }

        @media (max-width: 899px) {
          .reader-body {
            grid-template-columns: 1fr;
          }
          .reader-media {
            position: sticky;
            top: var(--topbar-h);
            z-index: 5;
            background: var(--bg);
            padding-block: var(--sp-2);
          }
          .reader-panel {
            max-height: none;
          }
          .segment-list {
            overflow: visible;
          }
          .segment-copy {
            opacity: 1;
          }
          .follow-label {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
