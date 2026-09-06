'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from './ui/Icon';
import EmptyState from './ui/EmptyState';
import { SkeletonCards } from './ui/Skeleton';
import { useSettings } from '@/contexts/SettingsContext';

const PAGE_SIZE = 18;

function projectHref(path) {
  return `/project/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function DepthBadge({ depth }) {
  const label = depth === 0 ? 'Raíz' : `Nivel ${depth}`;
  return (
    <span className="depth-badge" style={{ '--tint': `var(--depth-${Math.min(depth, 5)})` }}>
      {label}
      <style jsx>{`
        .depth-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px var(--sp-2);
          border-radius: var(--r-full);
          font-size: var(--fs-2xs);
          font-weight: 650;
          color: var(--tint);
          background: color-mix(in srgb, var(--tint) 15%, transparent);
          white-space: nowrap;
        }
      `}</style>
    </span>
  );
}

/**
 * Browse every project in the tree. Grid on wide screens, a scannable table
 * when the user prefers it, and always a card list on phones — a horizontally
 * scrolling table is the worst thing you can hand a thumb.
 */
export default function ProjectsExplorer({ projects, loading }) {
  const { settings, updateSettings } = useSettings();
  const view = settings.projectsView === 'table' ? 'table' : 'grid';

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('path');
  const [sortOrder, setSortOrder] = useState('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter(
      (p) => p.name.toLowerCase().includes(term) || p.path.toLowerCase().includes(term)
    );
  }, [projects, query]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = sortBy === 'depth' ? a.depth : String(a[sortBy] ?? '');
      const bv = sortBy === 'depth' ? b.depth : String(b[sortBy] ?? '');
      const cmp =
        sortBy === 'depth' ? av - bv : av.localeCompare(bv, 'es', { sensitivity: 'base' });
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page]
  );

  // Any change to the result set puts the reader back on page one. Doing it in
  // the handlers (rather than an effect) keeps it a single render pass.
  const search = (value) => {
    setQuery(value);
    setPage(1);
  };

  const toggleSort = (column) => {
    if (sortBy === column) setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const arrow = (column) =>
    sortBy === column ? (
      <Icon name={sortOrder === 'asc' ? 'chevron-up' : 'chevron-down'} size={12} />
    ) : null;

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title">
          <Icon name="layers" size={18} />
          Proyectos
        </h2>
        <div className="explorer-tools">
          <div className="search-wrap">
            <Icon name="search" size={15} />
            <input
              type="search"
              className="input input-search"
              placeholder="Buscar por nombre o ruta…"
              value={query}
              onChange={(e) => search(e.target.value)}
              aria-label="Buscar proyectos"
            />
          </div>
          <div className="view-switch" role="group" aria-label="Modo de vista">
            <button
              className={view === 'grid' ? 'active' : ''}
              onClick={() => updateSettings({ projectsView: 'grid' })}
              aria-pressed={view === 'grid'}
              title="Vista de tarjetas"
            >
              <Icon name="grid" size={15} />
            </button>
            <button
              className={view === 'table' ? 'active' : ''}
              onClick={() => updateSettings({ projectsView: 'table' })}
              aria-pressed={view === 'table'}
              title="Vista de tabla"
            >
              <Icon name="table" size={15} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonCards count={6} height={104} />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="folder"
          title={query ? 'Sin coincidencias' : 'Aún no hay proyectos'}
          description={
            query
              ? 'Prueba con otro término de búsqueda.'
              : 'Crea tu primer proyecto desde la barra lateral. Cada proyecto es simplemente una carpeta dentro de projects_data.'
          }
        />
      ) : (
        <>
          {view === 'grid' ? (
            <div className="grid-auto">
              {pageItems.map((project) => (
                <Link key={project.path} href={projectHref(project.path)} className="project-card card card-hover">
                  <div className="pc-head">
                    <span className="pc-icon" style={{ color: `var(--depth-${Math.min(project.depth, 5)})` }}>
                      <Icon name={project.hasChildren ? 'folder-open' : 'book'} size={20} />
                    </span>
                    <DepthBadge depth={project.depth} />
                  </div>
                  <h3 className="pc-name truncate">{project.name}</h3>
                  <p className="pc-path mono truncate">{project.path}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="table-wrap desktop-only">
              <table className="table">
                <thead>
                  <tr>
                    <th className="th-sortable" onClick={() => toggleSort('name')}>
                      <span className="th-inner">Nombre {arrow('name')}</span>
                    </th>
                    <th className="th-sortable" onClick={() => toggleSort('path')}>
                      <span className="th-inner">Ruta {arrow('path')}</span>
                    </th>
                    <th className="th-sortable" onClick={() => toggleSort('depth')}>
                      <span className="th-inner">Nivel {arrow('depth')}</span>
                    </th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((project) => (
                    <tr key={project.path}>
                      <td>
                        <span className="cell-name">
                          <Icon
                            name={project.hasChildren ? 'folder' : 'book'}
                            size={15}
                            style={{ color: `var(--depth-${Math.min(project.depth, 5)})` }}
                          />
                          {project.name}
                        </span>
                      </td>
                      <td className="mono text-xs">{project.path}</td>
                      <td>
                        <DepthBadge depth={project.depth} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href={projectHref(project.path)} className="btn btn-soft btn-sm">
                          Abrir
                          <Icon name="arrow-right" size={13} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tables collapse to cards below the tablet breakpoint. */}
          {view === 'table' && (
            <div className="grid-auto mobile-only">
              {pageItems.map((project) => (
                <Link key={project.path} href={projectHref(project.path)} className="project-card card card-hover">
                  <div className="pc-head">
                    <span className="pc-icon" style={{ color: `var(--depth-${Math.min(project.depth, 5)})` }}>
                      <Icon name={project.hasChildren ? 'folder-open' : 'book'} size={20} />
                    </span>
                    <DepthBadge depth={project.depth} />
                  </div>
                  <h3 className="pc-name truncate">{project.name}</h3>
                  <p className="pc-path mono truncate">{project.path}</p>
                </Link>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav className="pager" aria-label="Paginación">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <Icon name="chevron-left" size={14} />
                Anterior
              </button>
              <span className="pager-info">
                Página {page} de {totalPages} · {sorted.length} proyectos
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Siguiente
                <Icon name="chevron-right" size={14} />
              </button>
            </nav>
          )}
        </>
      )}

      <style jsx>{`
        .explorer-tools {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
        }

        .explorer-tools .search-wrap {
          width: min(280px, 52vw);
        }

        .view-switch {
          display: flex;
          gap: 2px;
          padding: 2px;
          border-radius: var(--r-md);
          background: var(--surface-3);
        }

        .view-switch button {
          display: grid;
          place-items: center;
          width: 32px;
          height: 30px;
          border-radius: var(--r-sm);
          color: var(--text-subtle);
          transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }

        .view-switch button.active {
          background: var(--surface);
          color: var(--accent);
          box-shadow: var(--shadow-xs);
        }

        .th-inner {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .cell-name {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-2);
          font-weight: 550;
          color: var(--text);
        }

        :global(.project-card) {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          padding: var(--sp-4);
        }

        .pc-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-2);
        }

        .pc-icon {
          display: flex;
        }

        .pc-name {
          font-size: var(--fs-md);
          font-weight: 650;
          color: var(--text);
        }

        .pc-path {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
        }

        .pager {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--sp-3);
          margin-top: var(--sp-5);
          flex-wrap: wrap;
        }

        .pager-info {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
        }

        .mobile-only { display: none; }

        @media (max-width: 899px) {
          .section-head {
            align-items: stretch;
          }
          .explorer-tools {
            width: 100%;
          }
          .explorer-tools .search-wrap {
            flex: 1;
            width: auto;
          }
          .desktop-only { display: none; }
          .mobile-only { display: grid; }
        }
      `}</style>
    </section>
  );
}
