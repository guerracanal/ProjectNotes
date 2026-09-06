'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SidebarContext = createContext(null);
const STORAGE_KEY = 'projectnotes:sidebar-open';
const MOBILE_BREAKPOINT = 900;

export function SidebarProvider({ children }) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    const apply = (matches) => {
      setIsMobile(matches);
      if (matches) {
        // On phones the sidebar is an overlay drawer: start closed.
        setIsOpen(false);
      } else {
        let stored = null;
        try {
          stored = localStorage.getItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        setIsOpen(stored === null ? true : stored === 'true');
      }
    };

    apply(mq.matches);
    const onChange = (e) => apply(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setOpen = useCallback(
    (next) => {
      setIsOpen((prev) => {
        const value = typeof next === 'function' ? next(prev) : next;
        if (!isMobile) {
          try {
            localStorage.setItem(STORAGE_KEY, String(value));
          } catch {
            /* ignore */
          }
        }
        return value;
      });
    },
    [isMobile]
  );

  const toggle = useCallback(() => setOpen((v) => !v), [setOpen]);
  const close = useCallback(() => setOpen(false), [setOpen]);

  const value = useMemo(
    () => ({ isOpen, isMobile, setIsOpen: setOpen, toggle, close }),
    [isOpen, isMobile, setOpen, toggle, close]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
