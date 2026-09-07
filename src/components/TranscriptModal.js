'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from './ui/Modal';
import Icon from './ui/Icon';

const POLL_MS = 2000;

const STATUS_LABEL = {
  idle: 'Sin iniciar',
  pending: 'En cola',
  running: 'Procesando',
  completed: 'Completado',
  error: 'Error',
};

function StatusPill({ status }) {
  const tone =
    status === 'completed' ? 'success' : status === 'error' ? 'danger' : status === 'idle' ? '' : 'warning';
  return (
    <span className={`badge ${tone ? `badge-${tone}` : ''}`}>
      {status === 'running' || status === 'pending' ? (
        <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
      ) : (
        <Icon
          name={status === 'completed' ? 'check-circle' : status === 'error' ? 'alert-circle' : 'clock'}
          size={11}
        />
      )}
      {STATUS_LABEL[status] || status}
    </span>
  );
}

/**
 * Drives the two Python pipelines (Whisper transcription, Gemini summary) and
 * streams their console output back into the UI.
 *
 * Both jobs are polled rather than pushed: the scripts are long-running child
 * processes, and polling keeps the server free of per-client connections.
 */
export default function TranscriptModal({ meeting, projectPath, mode = 'transcript', onClose }) {
  const router = useRouter();
  const logsEndRef = useRef(null);
  const timersRef = useRef([]);

  const [transcript, setTranscript] = useState({ status: 'idle', logs: '' });
  const [summary, setSummary] = useState({ status: 'idle', logs: '' });
  const [error, setError] = useState(null);

  // Clear every pending poll when the dialog unmounts, so a closed modal does
  // not keep hitting the API.
  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    },
    []
  );

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcript.logs, summary.logs]);

  const poll = useCallback(
    (endpoint, jobId, setState, doneMessage) => {
      const tick = async () => {
        try {
          const res = await fetch(`${endpoint}?jobId=${encodeURIComponent(jobId)}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

          const logs = `${data.stdout || ''}${data.stderr || ''}`;
          setState({ status: data.status, logs });

          if (data.status === 'completed') {
            setState({ status: 'completed', logs: `${logs}\n✅ ${doneMessage}` });
            router.refresh();
          } else if (data.status === 'error') {
            setError(data.error || 'El proceso falló');
            setState({ status: 'error', logs: `${logs}\n❌ ${data.error || 'El proceso falló'}` });
          } else {
            timersRef.current.push(setTimeout(tick, POLL_MS));
          }
        } catch (e) {
          setError(e.message);
          setState((prev) => ({ ...prev, status: 'error' }));
        }
      };
      tick();
    },
    [router]
  );

  // Re-running over an existing transcript is how a recording gains
  // timestamps, and the script refuses to overwrite unless told to.
  const needsForce = Boolean(meeting.transcriptPath && !meeting.segmentsPath);

  const startTranscription = useCallback(async () => {
    setError(null);
    setTranscript({ status: 'pending', logs: 'Iniciando transcripción…\n' });
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoPath: meeting.path, force: needsForce }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la transcripción');
      poll('/api/transcribe', data.jobId, setTranscript, 'Transcripción completada');
    } catch (e) {
      setError(e.message);
      setTranscript({ status: 'error', logs: e.message });
    }
  }, [meeting.path, needsForce, poll]);

  const startSummary = useCallback(async () => {
    setError(null);
    setSummary({ status: 'pending', logs: 'Iniciando generación del resumen…\n' });
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptPath: `${projectPath}/${meeting.baseName}_transcripcion.txt`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar el resumen');
      poll('/api/summarize', data.jobId, setSummary, 'Resumen generado');
    } catch (e) {
      setError(e.message);
      setSummary({ status: 'error', logs: e.message });
    }
  }, [projectPath, meeting.baseName, poll]);

  // When opened from the "generate summary" action, start immediately.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (mode === 'summary' && !autoStarted.current) {
      autoStarted.current = true;
      startSummary();
    }
  }, [mode, startSummary]);

  const busy =
    ['pending', 'running'].includes(transcript.status) || ['pending', 'running'].includes(summary.status);

  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      title={mode === 'summary' ? 'Generar resumen' : needsForce ? 'Añadir marcas de tiempo' : 'Transcribir grabación'}
      icon={mode === 'summary' ? 'sparkles' : 'mic'}
      size="lg"
      closeOnOverlay={!busy}
      footer={
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
          {busy ? 'Procesando…' : 'Cerrar'}
        </button>
      }
    >
      <div className="tm-meta">
        <Icon name="video" size={15} />
        <span className="truncate">{meeting.baseName}</span>
      </div>

      {error && (
        <div className="tm-error">
          <Icon name="alert-circle" size={16} />
          <span>{error}</span>
        </div>
      )}

      <section className="tm-step">
        <header>
          <span className="step-index">1</span>
          <h4>Transcripción (Whisper)</h4>
          <StatusPill status={transcript.status} />
        </header>

        {transcript.status === 'idle' && (
          <>
            <p className="tm-hint">
              {needsForce
                ? 'Esta grabación ya tiene transcripción, pero se hizo sin marcas de tiempo. Al volver a transcribirla obtendrás una transcripción navegable y el asistente podrá citar el minuto exacto.'
                : 'Extrae el audio con ffmpeg y lo transcribe localmente con Whisper, guardando las marcas de tiempo de cada fragmento. En grabaciones largas puede tardar varios minutos.'}
            </p>
            {meeting.segmentsPath ? (
              <p className="tm-hint">Ya tiene transcripción con marcas de tiempo.</p>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={startTranscription}>
                <Icon name={needsForce ? 'clock' : 'mic'} size={14} />
                {needsForce ? 'Añadir marcas de tiempo' : 'Iniciar transcripción'}
              </button>
            )}
          </>
        )}

        {transcript.logs && <pre className="tm-logs">{transcript.logs}</pre>}
      </section>

      <section className="tm-step">
        <header>
          <span className="step-index">2</span>
          <h4>Resumen (Gemini)</h4>
          <StatusPill status={summary.status} />
        </header>

        {summary.status === 'idle' && (
          <>
            <p className="tm-hint">
              Envía la transcripción a Gemini y guarda un resumen con los puntos clave junto al
              vídeo. Requiere <code>GEMINI_API_KEY</code> en tu <code>.env</code>.
            </p>
            <button
              className="btn btn-soft btn-sm"
              onClick={startSummary}
              disabled={!meeting.transcriptPath && transcript.status !== 'completed'}
            >
              <Icon name="sparkles" size={14} />
              Generar resumen
            </button>
          </>
        )}

        {summary.logs && <pre className="tm-logs">{summary.logs}</pre>}
      </section>

      <div ref={logsEndRef} />

      <style jsx>{`
        .tm-meta {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-2) var(--sp-3);
          border-radius: var(--r-md);
          background: var(--surface-2);
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }

        .tm-error {
          display: flex;
          align-items: flex-start;
          gap: var(--sp-2);
          padding: var(--sp-3);
          border-radius: var(--r-md);
          background: var(--danger-soft);
          color: var(--danger);
          font-size: var(--fs-sm);
        }

        .tm-step {
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
          padding: var(--sp-4);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
        }

        .tm-step header {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
        }

        .tm-step h4 {
          flex: 1;
          font-size: var(--fs-sm);
        }

        .step-index {
          display: grid;
          place-items: center;
          width: 22px;
          height: 22px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--accent-soft);
          color: var(--accent);
          font-size: var(--fs-2xs);
          font-weight: 700;
        }

        .tm-hint {
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }

        .tm-logs {
          max-height: 220px;
          overflow: auto;
          padding: var(--sp-3);
          border-radius: var(--r-sm);
          background: var(--surface-3);
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--text-muted);
        }
      `}</style>
    </Modal>
  );
}
