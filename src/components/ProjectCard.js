'use client';

import Link from 'next/link';

export default function ProjectCard({ project }) {
  // project has name, path, type
  // path is relative to projects_data, e.g. "Sample Project"
  // We want to link to /project/Sample%20Project

  const href = `/project/${project.path}`;

  return (
    <Link href={href} className="project-card">
      <div className="icon">
        📁
      </div>
      <div className="info">
        <h3>{project.name}</h3>
        <p>Project Folder</p>
      </div>

      <style jsx>{`
        .project-card {
          display: flex;
          flex-direction: column;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.5rem;
          transition: all 0.3s ease;
          height: 100%;
        }

        .project-card:hover {
          transform: translateY(-4px);
          border-color: var(--accent-primary);
          box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
        }

        .icon {
          font-size: 2rem;
          margin-bottom: 1rem;
        }

        .info h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 0.25rem;
          color: var(--text-primary);
        }

        .info p {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
      `}</style>
    </Link>
  );
}
