'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

export default function ProjectsTable() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(15);
    const [sortBy, setSortBy] = useState('path');
    const [sortOrder, setSortOrder] = useState('asc');

    useEffect(() => {
        fetch('/api/projects/all')
            .then(res => res.json())
            .then(data => {
                setProjects(data.projects || []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Error loading projects:', err);
                setLoading(false);
            });
    }, []);

    // Filtrar proyectos basado en búsqueda
    const filteredProjects = useMemo(() => {
        return projects.filter(project => {
            const query = searchQuery.toLowerCase();
            return (
                project.name.toLowerCase().includes(query) ||
                project.path.toLowerCase().includes(query)
            );
        });
    }, [projects, searchQuery]);

    // Ordenar proyectos
    const sortedProjects = useMemo(() => {
        const sorted = [...filteredProjects];
        sorted.sort((a, b) => {
            let aVal = a[sortBy];
            let bVal = b[sortBy];

            if (sortBy === 'depth') {
                aVal = parseInt(aVal);
                bVal = parseInt(bVal);
            }

            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [filteredProjects, sortBy, sortOrder]);

    // Paginación
    const totalPages = Math.ceil(sortedProjects.length / itemsPerPage);
    const paginatedProjects = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        return sortedProjects.slice(start, end);
    }, [sortedProjects, currentPage, itemsPerPage]);

    const handleSort = (column) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    const getLevelBadge = (depth) => {
        if (depth === 0) return { label: 'Root', className: 'level-root' };
        return { label: `L${depth}`, className: `level-${depth}` };
    };

    if (loading) {
        return (
            <div className="projects-table-container">
                <h2>📊 All Projects</h2>
                <p className="loading">Loading projects...</p>
                <style jsx>{`
                    .projects-table-container h2 {
                        font-size: 1.5rem;
                        margin-bottom: 1.5rem;
                        color: var(--text-primary);
                    }
                    .loading {
                        color: var(--text-secondary);
                        text-align: center;
                        padding: 2rem;
                    }
                `}</style>
            </div>
        );
    }

    return (
        <div className="projects-table-container">
            <div className="table-header">
                <h2>📊 All Projects</h2>
                <span className="total-badge">{filteredProjects.length} projects</span>
            </div>

            <div className="table-controls">
                <input
                    type="text"
                    placeholder="🔍 Search projects..."
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1); // Reset to first page on search
                    }}
                    className="search-input"
                />
            </div>

            <div className="table-wrapper">
                <table className="projects-table">
                    <thead>
                        <tr>
                            <th onClick={() => handleSort('name')} className="sortable">
                                Name {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('path')} className="sortable">
                                Path {sortBy === 'path' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('depth')} className="sortable">
                                Level {sortBy === 'depth' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedProjects.map((project) => {
                            const level = getLevelBadge(project.depth);
                            return (
                                <tr key={project.path}>
                                    <td className="project-name">
                                        {project.hasChildren ? '📁' : '📄'} {project.name}
                                    </td>
                                    <td className="project-path">{project.path}</td>
                                    <td>
                                        <span className={`level-badge ${level.className}`}>
                                            {level.label}
                                        </span>
                                    </td>
                                    <td>
                                        <Link href={`/project/${project.path}`} className="btn-view">
                                            View →
                                        </Link>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className="pagination">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="pagination-btn"
                    >
                        ← Previous
                    </button>
                    <span className="pagination-info">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="pagination-btn"
                    >
                        Next →
                    </button>
                </div>
            )}

            <style jsx>{`
                .projects-table-container {
                    margin-bottom: 3rem;
                }

                .table-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.5rem;
                }

                .table-header h2 {
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

                .table-controls {
                    margin-bottom: 1.5rem;
                }

                .search-input {
                    width: 100%;
                    max-width: 400px;
                    padding: 0.75rem 1rem;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 8px;
                    color: var(--text-primary);
                    font-size: 0.95rem;
                    transition: all 0.2s;
                }

                .search-input:focus {
                    outline: none;
                    border-color: var(--accent-primary);
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }

                .table-wrapper {
                    overflow-x: auto;
                    border-radius: 12px;
                    border: 1px solid var(--border-color);
                }

                .projects-table {
                    width: 100%;
                    border-collapse: collapse;
                    background: var(--bg-secondary);
                }

                .projects-table thead {
                    background: var(--bg-tertiary);
                }

                .projects-table th {
                    padding: 1rem;
                    text-align: left;
                    font-size: 0.85rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--text-secondary);
                    font-weight: 600;
                    border-bottom: 1px solid var(--border-color);
                }

                .projects-table th.sortable {
                    cursor: pointer;
                    user-select: none;
                    transition: all 0.2s;
                }

                .projects-table th.sortable:hover {
                    color: var(--accent-primary);
                }

                .projects-table td {
                    padding: 1rem;
                    border-bottom: 1px solid var(--border-color);
                    color: var(--text-secondary);
                }

                .projects-table tbody tr {
                    transition: all 0.2s;
                }

                .projects-table tbody tr:hover {
                    background: var(--bg-tertiary);
                }

                .project-name {
                    font-weight: 500;
                    color: var(--text-primary);
                }

                .project-path {
                    font-family: monospace;
                    font-size: 0.85rem;
                }

                .level-badge {
                    display: inline-block;
                    padding: 0.25rem 0.75rem;
                    border-radius: 12px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                }

                .level-badge.level-root {
                    background: rgba(99, 102, 241, 0.2);
                    color: var(--accent-primary);
                }

                .level-badge.level-1 {
                    background: rgba(16, 185, 129, 0.2);
                    color: #10b981;
                }

                .level-badge.level-2 {
                    background: rgba(245, 158, 11, 0.2);
                    color: #f59e0b;
                }

                .level-badge.level-3 {
                    background: rgba(107, 114, 128, 0.2);
                    color: #6b7280;
                }

                .btn-view {
                    display: inline-block;
                    padding: 0.5rem 1rem;
                    background: var(--accent-glow);
                    color: var(--accent-primary);
                    border-radius: 6px;
                    font-weight: 500;
                    font-size: 0.85rem;
                    text-decoration: none;
                    transition: all 0.2s;
                }

                .btn-view:hover {
                    background: var(--accent-primary);
                    color: white;
                    transform: translateX(2px);
                }

                .pagination {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 1rem;
                    margin-top: 1.5rem;
                }

                .pagination-btn {
                    padding: 0.5rem 1rem;
                    background: var(--bg-tertiary);
                    border: 1px solid var(--border-color);
                    border-radius: 6px;
                    color: var(--text-primary);
                    cursor: pointer;
                    transition: all 0.2s;
                    font-weight: 500;
                }

                .pagination-btn:hover:not(:disabled) {
                    background: var(--accent-glow);
                    border-color: var(--accent-primary);
                    color: var(--accent-primary);
                }

                .pagination-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .pagination-info {
                    color: var(--text-secondary);
                    font-size: 0.9rem;
                }

                @media (max-width: 768px) {
                    .search-input {
                        max-width: 100%;
                    }

                    .projects-table th,
                    .projects-table td {
                        padding: 0.75rem 0.5rem;
                        font-size: 0.85rem;
                    }
                }
            `}</style>
        </div>
    );
}
