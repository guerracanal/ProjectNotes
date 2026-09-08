'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './ui/Icon';
import EmptyState from './ui/EmptyState';
import ConfirmDialog from './ui/ConfirmDialog';
import { useToast } from '@/contexts/ToastContext';
import {
  formatTimestamp,
  generateNoteFilename,
  parseTasks,
  serializeTasks,
} from '@/lib/task-parser';

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'done', label: 'Completadas' },
];

export default function TaskEditor({ projectPath, initialContent, onSaved }) {
  const router = useRouter();
  const toast = useToast();

  const [tasks, setTasks] = useState(() => parseTasks(initialContent));
  const [newTaskText, setNewTaskText] = useState('');
  const [filter, setFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  /**
   * El fichero tal como está en disco ahora mismo.
   *
   * `serializeTasks` reconstruye tasks.md entero sobre esta base, así que tiene
   * que seguir al día. Es estado y no una ref porque el render lo compara con
   * lo que manda el servidor, y `persist` lo lee desde un manejador, donde el
   * valor ya es el del último render.
   */
  const [onDisk, setOnDisk] = useState(initialContent);

  /** Las escrituras van en fila: dos cambios seguidos no pueden cruzarse. */
  const queue = useRef(Promise.resolve());
  const inFlight = useRef(0);
  const writeToken = useRef(0);

  /**
   * Re-sembrar cuando el servidor manda contenido nuevo (p. ej. tras sincronizar
   * con Drive).
   *
   * Ajustar el estado durante el render, y no en un efecto, es lo que recomienda
   * React para reaccionar a un cambio de prop: se corrige antes de pintar, sin
   * el render de más que provoca un efecto.
   *
   * El eco de nuestra propia escritura se ignora: `router.refresh()` vuelve con
   * el fichero que acabamos de guardar, y re-sembrar ahí pisaría un cambio hecho
   * mientras la petición viajaba.
   */
  const [seenContent, setSeenContent] = useState(initialContent);
  if (seenContent !== initialContent) {
    setSeenContent(initialContent);
    if (initialContent !== onDisk) {
      setOnDisk(initialContent);
      setTasks(parseTasks(initialContent));
      setDirty(false);
    }
  }

  // Guard against losing edits to a stray tab close.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /**
   * Escribe la lista en disco.
   *
   * Cada cambio se guarda solo: añadir una tarea, marcarla o borrarla no deja
   * nada pendiente de un botón. `dirty` pasa a significar lo único que puede
   * dejar trabajo sin guardar —que una escritura haya fallado—, y entonces el
   * botón sirve de reintento.
   */
  const persist = (next, { announce = false } = {}) => {
    // La base es el fichero en disco, no el estado anterior: `serializeTasks`
    // reconstruye el markdown entero sobre ella.
    const content = serializeTasks(next, onDisk);
    const token = (writeToken.current += 1);

    inFlight.current += 1;
    setSaving(true);

    queue.current = queue.current
      .then(async () => {
        const res = await fetch(
          `/api/projects/${projectPath.split('/').map(encodeURIComponent).join('/')}/tasks.md`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          }
        );
        if (!res.ok) throw new Error((await res.json()).error || `Error ${res.status}`);

        // Solo la última escritura pedida actualiza el estado. Si mientras
        // viajaba se pidió otra, esa ya calculó su contenido sobre esta misma
        // base y es la que manda: tocar aquí revertiría su cambio en pantalla.
        if (token !== writeToken.current) return;

        // Re-parsear lo que acabamos de escribir para que cada tarea lleve el
        // número de línea que ocupa en el fichero. `serializeTasks` parchea in
        // situ las que lo tienen y reescribe al final las que no; con esto la
        // siguiente escritura es un cambio de línea y no un borrar y reañadir.
        setOnDisk(content);
        setTasks(parseTasks(content));
        setDirty(false);
        if (announce) toast.success('Tareas guardadas');
        onSaved?.();
        router.refresh();
      })
      .catch((error) => {
        setDirty(true);
        toast.error(`No se pudieron guardar las tareas: ${error.message}`);
      })
      .finally(() => {
        inFlight.current -= 1;
        if (inFlight.current === 0) setSaving(false);
      });

    return queue.current;
  };

  /** Aplica un cambio a la lista y lo guarda. */
  const mutate = (updater) => {
    setTasks((list) => {
      const next = updater(list);
      persist(next);
      return next;
    });
  };

  const toggle = (id) =>
    mutate((list) => list.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));

  const remove = (id) => {
    mutate((list) => list.filter((t) => t.id !== id));
    setConfirmDelete(null);
  };

  const add = () => {
    const text = newTaskText.trim();
    if (!text) return;
    mutate((list) => [
      ...list,
      {
        id: `new-${Date.now()}`,
        text,
        completed: false,
        timestamp: formatTimestamp(new Date()),
        line: undefined,
      },
    ]);
    setNewTaskText('');
  };

  /** Reintento manual: solo hace falta si una escritura automática falló. */
  const save = () => persist(tasks, { announce: true });

  const openNote = async (task) => {
    const filename = generateNoteFilename(task);
    const encodedProject = projectPath.split('/').map(encodeURIComponent).join('/');

    try {
      const res = await fetch(
        `/api/projects/${encodedProject}/${encodeURIComponent(filename)}?type=file`
      );
      if (!res.ok) {
        await fetch(`/api/projects/${encodedProject}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_file',
            name: filename,
            content: `# ${task.text}\n\nCreado: ${task.timestamp || formatTimestamp(new Date())}\n\n---\n\n`,
          }),
        });
      }
      router.push(`/project/${encodedProject}?tab=notes&file=${encodeURIComponent(filename)}`);
    } catch (error) {
      toast.error(`No se pudo abrir la nota: ${error.message}`);
    }
  };

  const visible = useMemo(() => {
    if (filter === 'pending') return tasks.filter((t) => !t.completed);
    if (filter === 'done') return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, filter]);

  const pending = tasks.filter((t) => !t.completed).length;
  const progress = tasks.length ? Math.round(((tasks.length - pending) / tasks.length) * 100) : 0;

  return (
    <div className="task-editor">
      <header className="te-head">
        <div className="te-summary">
          <div className="te-counts">
            <strong>{pending}</strong> pendientes
            <span className="text-subtle"> · {tasks.length} en total</span>
          </div>
          <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="te-actions">
          <div className="filter-switch" role="group" aria-label="Filtrar tareas">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={filter === f.id ? 'active' : ''}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/*
            Ya no es el paso que guarda: los cambios se escriben solos. Queda
            como estado —para ver que se ha guardado— y como reintento cuando
            una escritura falla, que es lo único que deja `dirty` a true.
          */}
          <button
            className={dirty ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={save}
            disabled={saving || !dirty}
            title={dirty ? 'La última escritura falló. Reintentar.' : 'Los cambios se guardan solos'}
          >
            {saving ? <span className="spinner" /> : <Icon name={dirty ? 'refresh' : 'check'} size={15} />}
            {saving ? 'Guardando…' : dirty ? 'Reintentar' : 'Guardado'}
          </button>
        </div>
      </header>

      <div className="add-task">
        <input
          className="input"
          placeholder="Añadir una tarea y pulsar Intro…"
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          aria-label="Nueva tarea"
        />
        <button className="btn btn-soft" onClick={add} disabled={!newTaskText.trim()}>
          <Icon name="plus" size={15} />
          Añadir
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={filter === 'done' ? 'clock' : 'check-circle'}
          title={
            tasks.length === 0
              ? 'Sin tareas todavía'
              : filter === 'pending'
                ? 'Nada pendiente'
                : 'Nada completado aún'
          }
          description={
            tasks.length === 0
              ? 'Escribe arriba tu primera tarea. Se guardará como una lista markdown en tasks.md.'
              : 'Cambia el filtro para ver el resto.'
          }
        />
      ) : (
        <ul className="task-list">
          {visible.map((task) => (
            <li key={task.id} className={`task-item ${task.completed ? 'done' : ''}`}>
              <button
                className="task-check"
                onClick={() => toggle(task.id)}
                role="checkbox"
                aria-checked={task.completed}
                aria-label={task.completed ? 'Marcar como pendiente' : 'Marcar como completada'}
              >
                {task.completed && <Icon name="check" size={13} />}
              </button>

              <div className="task-body">
                <span className="task-text">{task.text}</span>
                {task.timestamp && (
                  <span className="task-meta">
                    <Icon name="clock" size={11} />
                    {task.timestamp}
                  </span>
                )}
              </div>

              <div className="task-tools">
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => openNote(task)}
                  title="Abrir nota de esta tarea"
                  aria-label="Abrir nota de esta tarea"
                >
                  <Icon name="file-text" size={15} />
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm danger"
                  onClick={() => setConfirmDelete(task)}
                  title="Eliminar tarea"
                  aria-label="Eliminar tarea"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => remove(confirmDelete.id)}
        title="Eliminar tarea"
        message={`«${confirmDelete?.text}» se borrará de tasks.md. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
      />

      <style jsx>{`
        .task-editor {
          display: flex;
          flex-direction: column;
          gap: var(--sp-4);
        }

        .te-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-4);
          flex-wrap: wrap;
        }

        .te-summary {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          min-width: 180px;
          flex: 1;
        }

        .te-counts {
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }

        .te-counts strong {
          font-size: var(--fs-lg);
          color: var(--text);
        }

        .progress {
          height: 5px;
          border-radius: var(--r-full);
          background: var(--surface-3);
          overflow: hidden;
        }

        .progress span {
          display: block;
          height: 100%;
          background: var(--success);
          transition: width var(--dur-slow) var(--ease-out);
        }

        .te-actions {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          flex-wrap: wrap;
        }

        .filter-switch {
          display: flex;
          gap: 2px;
          padding: 2px;
          border-radius: var(--r-md);
          background: var(--surface-3);
        }

        .filter-switch button {
          padding: 5px var(--sp-3);
          border-radius: var(--r-sm);
          font-size: var(--fs-xs);
          font-weight: 550;
          color: var(--text-subtle);
          transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }

        .filter-switch button.active {
          background: var(--surface);
          color: var(--accent);
          box-shadow: var(--shadow-xs);
        }

        .add-task {
          display: flex;
          gap: var(--sp-2);
        }

        .task-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: var(--sp-1);
        }

        .task-item {
          display: flex;
          align-items: flex-start;
          gap: var(--sp-3);
          padding: var(--sp-3);
          border: 1px solid transparent;
          border-radius: var(--r-md);
          background: var(--surface-2);
          transition: border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
        }

        .task-item:hover {
          border-color: var(--border);
          background: var(--surface-3);
        }

        .task-check {
          display: grid;
          place-items: center;
          width: 20px;
          height: 20px;
          margin-top: 1px;
          flex-shrink: 0;
          border: 1.5px solid var(--border-strong);
          border-radius: var(--r-xs);
          color: transparent;
          transition: all var(--dur-fast) var(--ease);
        }

        .task-check:hover {
          border-color: var(--accent);
        }

        .task-item.done .task-check {
          background: var(--success);
          border-color: var(--success);
          color: #fff;
        }

        .task-body {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
          min-width: 0;
        }

        .task-text {
          font-size: var(--fs-sm);
          color: var(--text);
          word-break: break-word;
        }

        .task-item.done .task-text {
          text-decoration: line-through;
          color: var(--text-subtle);
        }

        .task-meta {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: var(--fs-2xs);
          color: var(--text-subtle);
        }

        .task-tools {
          display: flex;
          gap: 2px;
          flex-shrink: 0;
          opacity: 0.55;
          transition: opacity var(--dur-fast) var(--ease);
        }

        .task-item:hover .task-tools,
        .task-item:focus-within .task-tools {
          opacity: 1;
        }

        .task-tools :global(.danger:hover) {
          color: var(--danger);
          background: var(--danger-soft);
        }

        @media (max-width: 640px) {
          .te-actions {
            width: 100%;
            justify-content: space-between;
          }
          .task-tools {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
