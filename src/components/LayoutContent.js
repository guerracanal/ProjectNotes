'use client';

import { useSidebar } from '@/contexts/SidebarContext';
import ScrollButtons from './ScrollButtons';

export default function LayoutContent({ children }) {
  const { isOpen } = useSidebar();

  return (
    <main className={`main-content ${isOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      {children}
      <ScrollButtons />
      <style jsx>{`
        .main-content {
          transition: margin-left 0.3s ease, width 0.3s ease;
          min-height: 100vh;
          padding: 2rem;
        }

        .main-content.sidebar-open {
          margin-left: 250px;
          width: calc(100% - 250px);
        }

        .main-content.sidebar-closed {
          margin-left: 0;
          width: 100%;
        }

        @media (max-width: 768px) {
          .main-content {
            margin-left: 0 !important;
            width: 100% !important;
          }
        }
      `}</style>
    </main>
  );
}
