'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ProjectCard from './ProjectCard';
import TaskEditor from './TaskEditor';
import TranscriptModal from './TranscriptModal';
import ImageLightbox from './ImageLightbox';
import TalkCard from './TalkCard';
import MarkdownToolbar from './MarkdownToolbar';
import { parseTalks } from '../lib/talks-parser';
import { useSettings } from '@/contexts/SettingsContext';

export default function ProjectView({ projectPath, subprojects, files, description, tasks, meetings, links }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tabFromUrl = searchParams.get('tab') || 'overview';
    const { settings } = useSettings();

    const [activeTab, setActiveTab] = useState(tabFromUrl);
    const [noteContent, setNoteContent] = useState('');
    const [activeNote, setActiveNote] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showTranscriptModal, setShowTranscriptModal] = useState(false);
    const [selectedMeeting, setSelectedMeeting] = useState(null);
    const [modalMode, setModalMode] = useState('transcript');
    const [viewMode, setViewMode] = useState('edit'); // 'edit' or 'preview'
    const [driveLinks, setDriveLinks] = useState([]);
    const [newLinkTitle, setNewLinkTitle] = useState('');
    const [newLinkUrl, setNewLinkUrl] = useState('');
    const [isSavingLink, setIsSavingLink] = useState(false);
    const [showTranscripts, setShowTranscripts] = useState(false);

    // Images tab states
    const [images, setImages] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // Lightbox states
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);

    const textareaRef = useRef(null);

    // Filter for notes (txt/md files)
    const notes = files.filter(f => {
        const isTxtOrMd = f.name.endsWith('.txt') || f.name.endsWith('.md');
        if (!isTxtOrMd) return false;

        // Exclude documents.md
        if (f.name === 'documents.md') return false;

        // Include special files that were previously excluded
        if (f.name === 'links.md' || f.name === 'tasks.md' || f.name === 'description.md') {
            return true;
        }

        // Handle transcript files based on toggle
        // Matches both: _transcripcion.txt and _transcripcion_resumen.txt
        const isTranscript = f.name.includes('transcripcion');
        if (isTranscript) {
            return showTranscripts;
        }

        return true;
    });

    // Filter for documents (pdf, doc, docx)
    const documents = files.filter(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);
    });

    // Redirect if on meetings tab and it gets hidden
    useEffect(() => {
        if (activeTab === 'meetings' && !settings.showMeetings) {
            handleTabChange('overview');
        }
    }, [settings.showMeetings, activeTab]);

    // Check for talks.md
    const talksFile = files.find(f => f.name.toLowerCase() === 'talks.md');
    const hasTalks = !!talksFile;
    const [talksData, setTalksData] = useState([]);

    useEffect(() => {
        if (hasTalks && activeTab === 'talks') {
            // Fetch talks content
            fetch(`/api/projects/${projectPath}/talks.md?type=file`)
                .then(res => res.json())
                .then(data => {
                    if (data.content) {
                        const parsed = parseTalks(data.content);
                        setTalksData(parsed);
                    }
                })
                .catch(err => console.error('Error loading talks:', err));
        }
    }, [hasTalks, activeTab, projectPath]);

    const handleNoteClick = async (note) => {
        setActiveNote(note);
        setNoteContent('Loading...');
        try {
            const res = await fetch(`/api/projects/${projectPath}/${note.name}?type=file`);
            const data = await res.json();
            setNoteContent(data.content);
        } catch (e) {
            console.error('Error loading note', e);
            setNoteContent('Error loading content.');
        }
    };

    const handleSaveNote = async () => {
        if (!activeNote) return;
        setIsSaving(true);
        try {
            await fetch(`/api/projects/${projectPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save_file',
                    name: activeNote.name,
                    content: noteContent
                })
            });
            alert('Saved!');
        } catch (e) {
            console.error('Error saving note', e);
            alert('Error saving.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateNote = async () => {
        const name = prompt('Enter note name (e.g. ideas.txt):');
        if (!name) return;

        try {
            await fetch(`/api/projects/${projectPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save_file',
                    name: name,
                    content: ''
                })
            });
            // Refresh page to show new file
            window.location.reload();
        } catch (e) {
            console.error('Error creating note', e);
        }
    };

    // Handle tab change and update URL
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        router.push(`/project/${projectPath}?tab=${tab}`, { scroll: false });
    };

    // Sync tab with URL changes
    useEffect(() => {
        setActiveTab(tabFromUrl);
    }, [tabFromUrl]);

    // Load images when Images tab is active
    useEffect(() => {
        if (activeTab === 'images') {
            loadImages();
        }
    }, [activeTab]);

    // Load images from server
    const loadImages = async () => {
        try {
            const res = await fetch(`/api/projects/${projectPath}/images?type=list`);
            if (res.ok) {
                const data = await res.json();
                setImages(data.images || []);
            }
        } catch (e) {
            console.error('Error loading images:', e);
        }
    };

    // Upload single or multiple images
    const uploadImages = async (files) => {
        if (!files || files.length === 0) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('projectPath', projectPath);

            for (const file of files) {
                formData.append('images', file);
            }

            const res = await fetch('/api/projects/upload', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                throw new Error('Upload failed');
            }

            // Reload images
            await loadImages();
        } catch (e) {
            console.error('Error uploading images:', e);
            alert('Error uploading images: ' + e.message);
        } finally {
            setIsUploading(false);
        }
    };

    // Drag & Drop handlers
    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files).filter(file =>
            file.type.startsWith('image/')
        );

        if (files.length === 0) {
            alert('Please drop only image files');
            return;
        }

        await uploadImages(files);
    };

    // Paste handler
    const handlePaste = async (e) => {
        const items = e.clipboardData.items;
        const files = [];

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }

        if (files.length > 0) {
            await uploadImages(files);
        }
    };

    // File input handler
    const handleFileInput = async (e) => {
        const files = Array.from(e.target.files);
        await uploadImages(files);
        // Reset input
        e.target.value = '';
    };

    // Lightbox handlers
    const openLightbox = (index) => {
        setLightboxIndex(index);
        setLightboxOpen(true);
    };

    const closeLightbox = () => {
        setLightboxOpen(false);
    };

    const navigateLightbox = (newIndex) => {
        setLightboxIndex(newIndex);
    };

    // Parse links.md to extract Drive links
    const parseDriveLinks = (linksContent) => {
        if (!linksContent) return [];

        const lines = linksContent.split('\n');
        const links = [];
        let currentTitle = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Check for title (## Title)
            if (line.startsWith('##')) {
                currentTitle = line.replace(/^#+\s*/, '');
            }
            // Check for markdown link format: [text](url)
            else if (line.includes('[') && line.includes('](')) {
                const match = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
                if (match && currentTitle) {
                    links.push({
                        title: currentTitle,
                        url: match[2] // Extract URL from markdown
                    });
                    currentTitle = '';
                }
            }
            // Check for direct URL
            else if (line.startsWith('http')) {
                if (currentTitle) {
                    links.push({ title: currentTitle, url: line });
                    currentTitle = '';
                }
            }
        }

        return links;
    };

    // Load drive links when tab is active
    useEffect(() => {
        if (activeTab === 'documents' && links) {
            setDriveLinks(parseDriveLinks(links));
        }
    }, [activeTab, links]);

    // Add new drive link
    const handleAddDriveLink = async () => {
        if (!newLinkTitle.trim() || !newLinkUrl.trim()) {
            alert('Please fill in both title and URL');
            return;
        }

        setIsSavingLink(true);
        try {
            // Build new links content
            const newLinkEntry = `\n## ${newLinkTitle}\n${newLinkUrl}\n`;
            const updatedLinks = (links || '') + newLinkEntry;

            // Save to links.md
            const response = await fetch(`/api/projects/${projectPath}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'save_file',
                    name: 'links.md',
                    content: updatedLinks
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save link');
            }

            // Reload page to show updated links
            window.location.reload();
        } catch (e) {
            console.error('Error adding link:', e);
            alert('Error adding link: ' + e.message);
        } finally {
            setIsSavingLink(false);
        }
    };

    return (
        <div className="project-view">
            <header className="project-header">
                <div className="breadcrumbs">
                    <Link href="/">Projects</Link>
                    {projectPath.split('/').map((segment, index, array) => {
                        const isLast = index === array.length - 1;
                        const path = array.slice(0, index + 1).join('/');

                        return (
                            <span key={index}>
                                <span className="separator"> / </span>
                                {isLast ? (
                                    <Link href={`/project/${path}`}>{segment}</Link>
                                ) : (
                                    <Link href={`/project/${path}`}>{segment}</Link>
                                )}
                            </span>
                        );
                    })}
                    {activeTab !== 'overview' && (
                        <>
                            <span className="separator"> / </span>
                            <span className="current">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</span>
                        </>
                    )}
                </div>
                <h1>{projectPath.split('/').pop()}</h1>
            </header>

            <div className="tabs">
                <button
                    className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => handleTabChange('overview')}
                >
                    Overview
                </button>
                <button
                    className={`tab-btn ${activeTab === 'tasks' ? 'active' : ''}`}
                    onClick={() => handleTabChange('tasks')}
                >
                    Tasks
                </button>
                <button
                    className={`tab-btn ${activeTab === 'links' ? 'active' : ''}`}
                    onClick={() => handleTabChange('links')}
                >
                    Links
                </button>
                <button
                    className={`tab-btn ${activeTab === 'notes' ? 'active' : ''}`}
                    onClick={() => handleTabChange('notes')}
                >
                    Notes
                </button>
                {settings.showMeetings && (
                    <button
                        className={`tab-btn ${activeTab === 'meetings' ? 'active' : ''}`}
                        onClick={() => handleTabChange('meetings')}
                    >
                        Meetings
                    </button>
                )}
                <button
                    className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
                    onClick={() => handleTabChange('documents')}
                >
                    Documents
                </button>
                {hasTalks && (
                    <button
                        className={`tab-btn ${activeTab === 'talks' ? 'active' : ''}`}
                        onClick={() => handleTabChange('talks')}
                    >
                        Talks
                    </button>
                )}
                <button
                    className={`tab-btn ${activeTab === 'images' ? 'active' : ''}`}
                    onClick={() => handleTabChange('images')}
                >
                    Images
                </button>
            </div>

            <div className="tab-content">
                {activeTab === 'overview' && (
                    <div className="overview-tab">
                        {description && (
                            <div className="description-card glass-panel">
                                <h3>Description</h3>
                                <div className="markdown-content">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
                                </div>
                            </div>
                        )}

                        <h3>Subprojects</h3>
                        <div className="grid">
                            {subprojects.map(sub => (
                                <ProjectCard key={sub.path} project={{ ...sub, name: sub.name }} />
                            ))}
                            {subprojects.length === 0 && <p className="empty-text">No subprojects.</p>}
                        </div>
                    </div>
                )}

                {activeTab === 'tasks' && (
                    <div className="tasks-tab glass-panel">
                        <TaskEditor projectPath={projectPath} initialContent={tasks || ''} />
                    </div>
                )}

                {activeTab === 'links' && (
                    <div className="links-tab glass-panel">
                        <h3>Important Links</h3>
                        <div className="markdown-content">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{links || 'No links defined. Create a `links.md` file in this project folder.'}</ReactMarkdown>
                        </div>
                    </div>
                )}

                {activeTab === 'notes' && (
                    <div className="notes-tab">
                        <div className="notes-list glass-panel">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3>Files</h3>
                                <label className="transcript-toggle">
                                    <input
                                        type="checkbox"
                                        checked={showTranscripts}
                                        onChange={(e) => setShowTranscripts(e.target.checked)}
                                    />
                                    <span className="toggle-label">Show Transcripts</span>
                                </label>
                            </div>
                            <ul>
                                {notes.map(note => (
                                    <li key={note.path} onClick={() => handleNoteClick(note)}>
                                        {note.name}
                                    </li>
                                ))}
                            </ul>
                            <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={handleCreateNote}>+ New Note</button>
                        </div>
                        <div className="note-editor glass-panel">
                            {activeNote ? (
                                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h3>{activeNote.name}</h3>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <div className="view-mode-toggle">
                                                <button
                                                    className={`toggle-btn ${viewMode === 'edit' ? 'active' : ''}`}
                                                    onClick={() => setViewMode('edit')}
                                                >
                                                    ✏️ Edit
                                                </button>
                                                <button
                                                    className={`toggle-btn ${viewMode === 'preview' ? 'active' : ''}`}
                                                    onClick={() => setViewMode('preview')}
                                                >
                                                    👁️ Preview
                                                </button>
                                            </div>
                                            <button className="btn btn-primary" onClick={handleSaveNote} disabled={isSaving}>
                                                {isSaving ? 'Saving...' : 'Save'}
                                            </button>
                                        </div>
                                    </div>
                                    {viewMode === 'edit' ? (
                                        <>
                                            <MarkdownToolbar
                                                textareaRef={textareaRef}
                                                onUpdate={setNoteContent}
                                            />
                                            <textarea
                                                ref={textareaRef}
                                                className="editor"
                                                value={noteContent}
                                                onChange={(e) => setNoteContent(e.target.value)}
                                                style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
                                            />
                                        </>
                                    ) : (
                                        <div className="markdown-preview">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{noteContent}</ReactMarkdown>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="empty-editor">Select a note to view or edit</div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'meetings' && settings.showMeetings && (
                    <div className="meetings-tab">
                        <div className="meetings-list">
                            {meetings && meetings.map(meeting => (
                                <div key={meeting.path} className="meeting-item glass-panel">
                                    <div className="meeting-header">
                                        <h3>{meeting.baseName}</h3>
                                        <span className="meeting-date">{new Date(meeting.mtime).toLocaleDateString()}</span>
                                    </div>

                                    <div className={`meeting-content ${meeting.summaryContent ? 'has-summary' : ''}`}>
                                        <div className="meeting-video-section">
                                            <video controls width="100%" style={{ borderRadius: '8px', marginBottom: '1rem' }}>
                                                <source src={`/api/projects/${projectPath}/${meeting.name}?type=file`} />
                                                Your browser does not support the video tag.
                                            </video>

                                            <div className="meeting-actions">
                                                {meeting.transcriptPath ? (
                                                    <>
                                                        <a
                                                            href={`/api/projects/${projectPath}/${meeting.baseName}_transcripcion.txt?type=file`}
                                                            target="_blank"
                                                            className="btn btn-primary"
                                                        >
                                                            View Transcript
                                                        </a>
                                                        {!meeting.summaryContent && (
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => {
                                                                    setSelectedMeeting(meeting);
                                                                    setModalMode('summary');
                                                                    setShowTranscriptModal(true);
                                                                }}
                                                                data-mode="summary"
                                                            >
                                                                Generate Resume Transcription
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <button
                                                        className="btn btn-secondary"
                                                        onClick={() => {
                                                            setSelectedMeeting(meeting);
                                                            setModalMode('transcript');
                                                            setShowTranscriptModal(true);
                                                        }}
                                                    >
                                                        Create Transcript
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {meeting.summaryContent && (
                                            <div className="meeting-summary">
                                                <h4>Summary</h4>
                                                <div className="markdown-content">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{meeting.summaryContent}</ReactMarkdown>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {(!meetings || meetings.length === 0) && <p className="empty-text">No meetings recorded.</p>}
                        </div>
                    </div>
                )}

                {activeTab === 'documents' && (
                    <div className="documents-tab glass-panel">
                        <h3>Documents</h3>

                        {documents.length > 0 && (
                            <>
                                <h4 className="section-subtitle">📄 Local Files</h4>
                                <div className="documents-list">
                                    {documents.map(doc => (
                                        <div key={doc.path} className="document-item">
                                            <div className="document-info">
                                                <span className="document-icon">
                                                    {doc.name.endsWith('.pdf') && '📕'}
                                                    {(doc.name.endsWith('.doc') || doc.name.endsWith('.docx')) && '📘'}
                                                </span>
                                                <span className="document-name">{doc.name}</span>
                                            </div>
                                            <a
                                                href={`/api/projects/${projectPath}/${doc.name}?type=file`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-secondary"
                                            >
                                                Open in tab →
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        <h4 className="section-subtitle">🔗 Google Drive Links</h4>

                        {/* Add Link Form */}
                        <div className="add-link-form">
                            <div className="form-fields">
                                <input
                                    type="text"
                                    placeholder="Document title..."
                                    value={newLinkTitle}
                                    onChange={(e) => setNewLinkTitle(e.target.value)}
                                    className="form-input"
                                />
                                <input
                                    type="url"
                                    placeholder="Google Drive URL..."
                                    value={newLinkUrl}
                                    onChange={(e) => setNewLinkUrl(e.target.value)}
                                    className="form-input"
                                />
                            </div>
                            <button
                                onClick={handleAddDriveLink}
                                disabled={isSavingLink}
                                className="btn btn-primary"
                            >
                                {isSavingLink ? 'Adding...' : '+ Add Link'}
                            </button>
                        </div>

                        {/* Drive Links Cards */}
                        {driveLinks.length > 0 && (
                            <div className="drive-links-grid">
                                {driveLinks.map((link, index) => (
                                    <div key={index} className="drive-link-card">
                                        <div className="drive-link-info">
                                            <span className="drive-icon">📎</span>
                                            <h5 className="drive-link-title">{link.title}</h5>
                                        </div>
                                        <a
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn btn-secondary btn-sm"
                                        >
                                            Open →
                                        </a>
                                    </div>
                                ))}
                            </div>
                        )}

                        {driveLinks.length === 0 && (
                            <p className="empty-text">No Drive links yet. Add one using the form above.</p>
                        )}

                        {documents.length === 0 && driveLinks.length === 0 && (
                            <p className="empty-text" style={{ marginTop: '2rem' }}>No documents found. Upload PDF or DOC files, or add Drive links.</p>
                        )}
                    </div>
                )}

                {activeTab === 'talks' && hasTalks && (
                    <div className="talks-tab">
                        <div className="talks-grid">
                            {talksData.map((talk, index) => (
                                <TalkCard key={index} talk={talk} />
                            ))}
                        </div>
                        {talksData.length === 0 && (
                            <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
                                <p className="empty-text">Loading talks...</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'images' && (
                    <div className="images-tab glass-panel">
                        <h3>Images</h3>

                        {/* Upload Zone */}
                        <div
                            className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                            onDragOver={handleDragOver}
                            onDragEnter={handleDragEnter}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onPaste={handlePaste}
                            tabIndex="0"
                        >
                            <div className="upload-content">
                                <div className="upload-icon">📸</div>
                                <h4>Upload Images</h4>
                                <p>Drag & drop images here, paste from clipboard, or click to browse</p>
                                <input
                                    type="file"
                                    id="file-input"
                                    multiple
                                    accept="image/*"
                                    onChange={handleFileInput}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    className="btn btn-primary"
                                    onClick={() => document.getElementById('file-input').click()}
                                    disabled={isUploading}
                                >
                                    {isUploading ? 'Uploading...' : 'Choose Files'}
                                </button>
                            </div>
                        </div>

                        {/* Images Grid */}
                        {images.length > 0 && (
                            <>
                                <h4 className="section-subtitle" style={{ marginTop: '2rem' }}>📷 Gallery ({images.length})</h4>
                                <div className="images-grid">
                                    {images.map((image, index) => (
                                        <div key={index} className="image-card">
                                            <div
                                                className="image-preview"
                                                onClick={() => openLightbox(index)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <img
                                                    src={`/api/projects/${image.path}?type=file`}
                                                    alt={image.name}
                                                    loading="lazy"
                                                />
                                            </div>
                                            <div className="image-info">
                                                <span className="image-name" title={image.name}>{image.name}</span>
                                                <a
                                                    href={`/api/projects/${image.path}?type=file`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-secondary btn-sm"
                                                >
                                                    Open →
                                                </a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {images.length === 0 && !isUploading && (
                            <p className="empty-text" style={{ marginTop: '2rem', textAlign: 'center' }}>No images yet. Upload some to get started!</p>
                        )}
                    </div>
                )}
            </div>

            {showTranscriptModal && selectedMeeting && (
                <TranscriptModal
                    meeting={selectedMeeting}
                    projectPath={projectPath}
                    mode={modalMode}
                    onClose={() => setShowTranscriptModal(false)}
                />
            )}

            {lightboxOpen && images.length > 0 && (
                <ImageLightbox
                    images={images}
                    currentIndex={lightboxIndex}
                    onClose={closeLightbox}
                    onNavigate={navigateLightbox}
                />
            )}
            <style jsx>{`
        .project-header {
            margin-bottom: 2rem;
        }
        .breadcrumbs {
            color: var(--text-secondary);
            font-size: 0.9rem;
            margin-bottom: 0.5rem;
        }

        .breadcrumbs a {
            color: var(--text-secondary);
            text-decoration: none;
            transition: color 0.2s;
        }

        .breadcrumbs a:hover {
            color: var(--accent-primary);
        }

        .breadcrumbs .separator {
            margin: 0 0.5rem;
            color: var(--text-secondary);
            opacity: 0.5;
        }

        .breadcrumbs .current {
            color: var(--text-primary);
            font-weight: 500;
        }

        .project-header h1 {
            font-size: 2rem;
            margin: 0;
            margin-bottom: 2rem;
        }
        .tabs {
            display: flex;
            gap: 1rem;
            margin-bottom: 2rem;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 1px;
        }
        .tab-btn {
            background: none;
            border: none;
            color: var(--text-secondary);
            padding: 0.75rem 1.5rem;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 500;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }
        .tab-btn:hover {
            color: var(--text-primary);
        }
        .tab-btn.active {
            color: var(--accent-primary);
            border-bottom-color: var(--accent-primary);
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 1.5rem;
        }
        
        .glass-panel {
            padding: 1.5rem;
        }
        
        .text-content {
            white-space: pre-wrap;
            font-family: var(--font-sans);
            line-height: 1.6;
            color: var(--text-secondary);
        }
        
        .markdown-content {
            color: var(--text-secondary);
            line-height: 1.6;
        }
        .markdown-content h1, .markdown-content h2, .markdown-content h3 {
            color: var(--text-primary);
            margin-top: 1.5rem;
            margin-bottom: 0.5rem;
        }
        .markdown-content p {
            margin-bottom: 1rem;
        }
        .markdown-content ul, .markdown-content ol {
            padding-left: 1.5rem;
            margin-bottom: 1rem;
        }
        .markdown-content li {
            margin-bottom: 0.25rem;
        }
        .markdown-content a {
            color: var(--accent-primary);
            text-decoration: underline;
        }
        .markdown-content blockquote {
            border-left: 4px solid var(--accent-secondary);
            padding-left: 1rem;
            margin-left: 0;
            font-style: italic;
        }
        .markdown-content code {
            background: var(--bg-tertiary);
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            font-family: monospace;
        }
        .markdown-content pre {
            background: var(--bg-tertiary);
            padding: 1rem;
            border-radius: 8px;
            overflow-x: auto;
            margin-bottom: 1rem;
        }
        .markdown-content pre code {
            background: transparent;
            padding: 0;
        }
        .markdown-content input[type="checkbox"] {
            margin-right: 0.5rem;
        }
        
        .description-card {
            margin-bottom: 2rem;
        }
        
        .notes-tab {
            display: grid;
            grid-template-columns: 250px 1fr;
            gap: 1.5rem;
            height: 600px;
        }
        
        .notes-list ul {
            list-style: none;
            margin-top: 1rem;
        }
        
        .notes-list li {
            padding: 0.5rem;
            cursor: pointer;
            border-radius: 6px;
            color: var(--text-secondary);
        }
        
        .notes-list li:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .transcript-toggle {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
            font-size: 0.85rem;
            color: var(--text-secondary);
        }

        .transcript-toggle input[type="checkbox"] {
            cursor: pointer;
            width: 16px;
            height: 16px;
            accent-color: var(--accent-primary);
        }

        .transcript-toggle:hover .toggle-label {
            color: var(--text-primary);
        }
        
        .editor {
            width: 100%;
            height: 100%;
            background: transparent;
            border: none;
            color: var(--text-primary);
            font-family: monospace;
            resize: none;
            outline: none;
        }

        .view-mode-toggle {
            display: flex;
            gap: 0.25rem;
            background: var(--bg-tertiary);
            padding: 0.25rem;
            border-radius: 8px;
        }

        .toggle-btn {
            background: transparent;
            border: none;
            color: var(--text-secondary);
            padding: 0.5rem 1rem;
            cursor: pointer;
            font-size: 0.9rem;
            border-radius: 6px;
            transition: all 0.2s;
            font-weight: 500;
        }

        .toggle-btn:hover {
            color: var(--text-primary);
            background: rgba(255, 255, 255, 0.05);
        }

        .toggle-btn.active {
            background: var(--accent-primary);
            color: white;
        }

        .markdown-preview {
            width: 100%;
            height: 100%;
            overflow-y: auto;
            padding: 1rem;
            background: var(--bg-tertiary);
            border-radius: 8px;
        }
        
        .empty-text, .empty-editor {
            color: var(--text-secondary);
            font-style: italic;
        }
        
        .empty-editor {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
        }

        /* Meeting List Styles */
        .meetings-list {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        .meeting-item {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        .meeting-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            padding-bottom: 0.5rem;
        }

        .meeting-header h3 {
            font-size: 1.2rem;
            margin: 0;
        }

        /* Images Tab Styles */
        .images-tab h3 {
            margin-bottom: 1.5rem;
        }

        .upload-zone {
            border: 2px dashed var(--border-color);
            border-radius: 12px;
            padding: 3rem 2rem;
            text-align: center;
            transition: all 0.3s ease;
            cursor: pointer;
            background: var(--bg-tertiary);
        }

        .upload-zone:hover {
            border-color: var(--accent-primary);
            background: rgba(var(--accent-primary-rgb), 0.05);
        }

        .upload-zone.dragging {
            border-color: var(--accent-primary);
            background: rgba(var(--accent-primary-rgb), 0.1);
            transform: scale(1.02);
        }

        .upload-zone:focus {
            outline: 2px solid var(--accent-primary);
            outline-offset: 2px;
        }

        .upload-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
        }

        .upload-icon {
            font-size: 3rem;
            opacity: 0.7;
        }

        .upload-zone h4 {
            margin: 0;
            color: var(--text-primary);
            font-size: 1.3rem;
        }

        .upload-zone p {
            margin: 0;
            color: var(--text-secondary);
            font-size: 0.95rem;
        }

        .images-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
            gap: 1.5rem;
            margin-top: 1rem;
        }

        .image-card {
            background: var(--bg-tertiary);
            border-radius: 12px;
            overflow: hidden;
            transition: transform 0.2s, box-shadow 0.2s;
            border: 1px solid var(--border-color);
        }

        .image-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
        }

        .image-preview {
            width: 100%;
            height: 200px;
            overflow: hidden;
            background: var(--bg-secondary);
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .image-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s;
        }

        .image-card:hover .image-preview img {
            transform: scale(1.1);
        }

        .image-info {
            padding: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .image-name {
            color: var(--text-primary);
            font-size: 0.9rem;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .btn-sm {
            padding: 0.4rem 0.8rem;
            font-size: 0.85rem;
        }

        .section-subtitle h3 {
            color: var(--text-primary);
        }

        .meeting-date {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        /* Meeting content - layout de 2 columnas cuando hay summary */
        .meeting-content {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        .meeting-content.has-summary {
            display: grid;
            grid-template-columns: 400px 1fr;
            gap: 2rem;
            align-items: start;
        }

        .meeting-video-section {
            display: flex;
            flex-direction: column;
        }

        .meeting-summary {
            overflow-y: auto;
        }

        .meeting-summary h4 {
            font-size: 0.9rem;
            color: var(--text-secondary);
            margin-bottom: 0.5rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .meeting-summary .markdown-content {
            color: var(--text-primary);
            line-height: 1.6;
        }

        .meeting-actions {
            display: flex;
            gap: 0.75rem;
            margin-top: 0.75rem;
            flex-wrap: wrap;
        }
        
        .meeting-actions .btn {
            flex: 1;
            min-width: 150px;
            white-space: nowrap;
        }
        
        @media (max-width: 600px) {
            .meeting-actions {
                flex-direction: column;
            }
            
            .meeting-actions .btn {
                width: 100%;
            }
        }

        /* Documents Tab Styles */
        .documents-tab h3 {
            font-size: 1.3rem;
            color: var(--text-primary);
            margin-bottom: 1.5rem;
        }

        .section-subtitle {
            font-size: 0.9rem;
            color: var(--text-secondary);
            margin: 1.5rem 0 0.75rem 0;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 600;
        }

        .documents-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            margin-bottom: 2rem;
        }

        .document-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            transition: all 0.2s;
        }

        .document-item:hover {
            border-color: var(--accent-primary);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .document-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .document-icon {
            font-size: 1.5rem;
        }

        .document-name {
            color: var(--text-primary);
            font-weight: 500;
        }

        .documents-links {
            margin-top: 0.5rem;
        }

        .documents-links a {
            display: block;
            padding: 0.75rem 1rem;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            margin-bottom: 0.5rem;
            transition: all 0.2s;
            text-decoration: none;
        }

        .documents-links a:hover {
            border-color: var(--accent-primary);
            transform: translateX(4px);
        }

        /* Add Link Form */
        .add-link-form {
            display: flex;
            gap: 1rem;
            margin-bottom: 1.5rem;
            padding: 1.5rem;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
        }

        .form-fields {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            flex: 1;
        }

        .form-input {
            padding: 0.75rem 1rem;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 0.95rem;
            transition: all 0.2s;
        }

        .form-input:focus {
            outline: none;
            border-color: var(--accent-primary);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .form-input::placeholder {
            color: var(--text-secondary);
            opacity: 0.6;
        }

        /* Drive Links Grid */
        .drive-links-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1rem;
            margin-bottom: 1rem;
        }

        .drive-link-card {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.25rem;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            transition: all 0.2s;
        }

        .drive-link-card:hover {
            border-color: var(--accent-primary);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .drive-link-info {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex: 1;
            min-width: 0;
        }

        .drive-icon {
            font-size: 1.5rem;
            flex-shrink: 0;
        }

        .drive-link-title {
            color: var(--text-primary);
            font-weight: 500;
            font-size: 1rem;
            margin: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .btn-sm {
            padding: 0.5rem 0.875rem;
            font-size: 0.85rem;
            white-space: nowrap;
        }

        /* Responsive - volver a columna en pantallas pequeñas */
        @media (max-width: 768px) {
            .meeting-content.has-summary {
                grid-template-columns: 1fr;
            }

            .add-link-form {
                flex-direction: column;
            }

            .drive-links-grid {
                grid-template-columns: 1fr;
            }
        }

        /* Talks Grid */
        .talks-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
            gap: 1.5rem;
        }

        @media (max-width: 768px) {
            .talks-grid {
                grid-template-columns: 1fr;
            }
        }
      `}</style>
        </div>
    );
}
