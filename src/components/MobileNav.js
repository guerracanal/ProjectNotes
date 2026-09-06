'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './ui/Icon';
import { useSidebar } from '@/contexts/SidebarContext';

/**
 * Thumb-reachable bottom bar for phones and small tablets. Mirrors the four
 * things you actually do on a small screen: browse, search, ask, navigate.
 */
export default function MobileNav({ onOpenPalette, onOpenChat }) {
  const pathname = usePathname();
  const { isOpen, toggle } = useSidebar();

  return (
    <nav className="mobile-nav" aria-label="Navegación principal">
      <Link href="/" className={`mnav-item ${pathname === '/' ? 'active' : ''}`}>
        <Icon name="home" size={20} />
        <span>Panel</span>
      </Link>

      <button className={`mnav-item ${isOpen ? 'active' : ''}`} onClick={toggle}>
        <Icon name="folder" size={20} />
        <span>Proyectos</span>
      </button>

      <button className="mnav-item" onClick={onOpenPalette}>
        <Icon name="search" size={20} />
        <span>Buscar</span>
      </button>

      <button className="mnav-item accent" onClick={onOpenChat}>
        <Icon name="sparkles" size={20} />
        <span>Asistente</span>
      </button>

      <style jsx>{`
        .mobile-nav {
          display: none;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          padding-bottom: var(--safe-b);
          background: color-mix(in srgb, var(--surface) 92%, transparent);
          backdrop-filter: blur(14px) saturate(1.4);
          -webkit-backdrop-filter: blur(14px) saturate(1.4);
          border-top: 1px solid var(--border);
        }

        :global(.mnav-item) {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          min-height: 56px;
          padding: var(--sp-2) 2px;
          color: var(--text-subtle);
          font-size: var(--fs-2xs);
          font-weight: 550;
          transition: color var(--dur-fast) var(--ease);
        }

        :global(.mnav-item).active {
          color: var(--accent);
        }

        :global(.mnav-item).accent {
          color: var(--accent);
        }

        :global(.mnav-item):active {
          background: var(--surface-hover);
        }

        @media (max-width: 899px) {
          .mobile-nav {
            display: flex;
          }
        }
      `}</style>
    </nav>
  );
}
