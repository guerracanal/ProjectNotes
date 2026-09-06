'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Icon from './ui/Icon';
import ThemeToggle from './ThemeToggle';
import { useSidebar } from '@/contexts/SidebarContext';

/** Human-readable trail derived from the current route. */
function useBreadcrumbs(pathname) {
  if (!pathname || pathname === '/') return [{ label: 'Panel', href: '/' }];

  if (pathname.startsWith('/project/')) {
    const raw = pathname.replace('/project/', '');
    const segments = raw.split('/').filter(Boolean).map(decodeURIComponent);
    return [
      { label: 'Proyectos', href: '/' },
      ...segments.map((segment, i) => ({
        label: segment,
        href: `/project/${segments.slice(0, i + 1).map(encodeURIComponent).join('/')}`,
      })),
    ];
  }

  return [{ label: 'Panel', href: '/' }];
}

export default function Topbar({ onOpenPalette, onOpenChat }) {
  const pathname = usePathname();
  const { isOpen, toggle } = useSidebar();
  const crumbs = useBreadcrumbs(pathname);

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button
          className="btn btn-ghost btn-icon"
          onClick={toggle}
          aria-label={isOpen ? 'Ocultar navegación' : 'Mostrar navegación'}
          aria-expanded={isOpen}
        >
          <Icon name="panel-left" size={18} />
        </button>

        <nav className="crumbs no-scrollbar" aria-label="Ruta de navegación">
          {crumbs.map((crumb, i) => (
            <span key={crumb.href} className="crumb-item">
              {i > 0 && <Icon name="chevron-right" size={13} className="crumb-sep" />}
              {i === crumbs.length - 1 ? (
                <span className="crumb current" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="crumb">
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
        </nav>

        <div className="topbar-actions">
          <button className="search-trigger" onClick={onOpenPalette} aria-label="Buscar">
            <Icon name="search" size={15} />
            <span className="search-trigger-label">Buscar…</span>
            <span className="search-trigger-kbd">
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">K</kbd>
            </span>
          </button>

          <button
            className="btn btn-soft btn-icon assistant-btn"
            onClick={onOpenChat}
            aria-label="Abrir asistente"
            title="Asistente (⌘J)"
          >
            <Icon name="sparkles" size={18} />
          </button>

          <ThemeToggle />
        </div>
      </div>

      <style jsx>{`
        .topbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: color-mix(in srgb, var(--bg) 82%, transparent);
          backdrop-filter: blur(12px) saturate(1.4);
          -webkit-backdrop-filter: blur(12px) saturate(1.4);
          border-bottom: 1px solid var(--border);
          padding-top: var(--safe-t);
        }

        .topbar-inner {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          height: var(--topbar-h);
          max-width: var(--content-max);
          margin-inline: auto;
          padding-inline: var(--sp-4);
        }

        .crumbs {
          display: flex;
          align-items: center;
          flex: 1;
          min-width: 0;
          overflow-x: auto;
          white-space: nowrap;
          font-size: var(--fs-sm);
        }

        .crumb-item {
          display: inline-flex;
          align-items: center;
        }

        :global(.crumb) {
          padding: 3px var(--sp-2);
          border-radius: var(--r-sm);
          color: var(--text-muted);
          transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
        }

        :global(.crumb):hover {
          color: var(--text);
          background: var(--surface-hover);
        }

        :global(.crumb).current {
          color: var(--text);
          font-weight: 600;
        }

        :global(.crumb-sep) {
          color: var(--text-subtle);
          opacity: 0.7;
          flex-shrink: 0;
        }

        .topbar-actions {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          flex-shrink: 0;
        }

        .search-trigger {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          height: 34px;
          min-width: 210px;
          padding-inline: var(--sp-3);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          background: var(--surface-2);
          color: var(--text-subtle);
          font-size: var(--fs-sm);
          transition: border-color var(--dur-fast) var(--ease),
            background var(--dur-fast) var(--ease);
        }

        .search-trigger:hover {
          border-color: var(--accent);
          background: var(--surface);
          color: var(--text-muted);
        }

        .search-trigger-label {
          flex: 1;
          text-align: left;
        }

        .search-trigger-kbd {
          display: flex;
          gap: 2px;
        }

        @media (max-width: 899px) {
          .search-trigger {
            min-width: 0;
            width: 34px;
            padding-inline: 0;
            justify-content: center;
          }
          .search-trigger-label,
          .search-trigger-kbd {
            display: none;
          }
          .assistant-btn {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
