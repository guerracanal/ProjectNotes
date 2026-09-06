'use client';

import Icon from './ui/Icon';
import { useTheme } from '@/contexts/ThemeContext';

const LABELS = {
  light: 'Tema claro',
  dark: 'Tema oscuro',
  system: 'Según el sistema',
};

const ICONS = { light: 'sun', dark: 'moon', system: 'monitor' };

export default function ThemeToggle({ showLabel = false }) {
  const { theme, cycleTheme } = useTheme();

  return (
    <button
      className={showLabel ? 'theme-toggle-wide' : 'btn btn-ghost btn-icon'}
      onClick={cycleTheme}
      title={`${LABELS[theme]} — pulsa para cambiar`}
      aria-label={`Cambiar tema. Actual: ${LABELS[theme]}`}
    >
      <Icon name={ICONS[theme]} size={18} />
      {showLabel && <span>{LABELS[theme]}</span>}

      <style jsx>{`
        .theme-toggle-wide {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          width: 100%;
          padding: var(--sp-2) var(--sp-3);
          border-radius: var(--r-md);
          color: var(--text-muted);
          font-size: var(--fs-sm);
          transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }
        .theme-toggle-wide:hover {
          background: var(--surface-hover);
          color: var(--text);
        }
      `}</style>
    </button>
  );
}
