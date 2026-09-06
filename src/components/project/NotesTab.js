'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from '../ui/Icon';
import Modal from '../ui/Modal';
import EmptyState from '../ui/EmptyState';
import ConfirmDialog from '../ui/ConfirmDialog';
import MarkdownToolbar from '../MarkdownToolbar';
import { useToast } from '@/contexts/ToastContext';
import { useSettings } from '@/contexts/SettingsContext';
import { iconForFile, isTranscriptName } from '@/lib/file-kinds';

const HIDDEN_FILES = new Set(['documents.md']);

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Two-pane note browser: the file list on the left, an editor / preview on the
 * right. On phones the list and the editor swap places instead of squeezing
 * both into 380px.
 */
export default function NotesTab({ projectPath, files }) {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const { settings, updateSettings } = useSettings();

  const [activeNote, setActiveNote] = useState(null);
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loadingNote, setLoadingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState('preview');
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mobilePane, setMobilePane] = useState('list');

  const textareaRef = useRef(null);
  const showTranscripts = settings.showTranscriptsInNotes;

  const notes = useMemo(() => {
    const list = files.filter((f) => {
      if (!/\.(md|txt|markdown)$/i.test(f.name)) return false;
      if (HIDDEN_FILES.has(f.name)) return false;
      if (isTranscriptName(f.name)) return showTranscripts;
      return true;
    });

    const term = filter.trim().toLowerCase();
    const filtered = term ? list.filter((f) => f.name.toLowerCase().includes(term)) : list;

    // Pin the three structural files to the top; everything else newest first.
    const pinned = ['description.md', 'tasks.md', 'links.md'];
    return filtered.sort((a, b) => {
      const ap = pinned.indexOf(a.name);
      const bp = pinned.indexOf(b.name);
      if (ap !== -1 || bp !== -1) {
        return (ap === -1 ? 99 : ap) - (bp === -1 ? 99 : bp);
      }
      return new Date(b.mtime) - new Date(a.mtime);
    });
  }, [files, showTranscripts, filter]);

  const openNote = useCallback(
    async (note) => {
      setActiveNote(note);
      setMobilePane('editor');
      setLoadingNote(true);
      setMode('preview');
      try {
        const res = await fetch(
          `/api/projects/${encodePath(projectPath)}/${encodeURIComponent(note.name)}?type=file`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
        setContent(data.content ?? '');
        setSavedContent(data.content ?? '');
      } catch (error) {
        toast.error(`No se pudo abrir «${note.name}»: ${error.message}`);
        setContent('');
        setSavedContent('');
      } finally {
        setLoadingNote(false);
      }
    },
    [projectPath, toast]
  );

  // Deep link: /project/x?tab=notes&file=foo.md opens that file directly.
  useEffect(() => {
    const wanted = searchParams.get('file');
    if (!wanted || activeNote) return;
    const match = files.find((f) => f.name === wanted);
    if (match) openNote(match);
  }, [searchParams, files, activeNote, openNote]);

  const dirty = content !== savedContent;

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = useCallback(async () => {
    if (!activeNote) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/projects/${encodePath(projectPath)}/${encodeURIComponent(activeNote.name)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      );
      if (!res.ok) throw new Error((await res.json()).error || `Error ${res.status}`);
      setSavedContent(content);
      toast.success(`«${activeNote.name}» guardado`);
      router.refresh();
    } catch (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }, [activeNote, projectPath, content, toast, router]);

  // ⌘S / Ctrl+S saves, as in any editor.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, saving, save]);

  const create = async () => {
    let name = newName.trim();
    if (!name) return;
    if (!/\.(md|txt|markdown)$/i.test(name)) name += '.md';
    if (/[/\\]/.test(name)) {
      toast.warning('El nombre no puede contener barras');
      return;
    }

    try {
      const res = await fetch(`/api/projects/${encodePath(projectPath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_file', name, content: `# ${name.replace(/\.\w+$/, '')}\n\n` }),
      });
      if (!res.ok) throw new Error((await res.json()).error || `Error ${res.status}`);
      setShowCreate(false);
      setNewName('');
      toast.success(`Nota «${name}» creada`);
      router.refresh();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const remove = async () => {
    if (!activeNote) return;
    try {
      const res = await fetch(
        `/api/projects/${encodePath(projectPath)}/${encodeURIComponent(activeNote.name)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error((await res.json()).error || `Error ${res.status}`);
      toast.success(`«${activeNote.name}» eliminado`);
      setActiveNote(null);
      setContent('');
      setSavedContent('');
      setConfirmDelete(false);
      setMobilePane('list');
      router.refresh();
    } catch (error) {
      toast.error(error.message);
      setConfirmDelete(false);
    }
  };

  return (
    <div className={`notes-tab pane-${mobilePane}`}>
      <aside className="notes-list card">
        <div className="nl-head">
          <div className="search-wrap" style={{ flex: 1 }}>
            <Icon name="search" size={14} />
            <input
              type="search"
              className="input input-search"
              placeholder="Filtrar ficheros…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filtrar ficheros"
            />
          </div>
          <button
            className="btn btn-soft btn-icon"
            onClick={() => setShowCreate(true)}
            title="Nueva nota"
            aria-label="Nueva nota"
          >
            <Icon name="plus" size={16} />
          </button>
        </div>

        <label className="transcripts-toggle">
          <span className="switch" data-on={String(showTranscripts)} />
          <input
            type="checkbox"
            className="sr-only"
            checked={showTranscripts}
            onChange={(e) => updateSettings({ showTranscriptsInNotes: e.target.checked })}
          />
          <span>Mostrar transcripciones</span>
        </label>

        <ul className="nl-items">
          {notes.map((note) => (
            <li key={note.path}>
              <button
                className={`nl-item ${activeNote?.name === note.name ? 'active' : ''}`}
                onClick={() => openNote(note)}
              >
                <Icon name={iconForFile(note.name)} size={15} />
                <span className="truncate">{note.name}</span>
                {isTranscriptName(note.name) && <span className="badge badge-info">TR</span>}
              </button>
            </li>
          ))}
          {notes.length === 0 && (
            <li className="nl-empty">
              {filter ? 'Sin coincidencias.' : 'No hay notas en este proyecto.'}
            </li>
          )}
        </ul>
      </aside>

      <section className="note-editor card">
        {!activeNote ? (
          <EmptyState
            icon="file-text"
            title="Elige una nota"
            description="Selecciona un fichero de la lista para leerlo o editarlo, o crea uno nuevo."
            action={
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
                <Icon name="plus" size={14} />
                Nueva nota
              </button>
            }
          />
        ) : (
          <>
            <header className="ne-head">
              <button
                className="btn btn-ghost btn-icon btn-sm back-btn"
                onClick={() => setMobilePane('list')}
                aria-label="Volver a la lista"
              >
                <Icon name="chevron-left" size={16} />
              </button>

              <h3 className="ne-title truncate" title={activeNote.name}>
                {activeNote.name}
                {dirty && <span className="dirty-dot" title="Cambios sin guardar" />}
              </h3>

              <div className="ne-actions">
                <div className="mode-switch" role="group" aria-label="Modo de edición">
                  <button
                    className={mode === 'preview' ? 'active' : ''}
                    onClick={() => setMode('preview')}
                    aria-pressed={mode === 'preview'}
                    title="Vista previa"
                  >
                    <Icon name="eye" size={14} />
                  </button>
                  <button
                    className={mode === 'edit' ? 'active' : ''}
                    onClick={() => setMode('edit')}
                    aria-pressed={mode === 'edit'}
                    title="Editar"
                  >
                    <Icon name="edit" size={14} />
                  </button>
                </div>

                <button
                  className="btn btn-ghost btn-icon btn-sm delete-btn"
                  onClick={() => setConfirmDelete(true)}
                  title="Eliminar nota"
                  aria-label="Eliminar nota"
                >
                  <Icon name="trash" size={15} />
                </button>

                <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !dirty}>
                  {saving ? <span className="spinner" /> : <Icon name="save" size={14} />}
                  Guardar
                </button>
              </div>
            </header>

            {loadingNote ? (
              <div className="ne-body">
                <div className="skeleton skeleton-text" style={{ width: '90%' }} />
                <div className="skeleton skeleton-text" style={{ width: '75%' }} />
                <div className="skeleton skeleton-text" style={{ width: '85%' }} />
              </div>
            ) : mode === 'edit' ? (
              <div className="ne-body edit">
                <MarkdownToolbar textareaRef={textareaRef} onUpdate={setContent} />
                <textarea
                  ref={textareaRef}
                  className="editor"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck="false"
                  aria-label={`Contenido de ${activeNote.name}`}
                />
              </div>
            ) : (
              <div className="ne-body markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content || '_Este fichero está vacío._'}
                </ReactMarkdown>
              </div>
            )}
          </>
        )}
      </section>

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nueva nota"
        icon="file-text"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={create} disabled={!newName.trim()}>
              Crear
            </button>
          </>
        }
      >
        <div className="field">
          <label className="label" htmlFor="new-note-name">
            Nombre del fichero
          </label>
          <input
            id="new-note-name"
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="ideas.md"
          />
          <span className="text-xs text-subtle">
            Si no indicas extensión se usará <code>.md</code>.
          </span>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Eliminar nota"
        message={`«${activeNote?.name}» se borrará del disco. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
      />

      <style jsx>{`
        .notes-tab {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: var(--sp-4);
          align-items: start;
          min-height: 560px;
        }

        .notes-list {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          padding: var(--sp-3);
          position: sticky;
          top: calc(var(--topbar-h) + var(--sp-4));
          max-height: calc(100dvh - var(--topbar-h) - var(--sp-8));
        }

        .nl-head {
          display: flex;
          gap: var(--sp-2);
        }

        .transcripts-toggle {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-1) var(--sp-2);
          font-size: var(--fs-xs);
          color: var(--text-muted);
          cursor: pointer;
        }

        .nl-items {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 1px;
          overflow-y: auto;
          min-height: 0;
        }

        .nl-item {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          width: 100%;
          padding: var(--sp-2);
          border-radius: var(--r-sm);
          font-size: var(--fs-sm);
          color: var(--text-muted);
          text-align: left;
          transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }

        .nl-item :global(svg) {
          flex-shrink: 0;
          color: var(--text-subtle);
        }

        .nl-item:hover {
          background: var(--surface-hover);
          color: var(--text);
        }

        .nl-item.active {
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 600;
        }

        .nl-item.active :global(svg) {
          color: var(--accent);
        }

        .nl-empty {
          padding: var(--sp-4) var(--sp-2);
          font-size: var(--fs-sm);
          color: var(--text-subtle);
          text-align: center;
        }

        .note-editor {
          display: flex;
          flex-direction: column;
          min-height: 560px;
          overflow: hidden;
        }

        /* When nothing is selected the placeholder is the whole panel, so it
           should not draw a second dashed box inside the card. */
        .note-editor :global(.empty-state) {
          flex: 1;
          border: none;
          background: transparent;
        }

        .ne-head {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-3) var(--sp-4);
          border-bottom: 1px solid var(--border);
          background: var(--surface-2);
        }

        .ne-title {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          font-size: var(--fs-sm);
          font-weight: 650;
        }

        .dirty-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--warning);
          flex-shrink: 0;
        }

        .ne-actions {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          flex-shrink: 0;
        }

        .ne-actions :global(.delete-btn:hover) {
          color: var(--danger);
          background: var(--danger-soft);
        }

        .mode-switch {
          display: flex;
          gap: 2px;
          padding: 2px;
          border-radius: var(--r-sm);
          background: var(--surface-3);
        }

        .mode-switch button {
          display: grid;
          place-items: center;
          width: 28px;
          height: 26px;
          border-radius: var(--r-xs);
          color: var(--text-subtle);
        }

        .mode-switch button.active {
          background: var(--surface);
          color: var(--accent);
          box-shadow: var(--shadow-xs);
        }

        .ne-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: var(--sp-5);
        }

        .ne-body.edit {
          display: flex;
          flex-direction: column;
          padding: 0;
          overflow: hidden;
        }

        .editor {
          flex: 1;
          width: 100%;
          min-height: 420px;
          padding: var(--sp-4);
          border: none;
          background: transparent;
          color: var(--text);
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
          line-height: 1.7;
          resize: none;
          outline: none;
          tab-size: 2;
        }

        .back-btn {
          display: none;
        }

        @media (max-width: 899px) {
          .notes-tab {
            grid-template-columns: 1fr;
            min-height: 0;
          }
          .notes-list {
            position: static;
            max-height: none;
          }
          .note-editor {
            min-height: 480px;
          }
          .back-btn {
            display: grid;
          }
          .pane-list .note-editor {
            display: none;
          }
          .pane-editor .notes-list {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
