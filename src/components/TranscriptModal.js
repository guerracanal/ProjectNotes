'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function TranscriptModal({ meeting, projectPath, mode = 'transcript', onClose }) {
  const [transcriptJobId, setTranscriptJobId] = useState(null);
  const [summaryJobId, setSummaryJobId] = useState(null);
  const [transcriptStatus, setTranscriptStatus] = useState(null);
  const [summaryStatus, setSummaryStatus] = useState(null);
  const [error, setError] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [transcriptLogs, setTranscriptLogs] = useState('');
  const [summaryLogs, setSummaryLogs] = useState('');
  const logsEndRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    // Bloquear scroll del body cuando el modal está abierto
    document.body.style.overflow = 'hidden';

    return () => {
      setMounted(false);
      // Restaurar scroll del body cuando el modal se cierra
      document.body.style.overflow = 'unset';
    };
  }, []);

  useEffect(() => {
    // Auto-scroll logs to bottom
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptLogs, summaryLogs]);

  // Auto-start summarization if mode is 'summary'
  useEffect(() => {
    if (mode === 'summary' && mounted && !summaryJobId) {
      startSummarization();
    }
  }, [mode, mounted]);

  const startTranscription = async () => {
    try {
      setError(null);
      setTranscriptLogs('Iniciando transcripción...\n');
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoPath: meeting.path })
      });

      if (!response.ok) {
        throw new Error('Failed to start transcription');
      }

      const data = await response.json();
      setTranscriptJobId(data.jobId);
      setTranscriptStatus('pending');
      pollTranscriptStatus(data.jobId);
    } catch (e) {
      setError(e.message);
    }
  };

  const pollTranscriptStatus = async (jobId) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/transcribe?jobId=${jobId}`);
        const data = await response.json();

        setTranscriptStatus(data.status);

        // Update logs
        if (data.stdout || data.stderr) {
          const combinedLogs = `${data.stdout || ''}${data.stderr || ''}`;
          setTranscriptLogs(combinedLogs);
        }

        if (data.status === 'completed') {
          setTranscriptLogs(prev => prev + '\n✅ Transcripción completada exitosamente');
          return;
        } else if (data.status === 'error') {
          setError(data.error || 'Transcription failed');
          setTranscriptLogs(prev => prev + `\n❌ Error: ${data.error || 'Transcription failed'}`);
          return;
        } else {
          // Continue polling
          setTimeout(checkStatus, 2000);
        }
      } catch (e) {
        setError(e.message);
      }
    };

    checkStatus();
  };

  const startSummarization = async () => {
    try {
      setError(null);
      setSummaryLogs('Iniciando generación de resumen...\n');
      const transcriptPath = `${projectPath}/${meeting.baseName}_transcripcion.txt`;

      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptPath })
      });

      if (!response.ok) {
        throw new Error('Failed to start summarization');
      }

      const data = await response.json();
      setSummaryJobId(data.jobId);
      setSummaryStatus('pending');
      pollSummaryStatus(data.jobId);
    } catch (e) {
      setError(e.message);
    }
  };

  const pollSummaryStatus = async (jobId) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/summarize?jobId=${jobId}`);
        const data = await response.json();

        setSummaryStatus(data.status);

        // Update logs
        if (data.stdout || data.stderr) {
          const combinedLogs = `${data.stdout || ''}${data.stderr || ''}`;
          setSummaryLogs(combinedLogs);
        }

        if (data.status === 'completed') {
          setSummaryLogs(prev => prev + '\n✅ Resumen generado exitosamente');
          return;
        } else if (data.status === 'error') {
          setError(data.error || 'Summarization failed');
          setSummaryLogs(prev => prev + `\n❌ Error: ${data.error || 'Summarization failed'}`);
          return;
        } else {
          // Continue polling
          setTimeout(checkStatus, 2000);
        }
      } catch (e) {
        setError(e.message);
      }
    };

    checkStatus();
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  if (!mounted) return null;

  const currentLogs = summaryJobId ? summaryLogs : transcriptLogs;
  const showLogs = transcriptJobId || summaryJobId;

  const modalContent = (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'summary' ? 'Summary Generation' : 'Transcript Generation'}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p className="meeting-name">{meeting.baseName}</p>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          {!transcriptJobId && mode !== 'summary' && (
            <div className="action-section">
              <p>Generate transcript for this meeting video?</p>
              <button className="btn btn-primary" onClick={startTranscription}>
                Start Transcription
              </button>
            </div>
          )}

          {transcriptJobId && (
            <div className="status-section">
              <h3>Transcription Status</h3>
              <div className={`status-badge status-${transcriptStatus}`}>
                {transcriptStatus === 'pending' && '⏳ Queued...'}
                {transcriptStatus === 'running' && '▶️ Processing...'}
                {transcriptStatus === 'completed' && '✅ Completed'}
                {transcriptStatus === 'error' && '❌ Failed'}
              </div>
            </div>
          )}

          {transcriptStatus === 'completed' && !summaryJobId && (
            <div className="action-section">
              <p>Transcript generated successfully! Generate summary?</p>
              <button className="btn btn-primary" onClick={startSummarization}>
                Generate Summary
              </button>
            </div>
          )}

          {summaryJobId && (
            <div className="status-section">
              <h3>Summary Status</h3>
              <div className={`status-badge status-${summaryStatus}`}>
                {summaryStatus === 'pending' && '⏳ Queued...'}
                {summaryStatus === 'running' && '▶️ Processing...'}
                {summaryStatus === 'completed' && '✅ Completed'}
                {summaryStatus === 'error' && '❌ Failed'}
              </div>
            </div>
          )}

          {showLogs && (
            <div className="logs-section">
              <h3>Process Logs</h3>
              <div className="logs-container">
                <pre className="logs-content">{currentLogs}</pre>
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {summaryStatus === 'completed' && (
            <div className="action-section">
              <p>✅ Summary generated successfully!</p>
              <button className="btn btn-primary" onClick={handleRefresh}>
                Refresh Page
              </button>
            </div>
          )}
        </div>

        <style jsx>{`
          .modal-overlay {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2147483647;
            backdrop-filter: blur(8px);
            padding: 1rem;
            overflow-y: auto;
            animation: fadeIn 0.2s ease-out;
            margin: 0 !important;
            inset: 0 !important;
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes slideIn {
            from {
              transform: translateY(-20px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }

          .modal-content {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            max-width: 700px;
            width: 100%;
            max-height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 25px 75px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.05);
            position: relative;
            overflow: hidden;
            margin: auto;
            animation: slideIn 0.3s ease-out;
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem;
            border-bottom: 1px solid var(--border-color);
            flex-shrink: 0;
            background: var(--bg-secondary);
            position: sticky;
            top: 0;
            z-index: 10;
          }

          .modal-header h2 {
            color: var(--text-primary);
            font-size: 1.25rem;
            font-weight: 600;
            margin: 0;
          }

          .close-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            font-size: 1.5rem;
            cursor: pointer;
            padding: 0;
            width: 2rem;
            height: 2rem;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            border-radius: 8px;
          }

          .close-btn:hover {
            color: var(--text-primary);
            background: rgba(255, 255, 255, 0.1);
            transform: scale(1.1);
          }

          .modal-body {
            padding: 1.5rem;
            overflow-y: auto;
            flex: 1;
          }

          .meeting-name {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-bottom: 1.5rem;
            font-family: monospace;
            background: rgba(0, 0, 0, 0.3);
            padding: 0.75rem 1rem;
            border-radius: 8px;
            border: 1px solid var(--border-color);
          }

          .action-section, .status-section {
            margin: 1.5rem 0;
          }

          .status-section h3 {
            font-size: 0.85rem;
            color: var(--text-secondary);
            margin-bottom: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
          }

          .status-badge {
            padding: 0.75rem 1rem;
            border-radius: 10px;
            font-weight: 500;
            text-align: center;
            font-size: 0.95rem;
            animation: slideIn 0.3s ease-out;
          }

          .status-pending, .status-running {
            background: rgba(255, 193, 7, 0.15);
            color: #ffc107;
            border: 1px solid rgba(255, 193, 7, 0.3);
          }

          .status-running {
            animation: pulse 2s ease-in-out infinite;
          }

          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.7;
            }
          }

          .status-completed {
            background: rgba(76, 175, 80, 0.15);
            color: #4caf50;
            border: 1px solid rgba(76, 175, 80, 0.3);
          }

          .status-error {
            background: rgba(244, 67, 54, 0.15);
            color: #f44336;
            border: 1px solid rgba(244, 67, 54, 0.3);
          }

          .error-message {
            background: rgba(244, 67, 54, 0.15);
            color: #f44336;
            padding: 1rem;
            border-radius: 10px;
            margin-bottom: 1rem;
            border: 1px solid rgba(244, 67, 54, 0.3);
            animation: slideIn 0.3s ease-out;
          }

          .action-section p {
            color: var(--text-primary);
            margin-bottom: 1rem;
            font-size: 0.95rem;
          }

          .logs-section {
            margin: 1.5rem 0;
          }

          .logs-section h3 {
            font-size: 0.85rem;
            color: var(--text-secondary);
            margin-bottom: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
          }

          .logs-container {
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 1rem;
            max-height: 300px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
          }

          .logs-content {
            margin: 0;
            color: var(--text-secondary);
            white-space: pre-wrap;
            word-wrap: break-word;
            line-height: 1.5;
          }

          /* Custom scrollbar for logs */
          .logs-container::-webkit-scrollbar {
            width: 8px;
          }

          .logs-container::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 10px;
          }

          .logs-container::-webkit-scrollbar-thumb {
            background: var(--border-color);
            border-radius: 10px;
          }

          .logs-container::-webkit-scrollbar-thumb:hover {
            background: var(--text-secondary);
          }

          /* Custom scrollbar for modal body */
          .modal-body::-webkit-scrollbar {
            width: 8px;
          }

          .modal-body::-webkit-scrollbar-track {
            background: transparent;
          }

          .modal-body::-webkit-scrollbar-thumb {
            background: var(--border-color);
            border-radius: 10px;
          }

          .modal-body::-webkit-scrollbar-thumb:hover {
            background: var(--text-secondary);
          }

          /* Responsive adjustments */
          @media (max-width: 768px) {
            .modal-overlay {
              padding: 0.5rem;
            }

            .modal-content {
              max-height: 95vh;
              border-radius: 12px;
            }

            .modal-header {
              padding: 1rem;
            }

            .modal-body {
              padding: 1rem;
            }
          }
                `}</style>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
