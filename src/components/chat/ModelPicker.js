'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../ui/Icon';

/**
 * Provider and model selector.
 *
 * Only providers that are actually reachable can be selected; the rest are
 * listed greyed out with the reason, because "why can't I pick Groq" is a
 * question the UI should answer without a trip to the docs.
 */
export default function ModelPicker({ value, onChange, onLoaded }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/models');
        const payload = await res.json();
        if (cancelled) return;
        setData(payload);
        onLoaded?.(payload);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onLoaded]);

  // Close on an outside click or Escape, like any other popover.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // The chat panel closes on Escape too. Stop here so dismissing this
      // menu does not also dismiss the whole assistant.
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const providers = useMemo(() => data?.providers || [], [data]);
  const current = useMemo(() => {
    const provider = providers.find((p) => p.id === value?.provider);
    return {
      provider,
      label: provider?.label || 'Sin proveedor',
      model: value?.model || provider?.defaultModel || '',
    };
  }, [providers, value]);

  const usable = providers.filter((p) => p.available);

  return (
    <div className="picker" ref={rootRef}>
      <button
        className="picker-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Elegir proveedor y modelo"
      >
        <Icon name="bot" size={13} />
        <span className="truncate">{current.model || current.label}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={12} />
      </button>

      {open && (
        <div className="picker-menu" role="listbox">
          {error && <p className="picker-note">No se pudo consultar los modelos: {error}</p>}

          {!data && !error && <p className="picker-note">Cargando modelos…</p>}

          {data && usable.length === 0 && (
            <p className="picker-note">
              Ningún proveedor configurado. Añade una clave a <code>.env.local</code>: Gemini y
              Groq tienen plan gratuito.
            </p>
          )}

          {providers.map((provider) => (
            <div key={provider.id} className={`picker-group ${provider.available ? '' : 'disabled'}`}>
              <div className="picker-group-head">
                <span className="picker-provider">{provider.label}</span>
                {provider.free && <span className="badge badge-success">gratis</span>}
                {!provider.available && (
                  <a
                    className="picker-get"
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {provider.needsKey ? 'conseguir clave' : 'instalar'}
                    <Icon name="external" size={10} />
                  </a>
                )}
              </div>

              {!provider.available ? (
                <p className="picker-hint">
                  {provider.error
                    ? provider.error
                    : provider.needsKey
                      ? `Define ${provider.envKey} en .env.local.`
                      : provider.notes}
                </p>
              ) : (
                <ul className="picker-models">
                  {provider.models.map((model) => {
                    const selected = value?.provider === provider.id && value?.model === model.id;
                    return (
                      <li key={`${provider.id}:${model.id}`}>
                        <button
                          role="option"
                          aria-selected={selected}
                          className={`picker-model ${selected ? 'selected' : ''}`}
                          onClick={() => {
                            onChange({ provider: provider.id, model: model.id });
                            setOpen(false);
                          }}
                        >
                          <span className="truncate">{model.label}</span>
                          {selected && <Icon name="check" size={13} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .picker {
          position: relative;
          min-width: 0;
        }

        .picker-trigger {
          display: flex;
          align-items: center;
          gap: 4px;
          max-width: 190px;
          padding: 2px var(--sp-2);
          border-radius: var(--r-full);
          background: var(--surface-3);
          color: var(--text-muted);
          font-size: var(--fs-2xs);
          font-weight: 600;
          transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }

        .picker-trigger:hover {
          background: var(--surface-hover);
          color: var(--text);
        }

        .picker-menu {
          position: absolute;
          /* The trigger sits in the bar at the top of the panel, so the menu
             drops down. Opening upward put it off the top of the viewport. */
          top: calc(100% + 6px);
          right: 0;
          z-index: 20;
          width: min(300px, 78vw);
          max-height: min(380px, 60dvh);
          overflow-y: auto;
          padding: var(--sp-2);
          border: 1px solid var(--border);
          border-radius: var(--r-lg);
          background: var(--surface);
          box-shadow: var(--shadow-lg);
          animation: scale-in var(--dur-fast) var(--ease-out);
        }

        .picker-note {
          padding: var(--sp-3);
          font-size: var(--fs-xs);
          color: var(--text-muted);
          line-height: 1.5;
        }

        .picker-group + .picker-group {
          margin-top: var(--sp-2);
          padding-top: var(--sp-2);
          border-top: 1px solid var(--border);
        }

        .picker-group.disabled {
          opacity: 0.62;
        }

        .picker-group-head {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          padding: var(--sp-1) var(--sp-2);
        }

        .picker-provider {
          font-size: var(--fs-2xs);
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--text-subtle);
          flex: 1;
          min-width: 0;
        }

        .picker-get {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          font-size: var(--fs-2xs);
          color: var(--accent);
          white-space: nowrap;
        }

        .picker-hint {
          padding: 0 var(--sp-2) var(--sp-1);
          font-size: var(--fs-2xs);
          color: var(--text-subtle);
          line-height: 1.5;
        }

        .picker-models {
          list-style: none;
        }

        .picker-model {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          width: 100%;
          padding: 5px var(--sp-2);
          border-radius: var(--r-sm);
          text-align: left;
          font-size: var(--fs-xs);
          color: var(--text-muted);
          transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
        }

        .picker-model span {
          flex: 1;
          min-width: 0;
        }

        .picker-model:hover {
          background: var(--surface-hover);
          color: var(--text);
        }

        .picker-model.selected {
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
