'use client';

import { useState, useEffect, useRef } from 'react';
import { useSettings } from '@/contexts/SettingsContext';

export default function GoogleDriveModal({ isOpen, onClose, onSyncComplete }) {
    const { settings, updateSettings } = useSettings();
    const [clientIdInput, setClientIdInput] = useState(settings.gdriveClientId || '');
    const [folderNameInput, setFolderNameInput] = useState(settings.gdriveFolderName || 'ProjectNotes');
    const [accessToken, setAccessToken] = useState('');
    const [email, setEmail] = useState('');
    const [tokenExpiry, setTokenExpiry] = useState(null);
    
    // Sync states
    const [syncing, setSyncing] = useState(false);
    const [syncMode, setSyncMode] = useState('two-way'); // 'two-way', 'upload', 'download'
    const [syncResult, setSyncResult] = useState(null); // { success: boolean, stats: {}, logs: [] }
    const [syncError, setSyncError] = useState(null);
    const [showHelp, setShowHelp] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const logsEndRef = useRef(null);

    // Dynamic Google API Script Load + Load Client ID from env
    useEffect(() => {
        if (typeof window === 'undefined') return;
        
        // Restore token and user info from localStorage (persists between sessions)
        const savedToken = localStorage.getItem('gdrive_access_token');
        const savedEmail = localStorage.getItem('gdrive_user_email');
        const savedExpiry = localStorage.getItem('gdrive_token_expiry');
        
        if (savedToken && savedEmail) {
            // Check if token is expired
            if (savedExpiry && new Date(savedExpiry) > new Date()) {
                setAccessToken(savedToken);
                setEmail(savedEmail);
                setTokenExpiry(savedExpiry);
            } else {
                // Token expired, clear stored credentials
                localStorage.removeItem('gdrive_access_token');
                localStorage.removeItem('gdrive_user_email');
                localStorage.removeItem('gdrive_token_expiry');
            }
        }

        // Load Client ID from environment if available
        const loadClientIdFromEnv = async () => {
            try {
                const response = await fetch('/api/config');
                if (response.ok) {
                    const config = await response.json();
                    if (config.googleOAuthClientId && !clientIdInput) {
                        setClientIdInput(config.googleOAuthClientId);
                        updateSettings({ gdriveClientId: config.googleOAuthClientId });
                    }
                }
            } catch (e) {
                console.error('Error loading config from API:', e);
            }
        };
        
        loadClientIdFromEnv();

        if (window.google) return;

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
    }, []);

    // Scroll sync logs to bottom
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [syncResult]);

    if (!isOpen) return null;

    const fetchUserInfo = async (token) => {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setEmail(data.email);
                // Persist email in localStorage
                localStorage.setItem('gdrive_user_email', data.email);
                return data.email;
            }
        } catch (e) {
            console.error('Error fetching Google user profile:', e);
        }
        return '';
    };

    const handleConnect = () => {
        if (!clientIdInput.trim()) {
            alert('Por favor, introduce un Client ID de Google.');
            return;
        }

        if (!window.google) {
            alert('El SDK de Google se está cargando. Inténtalo de nuevo en unos instantes.');
            return;
        }

        // Save Client ID first
        updateSettings({ 
            gdriveClientId: clientIdInput.trim(),
            gdriveFolderName: folderNameInput.trim()
        });

        try {
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientIdInput.trim(),
                scope: 'https://www.googleapis.com/auth/drive email',
                callback: async (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        setAccessToken(tokenResponse.access_token);
                        // Persist token to localStorage (survives session restarts)
                        localStorage.setItem('gdrive_access_token', tokenResponse.access_token);
                        
                        // Calculate and store expiry time (tokens expire in ~1 hour)
                        const expiryTime = new Date();
                        expiryTime.setSeconds(expiryTime.getSeconds() + (tokenResponse.expires_in || 3599));
                        setTokenExpiry(expiryTime.toISOString());
                        localStorage.setItem('gdrive_token_expiry', expiryTime.toISOString());
                        
                        await fetchUserInfo(tokenResponse.access_token);
                        setSyncError(null);
                    }
                },
                error_callback: (err) => {
                    console.error('OAuth Error:', err);
                    alert(`Error de autenticación: ${err.message || 'Verifica tu Client ID'}`);
                }
            });

            tokenClient.requestAccessToken({ prompt: 'consent' });
        } catch (e) {
            console.error('Failed to init token client:', e);
            alert('No se pudo inicializar la conexión. Comprueba que el Client ID tiene un formato correcto.');
        }
    };

    const handleDisconnect = () => {
        setAccessToken('');
        setEmail('');
        setTokenExpiry(null);
        // Clear both localStorage and sessionStorage
        localStorage.removeItem('gdrive_access_token');
        localStorage.removeItem('gdrive_user_email');
        localStorage.removeItem('gdrive_token_expiry');
        sessionStorage.removeItem('gdrive_access_token');
        sessionStorage.removeItem('gdrive_user_email');
        setSyncResult(null);
        setSyncError(null);
    };

    const handleSync = async () => {
        if (!accessToken) return;

        setSyncing(true);
        setSyncError(null);
        setSyncResult(null);

        try {
            const response = await fetch('/api/sync/gdrive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessToken,
                    folderName: folderNameInput.trim(),
                    forceMode: syncMode
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Ocurrió un error en la sincronización');
            }

            setSyncResult(data);
            
            // Save last sync stats in global settings
            const lastSyncTime = new Date().toISOString();
            updateSettings({
                gdriveLastSync: lastSyncTime,
                gdriveSyncStats: data.stats
            });

            // Trigger reactive sidebar list reload
            if (onSyncComplete) {
                onSyncComplete();
            }

        } catch (err) {
            console.error('Sync process error:', err);
            const errMsg = err.message || '';
            const isScopeError = errMsg.includes('403') || 
                                 errMsg.toLowerCase().includes('scope') || 
                                 errMsg.toLowerCase().includes('permission') || 
                                 errMsg.toLowerCase().includes('insufficient');
            
            if (isScopeError) {
                setAccessToken('');
                setEmail('');
                setTokenExpiry(null);
                // Clear both localStorage and sessionStorage
                localStorage.removeItem('gdrive_access_token');
                localStorage.removeItem('gdrive_user_email');
                localStorage.removeItem('gdrive_token_expiry');
                sessionStorage.removeItem('gdrive_access_token');
                sessionStorage.removeItem('gdrive_user_email');
                setSyncResult(null);
                setSyncError('Error de permisos (403): Tu token no tiene acceso a Google Drive. Vuelve a conectar asegurándote de marcar la casilla de verificación en el popup de Google.');
            } else {
                setSyncError(errMsg || 'Error de conexión');
            }
        } finally {
            setSyncing(false);
        }
    };

    const formatSyncDate = (isoString) => {
        if (!isoString) return 'Nunca';
        const date = new Date(isoString);
        return date.toLocaleString();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-panel" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>☁️ Google Drive Sync</h2>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    {/* Global Error Banner */}
                    {syncError && (
                        <div className="error-alert animate-fade-in" style={{ marginBottom: '1.5rem' }}>
                            <p>⚠️ <strong>Error de Sincronización:</strong> {syncError}</p>
                            {(syncError.includes('403') || syncError.toLowerCase().includes('scope') || syncError.toLowerCase().includes('permission') || syncError.toLowerCase().includes('insufficient')) && (
                                <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', fontSize: '0.85rem', borderLeft: '3px solid var(--warning)' }}>
                                    <p style={{ fontWeight: 'bold', color: '#ff8a80', marginBottom: '0.25rem' }}>💡 ¿Cómo solucionarlo?</p>
                                    <ol style={{ paddingLeft: '1.2rem', margin: 0, color: 'var(--text-secondary)' }}>
                                        <li style={{ marginBottom: '0.25rem' }}>Haz clic en <strong>"Conectar con Google Drive"</strong> para abrir la ventana de Google.</li>
                                        <li style={{ marginBottom: '0.25rem' }}>En la pantalla de inicio de sesión de Google, **marca manualmente la casilla de verificación** que dice: <em>"Ver, editar, crear y eliminar todos tus archivos de Google Drive"</em>.</li>
                                        <li>Haz clic en <strong>"Continuar"</strong>.</li>
                                    </ol>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Connection Panel */}
                    {!accessToken ? (
                        <div className="setup-panel animate-fade-in">
                            <p className="description-text">
                                Conecta tu cuenta de Google Drive para sincronizar automáticamente tus proyectos, notas y multimedia de forma bidireccional entre varios equipos.
                            </p>

                            <div className="form-group">
                                <label>Google OAuth Client ID:</label>
                                <input
                                    type="text"
                                    placeholder="xxxxxxxx-xxxxxxxx.apps.googleusercontent.com"
                                    value={clientIdInput}
                                    onChange={(e) => setClientIdInput(e.target.value)}
                                    className="input-field"
                                />
                            </div>

                            <div className="help-toggle" onClick={() => setShowHelp(!showHelp)}>
                                {showHelp ? '🔽 Ocultar instrucciones de configuración' : '▶️ ¿Cómo conseguir mi Client ID en 2 minutos?'}
                            </div>

                            {showHelp && (
                                <div className="help-box animate-fade-in">
                                    <ol>
                                        <li>Ve a <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>.</li>
                                        <li>Crea un nuevo proyecto e introduce el nombre.</li>
                                        <li>Busca <strong>"Google Drive API"</strong> en la barra superior y actívala.</li>
                                        <li>En <strong>"Pantalla de consentimiento de OAuth"</strong> añade el alcance de <code>auth/drive</code>.</li>
                                        <li>Ve a <strong>"Credenciales"</strong> → <strong>"+ Crear credenciales"</strong> → <strong>"ID de cliente de OAuth"</strong>.</li>
                                        <li>Selecciona <em>"Aplicación web"</em>.</li>
                                        <li>En <strong>"Orígenes de JavaScript autorizados"</strong> añade: <code>http://localhost:3000</code></li>
                                        <li>Haz clic en <strong>Crear</strong>, copia tu Client ID y pégalo aquí.</li>
                                        <li style={{ color: 'var(--warning)', marginTop: '0.5rem', fontWeight: 600 }}>⚠️ NOTA CRÍTICA: Al conectar por primera vez, Google te mostrará una ventana emergente. Es IMPRESCINDIBLE que marques manualmente la casilla para permitir el acceso a Google Drive antes de hacer clic en "Continuar". De lo contrario, recibirás un error de permisos.</li>
                                    </ol>
                                </div>
                            )}

                            <button className="btn btn-primary w-full connect-btn" onClick={handleConnect}>
                                Conectar con Google Drive
                            </button>
                        </div>
                    ) : (
                        <div className="sync-panel animate-fade-in">
                            {/* Connection Status Badge */}
                            <div className="status-badge-container">
                                <div className="status-badge">
                                    <span className="dot online"></span>
                                    <span>Conectado como: <strong>{email}</strong></span>
                                </div>
                                <button className="disconnect-btn-link" onClick={handleDisconnect}>
                                    Desconectar
                                </button>
                            </div>

                            {/* Sync Status Cards */}
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <span className="stat-label">Último Sync</span>
                                    <span className="stat-value">{formatSyncDate(settings.gdriveLastSync)}</span>
                                </div>
                                <div className="stat-card">
                                    <span className="stat-label">Estado</span>
                                    <span className={`stat-value ${syncing ? 'syncing-text' : 'ready-text'}`}>
                                        {syncing ? 'Sincronizando...' : 'Listo'}
                                    </span>
                                </div>
                            </div>

                            {/* Sync Button Action */}
                            <div className="sync-action-box">
                                <button 
                                    className={`btn btn-primary sync-large-btn ${syncing ? 'btn-disabled' : ''}`}
                                    onClick={handleSync}
                                    disabled={syncing}
                                >
                                    {syncing ? (
                                        <>
                                            <span className="spinner"></span>
                                            Sincronizando archivos...
                                        </>
                                    ) : 'Sincronizar Proyectos Ahora'}
                                </button>
                            </div>

                            {/* Live Result Feedback */}

                            {syncResult && (
                                <div className="success-alert animate-fade-in">
                                    <p>✨ <strong>¡Sincronización Completada!</strong></p>
                                    <div className="stats-summary-inline">
                                        <span>Subidos: {syncResult.stats.uploaded}</span>
                                        <span>Descargados: {syncResult.stats.downloaded}</span>
                                        <span>Carpetas creadas: {syncResult.stats.foldersCreatedLocal + syncResult.stats.foldersCreatedDrive}</span>
                                    </div>
                                </div>
                            )}

                            {/* Sync Logs */}
                            {syncResult && syncResult.logs.length > 0 && (
                                <div className="logs-container animate-fade-in">
                                    <h4>Registro de Operaciones:</h4>
                                    <div className="logs-viewport">
                                        {syncResult.logs.map((log, index) => (
                                            <div key={index} className="log-line">
                                                {log}
                                            </div>
                                        ))}
                                        <div ref={logsEndRef} />
                                    </div>
                                </div>
                            )}

                            {/* Toggle Advanced */}
                            <div className="advanced-toggle" onClick={() => setShowAdvanced(!showAdvanced)}>
                                {showAdvanced ? '⚙️ Ocultar Opciones Avanzadas' : '⚙️ Mostrar Opciones Avanzadas'}
                            </div>

                            {showAdvanced && (
                                <div className="advanced-box animate-fade-in">
                                    <div className="form-group">
                                        <label>Nombre de la carpeta en Drive:</label>
                                        <input
                                            type="text"
                                            value={folderNameInput}
                                            onChange={(e) => {
                                                setFolderNameInput(e.target.value);
                                                updateSettings({ gdriveFolderName: e.target.value });
                                            }}
                                            className="input-field"
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Modo de Sincronización:</label>
                                        <select 
                                            value={syncMode} 
                                            onChange={(e) => setSyncMode(e.target.value)}
                                            className="input-field"
                                        >
                                            <option value="two-way">Bidireccional (Compara fechas, recomendado)</option>
                                            <option value="upload">Forzar Subida (Sobrescribe todo en Google Drive)</option>
                                            <option value="download">Forzar Descarga (Sobrescribe todo localmente)</option>
                                        </select>
                                    </div>

                                    <div className="checkbox-group">
                                        <label className="checkbox-label">
                                            <input
                                                type="checkbox"
                                                checked={settings.gdriveAutoSync || false}
                                                onChange={(e) => updateSettings({ gdriveAutoSync: e.target.checked })}
                                            />
                                            Activar Auto-Sincronización en segundo plano
                                        </label>
                                    </div>

                                    {settings.gdriveAutoSync && (
                                        <div className="form-group" style={{ marginTop: '0.5rem' }}>
                                            <label>Frecuencia de Auto-Sync (minutos):</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="60"
                                                value={settings.gdriveAutoSyncInterval || 5}
                                                onChange={(e) => updateSettings({ gdriveAutoSyncInterval: parseInt(e.target.value) || 5 })}
                                                className="input-field"
                                                style={{ width: '80px' }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <style jsx>{`
                    .modal-overlay {
                        position: fixed;
                        inset: 0;
                        background: rgba(0, 0, 0, 0.75);
                        backdrop-filter: blur(8px);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        z-index: 2001;
                    }

                    .modal-content {
                        width: 90%;
                        max-width: 580px;
                        max-height: 85vh;
                        overflow-y: auto;
                        display: flex;
                        flex-direction: column;
                        padding: 2rem;
                        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
                    }

                    .modal-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 1.5rem;
                        border-bottom: 1px solid var(--border-color);
                        padding-bottom: 1rem;
                    }

                    .modal-header h2 {
                        font-size: 1.4rem;
                        color: var(--text-primary);
                        font-weight: 700;
                    }

                    .close-btn {
                        background: none;
                        border: none;
                        color: var(--text-secondary);
                        cursor: pointer;
                        font-size: 1.2rem;
                        padding: 0.25rem;
                        transition: color 0.2s;
                    }

                    .close-btn:hover {
                        color: var(--text-primary);
                    }

                    .description-text {
                        color: var(--text-secondary);
                        font-size: 0.95rem;
                        line-height: 1.5;
                        margin-bottom: 1.5rem;
                    }

                    .form-group {
                        margin-bottom: 1.25rem;
                    }

                    .form-group label {
                        display: block;
                        color: var(--text-secondary);
                        font-size: 0.85rem;
                        margin-bottom: 0.5rem;
                        font-weight: 500;
                    }

                    .input-field {
                        width: 100%;
                        padding: 0.75rem;
                        background: var(--bg-tertiary);
                        border: 1px solid var(--border-color);
                        border-radius: 8px;
                        color: var(--text-primary);
                        font-size: 0.95rem;
                        transition: border-color 0.2s;
                    }

                    .input-field:focus {
                        outline: none;
                        border-color: var(--accent-primary);
                    }

                    .help-toggle {
                        color: var(--accent-secondary);
                        font-size: 0.85rem;
                        cursor: pointer;
                        margin-bottom: 1.25rem;
                        font-weight: 500;
                        user-select: none;
                        transition: color 0.2s;
                    }

                    .help-toggle:hover {
                        color: var(--accent-primary);
                    }

                    .help-box {
                        background: rgba(255, 255, 255, 0.02);
                        border: 1px solid var(--border-color);
                        border-radius: 8px;
                        padding: 1rem;
                        margin-bottom: 1.5rem;
                        font-size: 0.85rem;
                        color: var(--text-secondary);
                        max-height: 200px;
                        overflow-y: auto;
                    }

                    .help-box ol {
                        padding-left: 1.25rem;
                    }

                    .help-box li {
                        margin-bottom: 0.5rem;
                        line-height: 1.4;
                    }

                    .help-box a {
                        color: var(--accent-secondary);
                        text-decoration: underline;
                    }

                    .w-full {
                        width: 100%;
                    }

                    .connect-btn {
                        padding: 0.85rem;
                        font-weight: 600;
                    }

                    /* Sync Panel Styles */
                    .status-badge-container {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        background: rgba(255, 255, 255, 0.03);
                        border: 1px solid var(--border-color);
                        border-radius: 8px;
                        padding: 0.75rem 1rem;
                        margin-bottom: 1.5rem;
                    }

                    .status-badge {
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        font-size: 0.9rem;
                    }

                    .dot {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                    }

                    .dot.online {
                        background-color: var(--success);
                        box-shadow: 0 0 8px var(--success);
                    }

                    .disconnect-btn-link {
                        background: none;
                        border: none;
                        color: var(--error);
                        font-size: 0.85rem;
                        cursor: pointer;
                        text-decoration: underline;
                        padding: 0;
                    }

                    .stats-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 1rem;
                        margin-bottom: 1.5rem;
                    }

                    .stat-card {
                        background: var(--bg-secondary);
                        border: 1px solid var(--border-color);
                        border-radius: 8px;
                        padding: 0.75rem;
                        display: flex;
                        flex-direction: column;
                        gap: 0.25rem;
                    }

                    .stat-label {
                        font-size: 0.75rem;
                        color: var(--text-secondary);
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                    }

                    .stat-value {
                        font-size: 0.95rem;
                        color: var(--text-primary);
                        font-weight: 600;
                    }

                    .syncing-text {
                        color: var(--warning);
                    }

                    .ready-text {
                        color: var(--success);
                    }

                    .sync-action-box {
                        margin-bottom: 1.5rem;
                    }

                    .sync-large-btn {
                        width: 100%;
                        padding: 1rem;
                        font-size: 1rem;
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 0.75rem;
                    }

                    .btn-disabled {
                        opacity: 0.6;
                        cursor: not-allowed;
                    }

                    .spinner {
                        width: 18px;
                        height: 18px;
                        border: 2px solid rgba(255, 255, 255, 0.3);
                        border-top-color: white;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }

                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }

                    .error-alert {
                        background: rgba(239, 68, 68, 0.1);
                        border: 1px solid var(--error);
                        color: #f87171;
                        padding: 0.75rem 1rem;
                        border-radius: 8px;
                        font-size: 0.9rem;
                        margin-bottom: 1.5rem;
                    }

                    .success-alert {
                        background: rgba(16, 185, 129, 0.1);
                        border: 1px solid var(--success);
                        color: #a7f3d0;
                        padding: 0.75rem 1rem;
                        border-radius: 8px;
                        font-size: 0.9rem;
                        margin-bottom: 1.5rem;
                    }

                    .stats-summary-inline {
                        display: flex;
                        gap: 1rem;
                        font-size: 0.8rem;
                        margin-top: 0.25rem;
                        color: var(--text-secondary);
                    }

                    .logs-container {
                        margin-bottom: 1.5rem;
                    }

                    .logs-container h4 {
                        font-size: 0.85rem;
                        color: var(--text-secondary);
                        margin-bottom: 0.5rem;
                    }

                    .logs-viewport {
                        background: var(--bg-primary);
                        border: 1px solid var(--border-color);
                        border-radius: 8px;
                        padding: 0.75rem;
                        font-family: monospace;
                        font-size: 0.8rem;
                        max-height: 160px;
                        overflow-y: auto;
                        color: #6ee7b7;
                    }

                    .log-line {
                        margin-bottom: 0.25rem;
                        white-space: pre-wrap;
                    }

                    .advanced-toggle {
                        text-align: center;
                        color: var(--text-secondary);
                        font-size: 0.8rem;
                        cursor: pointer;
                        padding: 0.5rem;
                        user-select: none;
                    }

                    .advanced-toggle:hover {
                        color: var(--text-primary);
                    }

                    .advanced-box {
                        background: rgba(255, 255, 255, 0.01);
                        border: 1px solid var(--border-color);
                        border-radius: 8px;
                        padding: 1rem;
                        margin-top: 0.75rem;
                    }

                    .checkbox-group {
                        margin-top: 0.75rem;
                    }

                    .checkbox-label {
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        color: var(--text-secondary);
                        font-size: 0.85rem;
                        cursor: pointer;
                    }

                    .checkbox-label input {
                        cursor: pointer;
                    }
                `}</style>
            </div>
        </div>
    );
}
