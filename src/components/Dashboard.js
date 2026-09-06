'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from './ui/Icon';
import EmptyState from './ui/EmptyState';
import { SkeletonCards } from './ui/Skeleton';
import ProjectsExplorer from './ProjectsExplorer';

function StatCard({ icon, label, value, hint, tone = 'accent' }) {
  return (
    <div className={`stat card tone-${tone}`}>
      <span className="stat-icon">
        <Icon name={icon} size={18} />
      </span>
      <div className="stat-body">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
        {hint && <span className="stat-hint">{hint}</span>}
      </div>

      <style jsx>{`
        .stat {
          display: flex;
          align-items: flex-start;
          gap: var(--sp-3);
          padding: var(--sp-4);
        }
        .stat-icon {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          border-radius: var(--r-md);
          background: var(--accent-soft);
          color: var(--accent);
        }
        .tone-success .stat-icon { background: var(--success-soft); color: var(--success); }
        .tone-warning .stat-icon { background: var(--warning-soft); color: var(--warning); }
        .tone-info .stat-icon { background: var(--info-soft); color: var(--info); }
        .stat-body {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .stat-value {
          font-size: var(--fs-2xl);
          font-weight: 700;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }
        .stat-label {
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }
        .stat-hint {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}

function TaskGroup({ group }) {
  const done = group.totalTasks - group.pendingCount;
  const progress = group.totalTasks ? Math.round((done / group.totalTasks) * 100) : 0;
  const href = `/project/${group.projectPath.split('/').map(encodeURIComponent).join('/')}?tab=tasks`;

  return (
    <Link href={href} className="task-group card card-hover">
      <div className="tg-head">
        <div className="tg-title">
          <Icon name="folder" size={15} />
          <span className="truncate">{group.projectName}</span>
        </div>
        <span className="badge badge-accent">{group.pendingCount}</span>
      </div>

      <ul className="tg-list">
        {group.tasks.slice(0, 4).map((task) => (
          <li key={task.id}>
            <Icon name="square" size={13} />
            <span className="truncate">{task.text}</span>
          </li>
        ))}
        {group.tasks.length > 4 && (
          <li className="tg-more">+{group.tasks.length - 4} más…</li>
        )}
      </ul>

      <div className="tg-foot">
        <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <span className="tg-progress-label">
          {done}/{group.totalTasks}
        </span>
      </div>

      <style jsx>{`
        :global(.task-group) {
          display: flex;
          flex-direction: column;
          gap: var(--sp-3);
          padding: var(--sp-4);
        }
        .tg-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-2);
        }
        .tg-title {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          min-width: 0;
          font-size: var(--fs-sm);
          font-weight: 650;
          color: var(--text);
        }
        .tg-title :global(svg) { color: var(--accent); flex-shrink: 0; }
        .tg-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: var(--sp-1);
          flex: 1;
        }
        .tg-list li {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
          font-size: var(--fs-sm);
          color: var(--text-muted);
          min-width: 0;
        }
        .tg-list li :global(svg) { color: var(--text-subtle); flex-shrink: 0; }
        .tg-more {
          font-size: var(--fs-xs) !important;
          color: var(--text-subtle) !important;
          font-style: italic;
          padding-left: 21px;
        }
        .tg-foot {
          display: flex;
          align-items: center;
          gap: var(--sp-2);
        }
        .progress {
          flex: 1;
          height: 5px;
          border-radius: var(--r-full);
          background: var(--surface-3);
          overflow: hidden;
        }
        .progress span {
          display: block;
          height: 100%;
          border-radius: var(--r-full);
          background: var(--accent);
          transition: width var(--dur-slow) var(--ease-out);
        }
        .tg-progress-label {
          font-size: var(--fs-xs);
          color: var(--text-subtle);
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </Link>
  );
}

export default function Dashboard() {
  const [taskGroups, setTaskGroups] = useState([]);
  const [projects, setProjects] = useState([]);
  const [knowledge, setKnowledge] = useState(null);
  const [loading, setLoading] = useState(true);

  const [nonce, setNonce] = useState(0);

  // Every state write lands after an await, so the effect never causes a
  // cascading render on mount. `nonce` is what the refresh button bumps.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [tasksRes, projectsRes, knowledgeRes] = await Promise.allSettled([
        fetch('/api/tasks/all').then((r) => r.json()),
        fetch('/api/projects/all').then((r) => r.json()),
        fetch('/api/knowledge').then((r) => r.json()),
      ]);
      if (cancelled) return;

      if (tasksRes.status === 'fulfilled') setTaskGroups(tasksRes.value.projects || []);
      if (projectsRes.status === 'fulfilled') setProjects(projectsRes.value.projects || []);
      if (knowledgeRes.status === 'fulfilled') setKnowledge(knowledgeRes.value);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const refresh = () => {
    setLoading(true);
    setNonce((n) => n + 1);
  };

  const stats = useMemo(() => {
    const pending = taskGroups.reduce((sum, g) => sum + g.pendingCount, 0);
    const total = taskGroups.reduce((sum, g) => sum + g.totalTasks, 0);
    return { pending, total, done: total - pending };
  }, [taskGroups]);

  const sortedGroups = useMemo(
    () => [...taskGroups].sort((a, b) => b.pendingCount - a.pendingCount),
    [taskGroups]
  );

  return (
    <div className="dashboard stack" style={{ gap: 'var(--sp-8)' }}>
      <header className="dash-head">
        <div>
          <h1 className="page-title">Panel</h1>
          <p className="page-subtitle">
            Todo lo que tienes en marcha, en una sola vista.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {loading ? <span className="spinner" /> : <Icon name="refresh" size={15} />}
          Actualizar
        </button>
      </header>

      <section className="stats-grid">
        <StatCard
          icon="folder"
          label="Proyectos"
          value={projects.length}
          hint={`${projects.filter((p) => p.depth === 0).length} en la raíz`}
        />
        <StatCard
          icon="check-square"
          label="Tareas pendientes"
          value={stats.pending}
          hint={stats.total ? `${stats.done} completadas de ${stats.total}` : 'Sin tareas registradas'}
          tone="warning"
        />
        <StatCard
          icon="file-text"
          label="Documentos indexados"
          value={knowledge?.documents ?? '—'}
          hint={knowledge ? `${knowledge.chunks} fragmentos buscables` : 'Calculando…'}
          tone="info"
        />
        <StatCard
          icon="mic"
          label="Transcripciones"
          value={knowledge?.transcripts ?? '—'}
          hint={knowledge?.semantic ? 'Búsqueda híbrida activa' : 'Búsqueda léxica BM25'}
          tone="success"
        />
      </section>

      <section>
        <div className="section-head">
          <h2 className="section-title">
            <Icon name="check-square" size={18} />
            Tareas pendientes
          </h2>
          {stats.pending > 0 && (
            <span className="badge badge-accent">{stats.pending} por hacer</span>
          )}
        </div>

        {loading ? (
          <SkeletonCards count={3} height={170} />
        ) : sortedGroups.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title="Todo al día"
            description="No hay tareas pendientes en ningún proyecto. Añade un tasks.md a cualquier carpeta para empezar a hacer seguimiento."
          />
        ) : (
          <div className="grid-auto" style={{ '--min': '290px' }}>
            {sortedGroups.map((group) => (
              <TaskGroup key={group.projectPath} group={group} />
            ))}
          </div>
        )}
      </section>

      <ProjectsExplorer projects={projects} loading={loading} />

      <style jsx>{`
        .dash-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--sp-4);
          flex-wrap: wrap;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(215px, 100%), 1fr));
          gap: var(--sp-3);
        }

        @media (max-width: 640px) {
          /* Two-up beats one-up on a phone: the numbers are short and the
             whole row stays above the fold. */
          .stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: var(--sp-2);
          }
        }
      `}</style>
    </div>
  );
}
