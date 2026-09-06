'use client';

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileNav from './MobileNav';
import CommandPalette from './CommandPalette';
import ChatPanel from './chat/ChatPanel';
import ScrollButtons from './ScrollButtons';
import InstallPrompt from './InstallPrompt';
import ServiceWorkerRegistrar from './ServiceWorkerRegistrar';
import { useSidebar } from '@/contexts/SidebarContext';

export default function AppShell({ children }) {
  const { isOpen, isMobile, close } = useSidebar();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Global shortcuts: ⌘K / Ctrl+K opens search, ⌘J / Ctrl+J the assistant.
  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setChatOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="app-shell">
      <ServiceWorkerRegistrar />
      <Sidebar />

      {isMobile && isOpen && (
        <div className="scrim" onClick={close} aria-hidden="true" />
      )}

      <div className={`main-column ${isOpen && !isMobile ? 'with-sidebar' : ''}`}>
        <Topbar
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenChat={() => setChatOpen(true)}
        />
        <main className="main-content">{children}</main>
      </div>

      <MobileNav
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenChat={() => setChatOpen(true)}
      />

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      <InstallPrompt />
      <ScrollButtons />

      <style jsx>{`
        .main-column {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          transition: margin-left var(--dur-slow) var(--ease-out);
        }

        .main-column.with-sidebar {
          margin-left: var(--sidebar-w);
        }

        .main-content {
          flex: 1;
          width: 100%;
          max-width: var(--content-max);
          margin-inline: auto;
          padding: var(--sp-6) var(--sp-6) var(--sp-16);
          animation: fade-in var(--dur-slow) var(--ease-out);
        }

        .scrim {
          position: fixed;
          inset: 0;
          z-index: 998;
          background: var(--overlay);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          animation: fade-in var(--dur) var(--ease-out);
        }

        @media (max-width: 899px) {
          .main-column.with-sidebar {
            margin-left: 0;
          }
          .main-content {
            padding: var(--sp-4) var(--sp-4) calc(var(--sp-16) + var(--safe-b) + 56px);
          }
        }
      `}</style>
    </div>
  );
}
