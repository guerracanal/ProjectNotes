'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from '../ui/Icon';
import EmptyState from '../ui/EmptyState';
import TaskEditor from '../TaskEditor';
import NotesTab from './NotesTab';
import MeetingsTab from './MeetingsTab';
import DocumentsTab from './DocumentsTab';
import ImagesTab from './ImagesTab';
import TalksTab from './TalksTab';
import { useSettings } from '@/contexts/SettingsContext';
import { DOC_EXTENSIONS } from '@/lib/file-kinds';

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export default function ProjectView({
  projectPath,
  subprojects,
  files,
  description,
  tasks,
  meetings,
  links,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { settings } = useSettings();

  const urlTab = searchParams.get('tab') || 'overview';
  const [activeTab, setActiveTab] = useState(urlTab);

  useEffect(() => {
    setActiveTab(urlTab);
  }, [urlTab]);

  const changeTab = useCallback(
    (tab) => {
      setActiveTab(tab);
      router.push(`/project/${encodePath(projectPath)}?tab=${tab}`, { scroll: false });
    },
    [router, projectPath]
  );

  const hasTalks = useMemo(
    () => files.some((f) => f.name.toLowerCase() === 'talks.md'),
    [files]
  );

  const documents = useMemo(
    () =>
      files.filter((f) => {
        const dot = f.name.lastIndexOf('.');
        return dot !== -1 && DOC_EXTENSIONS.includes(f.name.slice(dot).toLowerCase());
      }),
    [files]
  );

  const counts = useMemo(
    () => ({
      tasks: (tasks || '').split('\n').filter((l) => /^\s*-\s+\[ \]/.test(l)).length,
      notes: files.filter((f) => /\.(md|txt|markdown)$/i.test(f.name)).length,
      meetings: meetings?.length || 0,
      documents: documents.length,
      subprojects: subprojects.length,
    }),
    [tasks, files, meetings, documents, subprojects]
  );

  const tabs = useMemo(() => {
    const list = [
      { id: 'overview', label: 'Resumen', icon: 'info' },
      { id: 'tasks', label: 'Tareas', icon: 'check-square', count: counts.tasks },
      { id: 'notes', label: 'Notas', icon: 'file-text', count: counts.notes },
      { id: 'links', label: 'Enlaces', icon: 'link' },
    ];
    if (settings.showMeetings) {
      list.push({ id: 'meetings', label: 'Reuniones', icon: 'video', count: counts.meetings });
    }
    list.push({ id: 'documents', label: 'Documentos', icon: 'file', count: counts.documents });
    if (hasTalks) list.push({ id: 'talks', label: 'Charlas', icon: 'presentation' });
    list.push({ id: 'images', label: 'Imágenes', icon: 'image' });
    return list;
  }, [settings.showMeetings, hasTalks, counts]);

  // If the meetings tab is hidden while it is open, fall back to the overview.
  useEffect(() => {
    if (activeTab === 'meetings' && !settings.showMeetings) changeTab('overview');
  }, [settings.showMeetings, activeTab, changeTab]);

  const projectName = projectPath.split('/').pop();

  return (
    <div className="project-view">
      <header className="project-head">
        <div className="ph-main">
          <span className="ph-icon">
            <Icon name="folder-open" size={22} />
          </span>
          <div className="ph-text">
            <h1 className="page-title">{projectName}</h1>
            <p className="ph-path mono">{projectPath}</p>
          </div>
        </div>
      </header>

      <nav className="tabs no-scrollbar" role="tablist" aria-label="Secciones del proyecto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => changeTab(tab.id)}
          >
            <Icon name={tab.icon} size={15} />
            <span>{tab.label}</span>
            {tab.count > 0 && <span className="tab-count">{tab.count}</span>}
          </button>
        ))}
      </nav>

      <div className="tab-panel" role="tabpanel">
        {activeTab === 'overview' && (
          <div className="stack" style={{ gap: 'var(--sp-6)' }}>
            {description ? (
              <div className="card card-pad">
                <div className="section-head">
                  <h2 className="section-title">
                    <Icon name="info" size={17} />
                    Descripción
                  </h2>
                </div>
                <div className="markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <EmptyState
                icon="file-text"
                title="Sin descripción"
                description="Crea un description.md en la carpeta del proyecto para que aparezca aquí."
              />
            )}

            <section>
              <div className="section-head">
                <h2 className="section-title">
                  <Icon name="layers" size={17} />
                  Subproyectos
                </h2>
                {counts.subprojects > 0 && (
                  <span className="badge">{counts.subprojects}</span>
                )}
              </div>

              {subprojects.length === 0 ? (
                <EmptyState
                  icon="folder"
                  title="Sin subproyectos"
                  description="Las subcarpetas de este proyecto aparecerán aquí como tarjetas."
                />
              ) : (
                <div className="grid-auto">
                  {subprojects.map((sub) => (
                    <Link
                      key={sub.path}
                      href={`/project/${encodePath(sub.path)}`}
                      className="sub-card card card-hover"
                    >
                      <span className="sub-icon">
                        <Icon name="folder" size={20} />
                      </span>
                      <span className="sub-text">
                        <strong className="truncate">{sub.name}</strong>
                        <span className="text-xs text-subtle">Subproyecto</span>
                      </span>
                      <Icon name="chevron-right" size={16} className="sub-go" />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="card card-pad">
            <TaskEditor projectPath={projectPath} initialContent={tasks || ''} />
          </div>
        )}

        {activeTab === 'notes' && <NotesTab projectPath={projectPath} files={files} />}

        {activeTab === 'links' && (
          <div className="card card-pad">
            <div className="section-head">
              <h2 className="section-title">
                <Icon name="link" size={17} />
                Enlaces importantes
              </h2>
            </div>
            {links ? (
              <div className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{links}</ReactMarkdown>
              </div>
            ) : (
              <EmptyState
                icon="link"
                title="Sin enlaces"
                description="Crea un links.md en la carpeta del proyecto para reunir aquí tus enlaces."
              />
            )}
          </div>
        )}

        {activeTab === 'meetings' && settings.showMeetings && (
          <MeetingsTab projectPath={projectPath} meetings={meetings} />
        )}

        {activeTab === 'documents' && (
          <DocumentsTab projectPath={projectPath} documents={documents} links={links} />
        )}

        {activeTab === 'talks' && hasTalks && <TalksTab projectPath={projectPath} />}

        {activeTab === 'images' && <ImagesTab projectPath={projectPath} />}
      </div>

      <style jsx>{`
        .project-view {
          display: flex;
          flex-direction: column;
          gap: var(--sp-5);
        }

        .project-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--sp-4);
          flex-wrap: wrap;
        }

        .ph-main {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          min-width: 0;
        }

        .ph-icon {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          border-radius: var(--r-lg);
          background: var(--accent-soft);
          color: var(--accent);
        }

        .ph-text {
          min-width: 0;
        }

        .ph-path {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
          word-break: break-all;
        }

        .tabs {
          display: flex;
          gap: var(--sp-1);
          overflow-x: auto;
          border-bottom: 1px solid var(--border);
          scroll-snap-type: x proximity;
        }

        .tab {
          display: inline-flex;
          align-items: center;
          gap: var(--sp-2);
          flex-shrink: 0;
          padding: var(--sp-3) var(--sp-3);
          border-bottom: 2px solid transparent;
          color: var(--text-muted);
          font-size: var(--fs-sm);
          font-weight: 550;
          scroll-snap-align: start;
          transition: color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
        }

        .tab:hover {
          color: var(--text);
        }

        .tab.active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }

        .tab-count {
          display: inline-grid;
          place-items: center;
          min-width: 18px;
          height: 18px;
          padding-inline: 5px;
          border-radius: var(--r-full);
          background: var(--surface-3);
          font-size: var(--fs-2xs);
          font-weight: 700;
        }

        .tab.active .tab-count {
          background: var(--accent-soft-strong);
          color: var(--accent);
        }

        .tab-panel {
          animation: fade-in var(--dur) var(--ease-out);
          min-height: 320px;
        }

        :global(.sub-card) {
          display: flex;
          align-items: center;
          gap: var(--sp-3);
          padding: var(--sp-4);
        }

        .sub-icon {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          border-radius: var(--r-md);
          background: var(--accent-soft);
          color: var(--accent);
        }

        .sub-text {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }

        .sub-text strong {
          font-size: var(--fs-sm);
          color: var(--text);
        }

        :global(.sub-go) {
          color: var(--text-subtle);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
