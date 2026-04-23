'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function DashboardTasks() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/tasks/all')
            .then(res => res.json())
            .then(data => {
                setProjects(data.projects || []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Error loading tasks:', err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="dashboard-tasks">
                <h2>📋 Pending Tasks</h2>
                <p className="loading">Loading tasks...</p>
                <style jsx>{`
          .dashboard-tasks {
            margin-bottom: 3rem;
          }
          .dashboard-tasks h2 {
            font-size: 1.5rem;
            margin-bottom: 1.5rem;
            color: var(--text-primary);
          }
          .loading {
            color: var(--text-secondary);
          }
        `}</style>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="dashboard-tasks">
                <h2>📋 Pending Tasks</h2>
                <p className="empty">No pending tasks across all projects.</p>
                <style jsx>{`
          .dashboard-tasks {
            margin-bottom: 3rem;
          }
          .dashboard-tasks h2 {
            font-size: 1.5rem;
            margin-bottom: 1.5rem;
            color: var(--text-primary);
          }
          .empty {
            color: var(--text-secondary);
            font-style: italic;
          }
        `}</style>
            </div>
        );
    }

    const totalPending = projects.reduce((sum, p) => sum + p.pendingCount, 0);

    return (
        <div className="dashboard-tasks">
            <div className="tasks-header">
                <h2>📋 Pending Tasks</h2>
                <span className="total-badge">{totalPending} pending</span>
            </div>

            <div className="projects-grid">
                {projects.map((project) => (
                    <Link
                        key={project.projectPath}
                        href={`/project/${project.projectPath}?tab=tasks`}
                        className="project-task-card glass-panel"
                    >
                        <div className="project-header">
                            <h3>{project.projectName}</h3>
                            <span className="badge">{project.pendingCount}/{project.totalTasks}</span>
                        </div>
                        <ul className="task-preview">
                            {project.tasks.slice(0, 3).map((task) => (
                                <li key={task.id}>
                                    <span className="checkbox">☐</span>
                                    {task.text}
                                </li>
                            ))}
                            {project.tasks.length > 3 && (
                                <li className="more">+{project.tasks.length - 3} more...</li>
                            )}
                        </ul>
                    </Link>
                ))}
            </div>

            <style jsx>{`
        .dashboard-tasks {
          margin-bottom: 3rem;
        }

        .tasks-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }

        .tasks-header h2 {
          font-size: 1.5rem;
          color: var(--text-primary);
        }

        .total-badge {
          background: var(--accent-primary);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 600;
        }

        .projects-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
        }

        .project-task-card {
          padding: 1.5rem;
          transition: all 0.3s ease;
          cursor: pointer;
          text-decoration: none;
          display: block;
        }

        .project-task-card:hover {
          transform: translateY(-4px);
          border-color: var(--accent-primary);
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
        }

        .project-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border-color);
        }

        .project-header h3 {
          font-size: 1.1rem;
          color: var(--text-primary);
          font-weight: 600;
        }

        .badge {
          background: rgba(99, 102, 241, 0.2);
          color: var(--accent-primary);
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .task-preview {
          list-style: none;
          padding: 0;
        }

        .task-preview li {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          padding: 0.5rem 0;
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        .task-preview .checkbox {
          color: var(--accent-primary);
          font-weight: bold;
        }

        .task-preview .more {
          font-style: italic;
          color: var(--text-secondary);
          opacity: 0.7;
        }
      `}</style>
        </div>
    );
}
