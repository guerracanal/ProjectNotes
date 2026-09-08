'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from './ui/Modal';
import Icon from './ui/Icon';
import { useSettings } from '@/contexts/SettingsContext';
import { useToast } from '@/contexts/ToastContext';

const SYNC_MODES = [
  { id: 'two-way', label: 'Bidireccional', icon: 'refresh', hint: 'Gana el más reciente' },
  { id: 'upload', label: 'Solo subir', icon: 'upload', hint: 'Local → Drive' },
  { id: 'download', label: 'Solo bajar', icon: 'download', hint: 'Drive → local' },
];

/** Signal the sidebar that the connection state changed. */
function announceAuthChange() {
  window.dispatchEvent(new Event('projectnotes:gdrive-auth'));
}

export default function GoogleDriveModal({ isOpen, onClose, onSyncComplete }) {
  const { settings, updateSettings } = useSettings();
  const toast = useToast();

  const [clientId, setClientId] = useState('');
  const [folderName, setFolderName] = useState('ProjectNotes');
  const [accessToken, setAccessToken] = useState('');
  const [email, setEmail] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMode, setSyncMode] = useState('two-way');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const sdkLoaded = useRef(false);

  useEffect(() => {
    setClientId(settings.gdriveClientId || '');
    setFolderName(settings.gdriveFolderName || 'ProjectNotes');
  }, [settings.gdriveClientId, settings.gdriveFolderName]);

  // Load Google Identity Services lazily — only when this dialog is first opened.
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const savedToken = sessionStorage.getItem('gdrive_access_token');
    const savedEmail = sessionStorage.getItem('gdrive_user_email');
    if (savedToken) {
      setAccessToken(savedToken);
      setEmail(savedEmail || '');
    }

    if (window.google || sdkLoaded.current) return;
    sdkLoaded.current = true;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, [isOpen]);

  const fetchUserInfo = useCallback(async (token) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEmail(data.email);
        sessionStorage.setItem('gdrive_user_email', data.email);
      }
    } catch (e) {
      console.error('Error fetching Google profile:', e);
    }
  }, []);

  const connect = () => {
    const id = clientId.trim();
    if (!id) {
      toast.warning('Introduce tu Client ID de Google');
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      toast.warning('El SDK de Google aún se está cargando. Inténtalo de nuevo en unos segundos.');
      return;
    }

    updateSettings({ gdriveClientId: id, gdriveFolderName: folderName.trim() || 'ProjectNotes' });

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: 'https://www.googleapis.com/auth/drive email',
        callback: async (response) => {
          if (!response?.access_token) return;
          setAccessToken(response.access_token);
          sessionStorage.setItem('gdrive_access_token', response.access_token);
          announceAuthChange();
          await fetchUserInfo(response.access_token);
          setError(null);
          toast.success('Conectado a Google Drive');
        },
        error_callback: (err) => {
          console.error('OAuth error:', err);
          toast.error(`Error de autenticación: ${err?.message || 'revisa tu Client ID'}`);
        },
      });
      client.requestAccessToken({ prompt: 'consent' });
    } catch (e) {
      console.error('Token client init failed:', e);
      toast.error('No se pudo inicializar la conexión. Comprueba el formato del Client ID.');
    }
  };

  const disconnect = () => {
    setAccessToken('');
    setEmail('');
    setResult(null);
    setError(null);
    sessionStorage.removeItem('gdrive_access_token');
    sessionStorage.removeItem('gdrive_user_email');
    announceAuthChange();
    toast.info('Desconectado de Google Drive');
  };

  const sync = async () => {
    if (!accessToken) return;

    setSyncing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/sync/gdrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          folderName: folderName.trim() || 'ProjectNotes',
          syncVideos: Boolean(settings.gdriveSyncVideos),
          forceMode: syncMode,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'La sincronización falló');

      setResult(data);
      updateSettings({ gdriveLastSync: new Date().toISOString(), gdriveSyncStats: data.stats });
      onSyncComplete?.();

      // Files changed on disk, so the assistant's index is now stale.
      if (data.stats?.totalProcessed > 0) {
        fetch('/api/knowledge', { method: 'POST' }).catch(() => {});
      }

      // Un fichero que falla no tumba la sincronización, pero tampoco puede
      // pasar por buena: decir «completada» cuando algo se quedó fuera es lo
      // peor que puede hacer una herramienta de sincronización.
      if (data.stats.failed > 0) {
        toast.error(
          `Sincronizados ${data.stats.totalProcessed}, con ${data.stats.failed} ${
            data.stats.failed === 1 ? 'fichero que no pudo transferirse' : 'ficheros que no pudieron transferirse'
          }. Mira el detalle.`
        );
      } else {
        toast.success(
          data.stats.totalProcessed > 0
            ? `Sincronización completada: ${data.stats.totalProcessed} elementos`
            : 'Todo ya estaba sincronizado'
        );
      }
    } catch (err) {
      const message = err.message || 'Error de conexión';
      const scopeProblem = /403|scope|permission|insufficient/i.test(message);

      if (scopeProblem) {
        // The stored token cannot reach Drive; force a fresh consent round.
        disconnect();
        setError(
          'Permisos insuficientes (403). Vuelve a conectar y marca la casilla de acceso a Google Drive en la ventana de Google.'
        );
      } else {
        setError(message);
      }
    } finally {
      setSyncing(false);
    }
  };

  const lastSync = settings.gdriveLastSync
    ? new Date(settings.gdriveLastSync).toLocaleString('es-ES')
    : 'Nunca';

  return (
    <Modal
      isOpen={isOpen}
      onClose={syncing ? () => {} : onClose}
      title="Sincronización con Google Drive"
      icon="cloud"
      size="lg"
      closeOnOverlay={!syncing}
      footer={
        <>
          {accessToken && (
            <button className="btn btn-ghost" onClick={disconnect} disabled={syncing}>
              Desconectar
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose} disabled={syncing}>
            Cerrar
          </button>
          {accessToken && (
            <button className="btn btn-primary" onClick={sync} disabled={syncing}>
              {syncing ? <span className="spinner" /> : <Icon name="refresh" size={15} />}
              {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          )}
        </>
      }
    >
      <div className={`gd-status ${accessToken ? 'connected' : ''}`}>
        <span className="gd-dot" />
        <div className="gd-status-text">
          <strong>{accessToken ? 'Conectado' : 'Sin conectar'}</strong>
          <span>{accessToken ? email || 'Cuenta de Google' : 'Autoriza el acceso para sincronizar'}</span>
        </div>
        <span className="text-xs text-subtle">Última: {lastSync}</span>
      </div>

      {error && (
        <div className="gd-error">
          <Icon name="alert-circle" size={16} />
          <span>{error}</span>
        </div>
      )}

      {!accessToken && (
        <>
          <div className="field">
            <label className="label" htmlFor="gd-client-id">
              Client ID de Google OAuth
            </label>
            <input
              id="gd-client-id"
              className="input mono"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="123456789-abc.apps.googleusercontent.com"
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="gd-folder">
              Carpeta raíz en Drive
            </label>
            <input
              id="gd-folder"
              className="input"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="ProjectNotes"
            />
          </div>

          <button className="btn btn-primary btn-block" onClick={connect}>
            <Icon name="cloud" size={16} />
            Conectar con Google Drive
          </button>

          <button className="gd-help-toggle" onClick={() => setShowHelp((v) => !v)}>
            <Icon name="info" size={14} />
            ¿Cómo obtengo un Client ID?
            <Icon name={showHelp ? 'chevron-up' : 'chevron-down'} size={14} />
          </button>

          {showHelp && (
            <ol className="gd-help">
              <li>
                Entra en{' '}
                <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer">
                  Google Cloud Console
                </a>{' '}
                y crea (o elige) un proyecto.
              </li>
              <li>
                En <em>APIs y servicios → Biblioteca</em>, habilita la <strong>Google Drive API</strong>.
              </li>
              <li>
                En <em>Credenciales</em>, crea un <strong>ID de cliente de OAuth</strong> de tipo
                «Aplicación web».
              </li>
              <li>
                Añade <code>http://localhost:3000</code> a orígenes autorizados de JavaScript.
              </li>
              <li>Copia el Client ID y pégalo arriba.</li>
            </ol>
          )}
        </>
      )}

      {accessToken && (
        <>
          <div className="field">
            <span className="label">Modo de sincronización</span>
            <div className="mode-grid">
              {SYNC_MODES.map((mode) => (
                <button
                  key={mode.id}
                  className={`mode-option ${syncMode === mode.id ? 'active' : ''}`}
                  onClick={() => setSyncMode(mode.id)}
                  aria-pressed={syncMode === mode.id}
                >
                  <Icon name={mode.icon} size={17} />
                  <strong>{mode.label}</strong>
                  <span>{mode.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="gd-autosync">
            <span
              className="switch"
              data-on={String(Boolean(settings.gdriveAutoSync))}
              onClick={() => updateSettings({ gdriveAutoSync: !settings.gdriveAutoSync })}
            />
            <span className="gd-autosync-text">
              <strong>Sincronización automática</strong>
              <span>
                En segundo plano cada{' '}
                <select
                  className="inline-select"
                  value={settings.gdriveAutoSyncInterval || 5}
                  onChange={(e) =>
                    updateSettings({ gdriveAutoSyncInterval: Number(e.target.value) })
                  }
                  onClick={(e) => e.stopPropagation()}
                >
                  {[5, 10, 15, 30, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </span>
            </span>
          </label>

          <label className="gd-autosync">
            <span
              className="switch"
              data-on={String(Boolean(settings.gdriveSyncVideos))}
              onClick={() => updateSettings({ gdriveSyncVideos: !settings.gdriveSyncVideos })}
            />
            <span className="gd-autosync-text">
              <strong>Sincronizar también los vídeos</strong>
              <span>
                Desactivado, las grabaciones se quedan en local y a Drive solo van
                las notas, transcripciones y resúmenes. Una reunión son varios GB
                de vídeo frente a unos KB de transcripción.
              </span>
            </span>
          </label>

          {result && (
            <div className="gd-result">
              <div className="gd-stats">
                <div>
                  <strong>{result.stats.uploaded}</strong>
                  <span>Subidos</span>
                </div>
                <div>
                  <strong>{result.stats.downloaded}</strong>
                  <span>Descargados</span>
                </div>
                <div>
                  <strong>{result.stats.foldersCreatedLocal + result.stats.foldersCreatedDrive}</strong>
                  <span>Carpetas</span>
                </div>
                {result.stats.skipped > 0 && (
                  <div>
                    <strong>{result.stats.skipped}</strong>
                    <span>Vídeos omitidos</span>
                  </div>
                )}
                {result.stats.failed > 0 && (
                  <div className="gd-failed">
                    <strong>{result.stats.failed}</strong>
                    <span>Con error</span>
                  </div>
                )}
              </div>

              {result.failed?.length > 0 && (
                <ul className="gd-failures">
                  {result.failed.map((item) => (
                    <li key={`${item.direction}-${item.path}`}>
                      <Icon name="alert-triangle" size={14} />
                      <span>
                        <code>{item.path}</code> — {item.message}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {result.logs?.length > 0 && (
                <>
                  <button className="gd-help-toggle" onClick={() => setShowLogs((v) => !v)}>
                    <Icon name="list" size={14} />
                    Ver detalle ({result.logs.length})
                    <Icon name={showLogs ? 'chevron-up' : 'chevron-down'} size={14} />
                  </button>
                  {showLogs && <pre className="gd-logs">{result.logs.join('\n')}</pre>}
                </>
              )}
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .gd-status {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          padding: var(--sp-3);
          border-radius: var(--r-md);
          background: var(--surface-2);
        }

        .gd-dot {
          width: 10px;
          height: 10px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--border-strong);
        }

        .gd-status.connected .gd-dot {
          background: var(--success);
          box-shadow: 0 0 0 4px var(--success-soft);
        }

        .gd-status-text {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          font-size: var(--fs-xs);
          color: var(--text-muted);
        }

        .gd-status-text strong {
          font-size: var(--fs-sm);
          color: var(--text);
        }

        .gd-error {
          display: flex;
          align-items: flex-start;
          gap: var(--sp-2);
          padding: var(--sp-3);
          border-radius: var(--r-md);
          background: var(--danger-soft);
          color: var(--danger);
          font-size: var(--fs-sm);
        }

        .gd-help-toggle {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          align-self: flex-start;
          font-size: var(--fs-xs);
          color: var(--accent);
        }

        .gd-help {
          display: flex;
          flex-direction: column;
          gap: var(--sp-2);
          padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-6);
          border-radius: var(--r-md);
          background: var(--surface-2);
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }

        .gd-help a {
          color: var(--accent);
          text-decoration: underline;
        }

        .mode-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--sp-2);
        }

        .mode-option {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: var(--sp-3) var(--sp-2);
          border: 1px solid var(--border);
          border-radius: var(--r-md);
          background: var(--surface-2);
          color: var(--text-muted);
          text-align: center;
          transition: border-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease),
            background var(--dur-fast) var(--ease);
        }

        .mode-option strong {
          font-size: var(--fs-xs);
        }

        .mode-option span {
          font-size: var(--fs-2xs);
          color: var(--text-subtle);
        }

        .mode-option.active {
          border-color: var(--accent);
          background: var(--accent-soft);
          color: var(--accent);
        }

        .gd-autosync {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          padding: var(--sp-3);
          border-radius: var(--r-md);
          background: var(--surface-2);
          cursor: pointer;
        }

        .gd-autosync-text {
          display: flex;
          flex-direction: column;
          font-size: var(--fs-xs);
          color: var(--text-muted);
        }

        .gd-autosync-text strong {
          font-size: var(--fs-sm);
          color: var(--text);
        }

        .inline-select {
          padding: 1px 4px;
          border: 1px solid var(--border);
          border-radius: var(--r-xs);
          background: var(--surface);
          color: var(--text);
          font-size: var(--fs-2xs);
        }

        .gd-result {
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
        }

        .gd-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--sp-2);
        }

        .gd-stats > div {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: var(--sp-3);
          border-radius: var(--r-md);
          background: var(--surface-2);
        }

        .gd-stats strong {
          font-size: var(--fs-xl);
          color: var(--accent);
        }

        .gd-stats span {
          font-size: var(--fs-2xs);
          color: var(--text-subtle);
        }

        .gd-failed strong {
          color: var(--danger);
        }
        .gd-failures {
          list-style: none;
          margin: 12px 0 0;
          padding: 0;
          display: grid;
          gap: 8px;
        }
        .gd-failures li {
          display: flex;
          gap: 8px;
          align-items: flex-start;
          font-size: 12px;
          line-height: 1.5;
          color: var(--danger);
        }
        .gd-failures code {
          color: var(--text);
          word-break: break-all;
        }
        .gd-logs {
          max-height: 200px;
          overflow: auto;
          padding: var(--sp-3);
          border-radius: var(--r-sm);
          background: var(--surface-3);
          font-family: var(--font-mono);
          font-size: var(--fs-2xs);
          line-height: 1.7;
          white-space: pre-wrap;
          color: var(--text-muted);
        }

        @media (max-width: 640px) {
          .mode-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </Modal>
  );
}
