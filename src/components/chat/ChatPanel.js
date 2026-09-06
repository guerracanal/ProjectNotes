'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from '../ui/Icon';
import SourceList from './SourceList';
import { useSettings } from '@/contexts/SettingsContext';

const SUGGESTIONS = [
  '¿Qué tareas tengo pendientes y en qué proyectos?',
  'Resume las decisiones de la última reunión.',
  '¿Qué compromisos asumí en las transcripciones?',
  'Hazme un acta con los puntos clave y los próximos pasos.',
];

const STORAGE_KEY = 'projectnotes:chat-history';

function currentProjectFrom(pathname) {
  if (!pathname?.startsWith('/project/')) return null;
  return decodeURIComponent(pathname.replace('/project/', ''));
}

/**
 * Assistant surface: a right-side drawer on desktop, a full-height sheet on
 * phones. Answers stream token by token over SSE; the sources arrive first so
 * the citation chips are on screen before the text is.
 */
export default function ChatPanel({ isOpen, onClose }) {
  const pathname = usePathname();
  const { settings, updateSettings } = useSettings();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const projectPath = currentProjectFrom(pathname);
  const scopeToProject = settings.assistantScope === 'project' && Boolean(projectPath);

  // Restore the conversation across reloads — a chat you can't get back to is
  // a chat you stop trusting.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* quota or private mode — the chat still works in memory */
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 60);
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && !streaming && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, streaming]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const send = useCallback(
    async (text) => {
      const question = (text ?? input).trim();
      if (!question || streaming) return;

      setInput('');
      setError(null);

      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [
        ...prev,
        { id: `u${Date.now()}`, role: 'user', content: question },
        { id: `a${Date.now()}`, role: 'assistant', content: '', sources: [], pending: true },
      ]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: question,
            history,
            scope: scopeToProject ? projectPath : null,
            topK: settings.assistantTopK,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || data.error || `Error ${res.status}`);
        }

        // Parse the SSE stream by hand: the browser's EventSource can't POST.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const patchLast = (patch) =>
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            next[next.length - 1] = typeof patch === 'function' ? patch(last) : { ...last, ...patch };
            return next;
          });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            const eventLine = frame.split('\n').find((l) => l.startsWith('event: '));
            const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
            if (!eventLine || !dataLine) continue;

            const event = eventLine.slice(7).trim();
            let payload;
            try {
              payload = JSON.parse(dataLine.slice(6));
            } catch {
              continue;
            }

            if (event === 'sources') {
              patchLast({ sources: payload.sources, semantic: payload.semantic });
            } else if (event === 'delta') {
              patchLast((last) => ({ ...last, content: last.content + payload.text, pending: false }));
            } else if (event === 'error') {
              setError(payload.message);
              patchLast({ pending: false });
            } else if (event === 'done') {
              patchLast({ pending: false, usage: payload.usage });
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], pending: false };
            return next;
          });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [input, streaming, messages, scopeToProject, projectPath, settings.assistantTopK]
  );

  const clear = () => {
    stop();
    setMessages([]);
    setError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const scopeLabel = useMemo(
    () => (scopeToProject ? projectPath.split('/').pop() : 'Todos los proyectos'),
    [scopeToProject, projectPath]
  );

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="chat-scrim" onClick={() => !streaming && onClose()} aria-hidden="true" />

      <aside className="chat-panel" role="dialog" aria-modal="true" aria-label="Asistente de ProjectNotes">
        <header className="chat-head">
          <div className="chat-title">
            <span className="chat-avatar">
              <Icon name="sparkles" size={16} />
            </span>
            <div>
              <strong>Asistente</strong>
              <span className="chat-sub">Responde con tus notas y transcripciones</span>
            </div>
          </div>
          <div className="row">
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={clear}
              disabled={!messages.length}
              title="Nueva conversación"
              aria-label="Nueva conversación"
            >
              <Icon name="refresh" size={15} />
            </button>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Cerrar">
              <Icon name="x" size={16} />
            </button>
          </div>
        </header>

        <div className="chat-scope">
          <Icon name="target" size={13} />
          <span className="truncate">Ámbito: {scopeLabel}</span>
          {projectPath && (
            <button
              className="btn btn-ghost btn-sm scope-btn"
              onClick={() =>
                updateSettings({ assistantScope: scopeToProject ? 'all' : 'project' })
              }
            >
              {scopeToProject ? 'Ampliar a todo' : 'Limitar a este proyecto'}
            </button>
          )}
        </div>

        <div className="chat-body" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="chat-welcome">
              <span className="welcome-mark">
                <Icon name="bot" size={26} />
              </span>
              <h4>Pregúntame lo que quieras sobre tus proyectos</h4>
              <p>
                Leo todos los ficheros markdown, notas de texto y transcripciones de reuniones que
                tengas guardados, y respondo citando la fuente.
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`bubble-row ${message.role}`}>
              {message.role === 'assistant' && (
                <span className="bubble-avatar">
                  <Icon name="sparkles" size={14} />
                </span>
              )}
              <div className="bubble">
                {message.role === 'assistant' ? (
                  <>
                    {message.pending && !message.content ? (
                      <span className="thinking">
                        <span /><span /><span />
                      </span>
                    ) : (
                      <div className="markdown markdown-compact">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      </div>
                    )}
                    {message.sources?.length > 0 && <SourceList sources={message.sources} />}
                  </>
                ) : (
                  message.content
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="chat-error">
              <Icon name="alert-circle" size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <form
          className="chat-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={1}
            value={input}
            placeholder="Escribe tu pregunta…"
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            aria-label="Mensaje para el asistente"
          />
          {streaming ? (
            <button type="button" className="btn btn-secondary btn-icon" onClick={stop} title="Detener">
              <Icon name="square" size={15} />
            </button>
          ) : (
            <button type="submit" className="btn btn-primary btn-icon" disabled={!input.trim()} title="Enviar">
              <Icon name="send" size={16} />
            </button>
          )}
        </form>
      </aside>

      <style jsx>{`
        .chat-scrim {
          position: fixed;
          inset: 0;
          z-index: 3000;
          background: var(--overlay);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
          animation: fade-in var(--dur) var(--ease-out);
        }

        .chat-panel {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          z-index: 3001;
          display: flex;
          flex-direction: column;
          width: min(460px, 100vw);
          background: var(--surface);
          border-left: 1px solid var(--border);
          box-shadow: var(--shadow-lg);
          padding-top: var(--safe-t);
          padding-bottom: var(--safe-b);
          animation: slide-in var(--dur-slow) var(--ease-out);
        }

        @keyframes slide-in {
          from { transform: translateX(24px); opacity: 0; }
          to { transform: none; opacity: 1; }
        }

        .chat-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-3);
          padding: var(--sp-4);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .chat-title {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          min-width: 0;
        }

        .chat-title strong {
          display: block;
          font-size: var(--fs-md);
        }

        .chat-sub {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
        }

        .chat-avatar {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border-radius: var(--r-md);
          background: linear-gradient(135deg, var(--brand-500), var(--brand-700));
          color: #fff;
          flex-shrink: 0;
        }

        .chat-scope {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-2) var(--sp-4);
          background: var(--surface-2);
          border-bottom: 1px solid var(--border);
          font-size: var(--fs-xs);
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .chat-scope > span:first-of-type {
          flex: 1;
        }

        .scope-btn {
          flex-shrink: 0;
          color: var(--accent);
        }

        .chat-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: var(--sp-4);
          display: flex;
          flex-direction: column;
          gap: var(--sp-4);
        }

        .chat-welcome {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--sp-3);
          text-align: center;
          padding: var(--sp-6) var(--sp-2);
        }

        .welcome-mark {
          display: grid;
          place-items: center;
          width: 54px;
          height: 54px;
          border-radius: var(--r-lg);
          background: var(--accent-soft);
          color: var(--accent);
        }

        .chat-welcome h4 {
          font-size: var(--fs-md);
        }

        .chat-welcome p {
          font-size: var(--fs-sm);
          color: var(--text-muted);
          max-width: 40ch;
        }

        .suggestions {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          width: 100%;
          margin-top: var(--sp-2);
        }

        .suggestion {
          padding: var(--sp-2) var(--sp-3);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          background: var(--surface-2);
          font-size: var(--fs-sm);
          color: var(--text-muted);
          text-align: left;
          transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }

        .suggestion:hover {
          border-color: var(--accent);
          color: var(--accent);
        }

        .bubble-row {
          display: flex;
          gap: var(--sp-2);
          align-items: flex-start;
          animation: fade-in var(--dur) var(--ease-out);
        }

        .bubble-row.user {
          justify-content: flex-end;
        }

        .bubble-avatar {
          display: grid;
          place-items: center;
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: var(--accent-soft);
          color: var(--accent);
          flex-shrink: 0;
          margin-top: 2px;
        }

        .bubble {
          max-width: 88%;
          padding: var(--sp-3);
          border-radius: var(--r-lg);
          font-size: var(--fs-sm);
          line-height: var(--lh-normal);
        }

        .bubble-row.user .bubble {
          background: var(--accent);
          color: var(--accent-contrast);
          border-bottom-right-radius: var(--r-xs);
          white-space: pre-wrap;
        }

        .bubble-row.assistant .bubble {
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-bottom-left-radius: var(--r-xs);
          color: var(--text);
          max-width: 100%;
          flex: 1;
          min-width: 0;
        }

        .thinking {
          display: inline-flex;
          gap: 4px;
          padding: 4px 0;
        }

        .thinking span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-subtle);
          animation: pulse-dot 1.2s infinite;
        }

        .thinking span:nth-child(2) { animation-delay: 0.2s; }
        .thinking span:nth-child(3) { animation-delay: 0.4s; }

        .chat-error {
          display: flex;
          align-items: flex-start;
          gap: var(--sp-2);
          padding: var(--sp-3);
          border-radius: var(--r-md);
          background: var(--danger-soft);
          color: var(--danger);
          font-size: var(--fs-sm);
        }

        .chat-composer {
          display: flex;
          align-items: flex-end;
          gap: var(--sp-2);
          padding: var(--sp-3) var(--sp-4);
          border-top: 1px solid var(--border);
          background: var(--surface-2);
          flex-shrink: 0;
        }

        .chat-input {
          flex: 1;
          min-height: 38px;
          max-height: 160px;
          padding: var(--sp-2) var(--sp-3);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          background: var(--surface);
          color: var(--text);
          font-size: var(--fs-sm);
          line-height: 1.5;
          resize: none;
          overflow-y: auto;
        }

        .chat-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--focus-ring);
        }

        @media (max-width: 640px) {
          .chat-panel {
            width: 100vw;
            border-left: none;
          }
        }
      `}</style>
    </>,
    document.body
  );
}
