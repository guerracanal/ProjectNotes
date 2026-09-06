'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './ui/Icon';
import Modal from './ui/Modal';
import ThemeToggle from './ThemeToggle';
import GoogleDriveModal from './GoogleDriveModal';
import KnowledgeStatus from './KnowledgeStatus';
import { useSidebar } from '@/contexts/SidebarContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';

const MAX_TINT_DEPTH = 5;

function TreeNode({ node, pathname, depth = 0, forceOpen = false, onNavigate }) {
  // `null` means "no explicit choice yet", so the branch follows the search and
  // the active route. A click pins it open or closed until the user says
  // otherwise. Deriving this beats mirroring it into state from an effect.
  const [manualOpen, setManualOpen] = useState(null);

  const hasChildren = Boolean(node.children?.length);
  const href = `/project/${node.path.split('/').map(encodeURIComponent).join('/')}`;
  const isActive = decodeURIComponent(pathname) === `/project/${node.path}`;
  const inPath = decodeURIComponent(pathname).startsWith(`/project/${node.path}/`);

  const open = manualOpen ?? (forceOpen || inPath);

  return (
    <li className="tree-item">
      <div className={`tree-row ${isActive ? 'active' : ''}`}>
        <button
          className={`twisty ${hasChildren ? '' : 'invisible'}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setManualOpen(!open);
          }}
          aria-label={open ? 'Contraer' : 'Expandir'}
          aria-expanded={hasChildren ? open : undefined}
          tabIndex={hasChildren ? 0 : -1}
        >
          <Icon name="chevron-right" size={13} className={open ? 'twisty-icon open' : 'twisty-icon'} />
        </button>

        <Link href={href} className="tree-link" title={node.path} onClick={onNavigate}>
          <span
            className="tree-icon"
            style={{ color: `var(--depth-${Math.min(depth, MAX_TINT_DEPTH)})` }}
          >
            <Icon name={hasChildren ? (open ? 'folder-open' : 'folder') : 'book'} size={15} />
          </span>
          <span className="truncate">{node.name}</span>
        </Link>
      </div>

      {hasChildren && open && (
        <ul className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              pathname={pathname}
              depth={depth + 1}
              forceOpen={forceOpen}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}

      <style jsx>{`
        .tree-item {
          list-style: none;
          position: relative;
        }

        .tree-row {
          display: flex;
          align-items: center;
          gap: 2px;
          border-radius: var(--r-sm);
          transition: background var(--dur-fast) var(--ease);
        }

        .tree-row:hover {
          background: var(--surface-hover);
        }

        .tree-row.active {
          background: var(--accent-soft);
        }

        .tree-row.active :global(.tree-link) {
          color: var(--accent);
          font-weight: 600;
        }

        .twisty {
          display: grid;
          place-items: center;
          width: 20px;
          height: 28px;
          flex-shrink: 0;
          color: var(--text-subtle);
          border-radius: var(--r-xs);
        }

        .twisty.invisible {
          visibility: hidden;
        }

        .twisty:hover {
          color: var(--text);
        }

        :global(.twisty-icon) {
          transition: transform var(--dur) var(--ease-out);
        }

        :global(.twisty-icon.open) {
          transform: rotate(90deg);
        }

        :global(.tree-link) {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          flex: 1;
          min-width: 0;
          padding: 5px var(--sp-2) 5px 0;
          font-size: var(--fs-sm);
          color: var(--text-muted);
          transition: color var(--dur-fast) var(--ease);
        }

        :global(.tree-link):hover {
          color: var(--text);
        }

        .tree-icon {
          display: flex;
          flex-shrink: 0;
        }

        .tree-children {
          margin-left: 10px;
          padding-left: 9px;
          border-left: 1px solid var(--border);
        }
      `}</style>
    </li>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const toast = useToast();
  const { isOpen, isMobile, close } = useSidebar();
  const { settings, updateSettings } = useSettings();

  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showDrive, setShowDrive] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [newName, setNewName] = useState('');
  const [parent, setParent] = useState('');
  const [creating, setCreating] = useState(false);

  const loadTree = useCallback(async () => {
    try {
      const res = await fetch('/api/tree');
      const data = await res.json();
      setTree(data.tree || []);
    } catch (error) {
      console.error('Error loading tree:', error);
      toast.error('No se pudo cargar el árbol de proyectos');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Reflect the Drive connection state without polling on a timer forever.
  useEffect(() => {
    const check = () => setDriveConnected(Boolean(sessionStorage.getItem('gdrive_access_token')));
    check();
    window.addEventListener('storage', check);
    window.addEventListener('projectnotes:gdrive-auth', check);
    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener('projectnotes:gdrive-auth', check);
    };
  }, []);

  // Background auto-sync, when the user has enabled it.
  useEffect(() => {
    if (!settings.gdriveAutoSync) return undefined;
    const token = sessionStorage.getItem('gdrive_access_token');
    if (!token) return undefined;

    const intervalMs = (settings.gdriveAutoSyncInterval || 5) * 60 * 1000;

    const sync = async () => {
      try {
        const res = await fetch('/api/sync/gdrive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken: sessionStorage.getItem('gdrive_access_token'),
            folderName: settings.gdriveFolderName || 'ProjectNotes',
            forceMode: 'two-way',
          }),
        });
        const data = await res.json();
        if (data.success) {
          updateSettings({
            gdriveLastSync: new Date().toISOString(),
            gdriveSyncStats: data.stats,
          });
          if (data.stats?.totalProcessed > 0) {
            await loadTree();
            // New files on disk mean the assistant's index is out of date.
            fetch('/api/knowledge', { method: 'POST' }).catch(() => {});
          }
        }
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    };

    const first = setTimeout(sync, 10_000);
    const timer = setInterval(sync, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [
    settings.gdriveAutoSync,
    settings.gdriveAutoSyncInterval,
    settings.gdriveFolderName,
    updateSettings,
    loadTree,
  ]);

  const filteredTree = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return tree;

    const walk = (nodes) =>
      nodes.reduce((acc, node) => {
        const children = node.children ? walk(node.children) : [];
        if (node.name.toLowerCase().includes(term) || children.length) {
          acc.push({ ...node, children });
        }
        return acc;
      }, []);

    return walk(tree);
  }, [tree, filter]);

  const folderOptions = useMemo(() => {
    const walk = (nodes, prefix = '') =>
      (nodes || []).flatMap((node) => {
        const full = prefix ? `${prefix}/${node.name}` : node.name;
        return [full, ...walk(node.children, full)];
      });
    return ['', ...walk(tree)];
  }, [tree]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      toast.warning('Escribe un nombre para el proyecto');
      return;
    }
    if (/[/\\]/.test(name)) {
      toast.warning('El nombre no puede contener barras');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`/api/projects/${parent.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_folder', name }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Error al crear el proyecto');

      await loadTree();
      setNewName('');
      setParent('');
      setShowCreate(false);
      toast.success(`Proyecto «${name}» creado`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`} aria-hidden={!isOpen}>
        <div className="brand">
          <Link href="/" className="brand-link">
            <span className="brand-mark">
              <Icon name="layers" size={17} />
            </span>
            <span className="brand-name">ProjectNotes</span>
          </Link>
          {isMobile && (
            <button className="btn btn-ghost btn-icon btn-sm" onClick={close} aria-label="Cerrar menú">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>

        <nav className="sidebar-scroll">
          <div className="nav-group">
            <Link
              href="/"
              className={`nav-link ${pathname === '/' ? 'active' : ''}`}
              onClick={isMobile ? close : undefined}
            >
              <Icon name="home" size={16} />
              <span>Panel</span>
            </Link>
          </div>

          <div className="nav-group">
            <div className="group-head">
              <span className="group-title">Proyectos</span>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setShowCreate(true)}
                aria-label="Nuevo proyecto"
                title="Nuevo proyecto"
              >
                <Icon name="plus" size={15} />
              </button>
            </div>

            <div className="search-wrap" style={{ marginBottom: 'var(--sp-3)' }}>
              <Icon name="search" size={15} />
              <input
                type="search"
                className="input input-search"
                placeholder="Filtrar proyectos…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                aria-label="Filtrar proyectos"
              />
            </div>

            {loading ? (
              <div className="tree-loading" aria-live="polite">
                {[70, 55, 80, 45].map((w, i) => (
                  <div key={i} className="skeleton skeleton-text" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : filteredTree.length > 0 ? (
              <ul className="tree-root">
                {filteredTree.map((node) => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    pathname={pathname}
                    forceOpen={Boolean(filter.trim())}
                    onNavigate={isMobile ? close : undefined}
                  />
                ))}
              </ul>
            ) : (
              <p className="tree-empty">
                {filter ? 'Ningún proyecto coincide.' : 'Aún no hay proyectos.'}
              </p>
            )}
          </div>
        </nav>

        <div className="sidebar-footer">
          <KnowledgeStatus />

          <button
            className={`nav-link toggle-row ${settings.showMeetings ? '' : 'muted'}`}
            onClick={() => updateSettings({ showMeetings: !settings.showMeetings })}
            aria-pressed={settings.showMeetings}
          >
            <Icon name="video" size={16} />
            <span>Reuniones</span>
            <span className="switch" data-on={String(settings.showMeetings)} />
          </button>

          <button className="nav-link toggle-row" onClick={() => setShowDrive(true)}>
            <Icon name="cloud" size={16} />
            <span>Google Drive</span>
            <span className={`dot ${driveConnected ? 'on' : ''}`} title={driveConnected ? 'Conectado' : 'Sin conectar'} />
          </button>

          <ThemeToggle showLabel />

          <button className="btn btn-primary btn-block" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={16} />
            Nuevo proyecto
          </button>
        </div>
      </aside>

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nuevo proyecto"
        icon="folder"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating && <span className="spinner" />}
              Crear
            </button>
          </>
        }
      >
        <div className="field">
          <label className="label" htmlFor="new-project-name">
            Nombre
          </label>
          <input
            id="new-project-name"
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Ej. Rediseño del portal"
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="new-project-parent">
            Carpeta contenedora
          </label>
          <select
            id="new-project-parent"
            className="select"
            value={parent}
            onChange={(e) => setParent(e.target.value)}
          >
            {folderOptions.map((folder) => (
              <option key={folder || '__root__'} value={folder}>
                {folder || 'Raíz'}
              </option>
            ))}
          </select>
        </div>
      </Modal>

      <GoogleDriveModal
        isOpen={showDrive}
        onClose={() => setShowDrive(false)}
        onSyncComplete={loadTree}
      />

      <style jsx>{`
        .sidebar {
          position: fixed;
          top: 0;
          left: 0;
          z-index: 999;
          display: flex;
          flex-direction: column;
          width: var(--sidebar-w);
          height: 100dvh;
          padding-top: var(--safe-t);
          padding-bottom: var(--safe-b);
          background: var(--surface);
          border-right: 1px solid var(--border);
          transition: transform var(--dur-slow) var(--ease-out);
        }

        .sidebar.closed {
          transform: translateX(-100%);
        }

        .brand {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-2);
          height: var(--topbar-h);
          padding-inline: var(--sp-4);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        :global(.brand-link) {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          min-width: 0;
        }

        .brand-mark {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: var(--r-sm);
          background: linear-gradient(135deg, var(--brand-500), var(--brand-700));
          color: #fff;
          flex-shrink: 0;
          box-shadow: var(--shadow-xs);
        }

        .brand-name {
          font-size: var(--fs-md);
          font-weight: 650;
          letter-spacing: -0.015em;
        }

        .sidebar-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: var(--sp-4) var(--sp-3);
        }

        .nav-group + .nav-group {
          margin-top: var(--sp-5);
        }

        .group-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-inline: var(--sp-2);
          margin-bottom: var(--sp-2);
        }

        .group-title {
          font-size: var(--fs-2xs);
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-subtle);
        }

        :global(.nav-link) {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          width: 100%;
          padding: var(--sp-2) var(--sp-3);
          border-radius: var(--r-md);
          color: var(--text-muted);
          font-size: var(--fs-sm);
          font-weight: 500;
          text-align: left;
          transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }

        :global(.nav-link):hover {
          background: var(--surface-hover);
          color: var(--text);
        }

        :global(.nav-link).active {
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 600;
        }

        .toggle-row span:not(.switch):not(.dot) {
          flex: 1;
        }

        .toggle-row.muted {
          opacity: 0.65;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--border-strong);
          flex-shrink: 0;
        }

        .dot.on {
          background: var(--success);
          box-shadow: 0 0 0 3px var(--success-soft);
        }

        .tree-root {
          list-style: none;
        }

        .tree-loading {
          padding-inline: var(--sp-2);
        }

        .tree-empty {
          padding: var(--sp-3) var(--sp-2);
          font-size: var(--fs-sm);
          color: var(--text-subtle);
        }

        .sidebar-footer {
          display: flex;
          flex-direction: column;
          gap: var(--sp-1);
          flex-shrink: 0;
          padding: var(--sp-3);
          border-top: 1px solid var(--border);
          background: var(--surface-2);
        }

        .sidebar-footer :global(.btn-block) {
          margin-top: var(--sp-2);
        }

        @media (max-width: 899px) {
          .sidebar {
            width: min(84vw, 320px);
            box-shadow: var(--shadow-lg);
            /* Clear the fixed bottom navigation bar. */
            padding-bottom: calc(var(--safe-b) + 56px);
          }
        }
      `}</style>
    </>
  );
}
