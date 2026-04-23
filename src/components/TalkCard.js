'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function TalkCard({ talk }) {
    const hasVideo = talk.video && talk.video.length > 0;
    const hasSlides = talk.slides && talk.slides.length > 0;

    return (
        <div className="talk-card glass-panel">
            <div className="talk-header">
                <div className="talk-title-row">
                    <h3>{talk.title}</h3>
                    {talk.date && <span className="talk-date">{talk.date}</span>}
                </div>

                {/* Summary Section */}
                {talk.summary && (
                    <div className="talk-summary">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {talk.summary}
                        </ReactMarkdown>
                    </div>
                )}

                {/* Links Section */}
                <div className="talk-links-section">
                    {/* Documentation Link */}
                    {talk.link && (
                        <a href={talk.link} target="_blank" rel="noopener noreferrer" className="talk-link-btn doc-link">
                            🔗 Documentación
                        </a>
                    )}

                    {/* Notes Link */}
                    {talk.notes && (
                        <a href={talk.notes} target="_blank" rel="noopener noreferrer" className="talk-link-btn notes-link">
                            📝 Notas
                        </a>
                    )}

                    {/* Custom Links */}
                    {talk.customLinks && talk.customLinks.map((link, index) => (
                        <a
                            key={index}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="talk-link-btn custom-link"
                        >
                            🔗 {link.label}
                        </a>
                    ))}

                    {/* Slides Links */}
                    {hasSlides && (
                        <div className="media-group">
                            <span className="media-label">Slides:</span>
                            <div className="media-links">
                                {talk.slides.map((slide, index) => (
                                    <a
                                        key={index}
                                        href={slide}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="talk-link-btn slides-link"
                                    >
                                        📑 {talk.slides.length > 1 ? `Slides ${index + 1}` : 'Ver Slides'}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Video Links */}
                    {hasVideo && (
                        <div className="media-group">
                            <span className="media-label">Video:</span>
                            <div className="media-links">
                                {talk.video.map((vid, index) => (
                                    <a
                                        key={index}
                                        href={vid}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="talk-link-btn video-link"
                                    >
                                        🎥 {talk.video.length > 1 ? `Video ${index + 1}` : 'Ver Video'}
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .talk-card {
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 12px;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    padding: 1.5rem;
                    transition: transform 0.2s, box-shadow 0.2s;
                }

                .talk-card:hover {
                    border-color: var(--accent-primary);
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                }

                .talk-title-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 1rem;
                    margin-bottom: 0.5rem;
                }

                .talk-card h3 {
                    margin: 0;
                    font-size: 1.25rem;
                    color: var(--text-primary);
                    line-height: 1.4;
                }

                .talk-date {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    background: rgba(255, 255, 255, 0.05);
                    padding: 0.25rem 0.75rem;
                    border-radius: 20px;
                    white-space: nowrap;
                    border: 1px solid var(--border-color);
                }

                .talk-summary {
                    background: var(--bg-secondary);
                    padding: 1rem;
                    border-radius: 8px;
                    font-size: 0.95rem;
                    color: var(--text-secondary);
                    line-height: 1.6;
                    max-height: 150px; /* Altura máxima para el resumen */
                    overflow-y: auto;  /* Scroll vertical si excede */
                }

                /* Scrollbar styling for summary */
                .talk-summary::-webkit-scrollbar {
                    width: 6px;
                }
                .talk-summary::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.02);
                }
                .talk-summary::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                }
                .talk-summary::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .talk-summary :global(p) {
                    margin: 0 0 0.5rem 0;
                }
                
                .talk-summary :global(p:last-child) {
                    margin: 0;
                }

                .talk-summary :global(ul) {
                    margin: 0;
                    padding-left: 1.2rem;
                }

                .talk-links-section {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    margin-top: 0.5rem;
                }

                .media-group {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding-top: 0.5rem;
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                }

                .media-label {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    min-width: 50px;
                    font-weight: 500;
                }

                .media-links {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }

                .talk-link-btn {
                    font-size: 0.85rem;
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.4rem;
                    padding: 0.4rem 0.8rem;
                    border-radius: 6px;
                    transition: all 0.2s;
                    border: 1px solid transparent;
                }

                .talk-link-btn:hover {
                    transform: translateY(-1px);
                }

                .doc-link {
                    color: #60a5fa;
                    background: rgba(96, 165, 250, 0.1);
                    align-self: flex-start;
                }
                .doc-link:hover {
                    background: rgba(96, 165, 250, 0.2);
                    border-color: rgba(96, 165, 250, 0.3);
                }

                .notes-link {
                    color: #f472b6;
                    background: rgba(244, 114, 182, 0.1);
                    align-self: flex-start;
                }
                .notes-link:hover {
                    background: rgba(244, 114, 182, 0.2);
                    border-color: rgba(244, 114, 182, 0.3);
                }

                .slides-link {
                    color: #fbbf24;
                    background: rgba(251, 191, 36, 0.1);
                }
                .slides-link:hover {
                    background: rgba(251, 191, 36, 0.2);
                    border-color: rgba(251, 191, 36, 0.3);
                }

                .video-link {
                    color: #34d399;
                    background: rgba(52, 211, 153, 0.1);
                }
                .video-link:hover {
                    background: rgba(52, 211, 153, 0.2);
                    border-color: rgba(52, 211, 153, 0.3);
                }

                .custom-link {
                    color: #a78bfa;
                    background: rgba(167, 139, 250, 0.1);
                    align-self: flex-start;
                }
                .custom-link:hover {
                    background: rgba(167, 139, 250, 0.2);
                    border-color: rgba(167, 139, 250, 0.3);
                }

                @media (max-width: 768px) {
                    .talk-title-row {
                        flex-direction: column;
                        gap: 0.5rem;
                    }
                    .media-group {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 0.5rem;
                    }
                }
            `}</style>
        </div>
    );
}
