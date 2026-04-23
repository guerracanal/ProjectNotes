'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSidebar } from '@/contexts/SidebarContext';
import { useSettings } from '@/contexts/SettingsContext';

function TreeNode({ node, pathname, depth = 0, forceOpen = false }) {
  const [isNodeOpen, setIsNodeOpen] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isActive = pathname === `/project/${node.path}`;
  const isParent = depth === 0;

  useEffect(() => {
    if (forceOpen) {
      setIsNodeOpen(true);
    }
  }, [forceOpen]);

  return (
    <li style={{ paddingLeft: depth === 0 ? 0 : '0.75rem' }}>
      <div className={`tree-node depth-${depth} ${isParent ? 'parent' : ''} ${isActive ? 'active-node' : ''}`}>
        <button
          className={`toggle-btn ${hasChildren ? 'visible' : 'hidden'}`}
          onClick={(e) => {
            e.stopPropagation();
            setIsNodeOpen(!isNodeOpen);
          }}
        >
          <span className={`arrow ${isNodeOpen ? 'open' : ''}`}>›</span>
        </button>

        <Link
          href={`/project/${node.path}`}
          className={`node-link ${isActive ? 'active' : ''} ${isParent ? 'parent-link' : ''}`}
          title={node.name}
        >
          <span
            className="node-icon"
            style={{
              color: `var(--folder-color-${Math.min(depth, 5)})`
            }}
          >
            {!hasChildren
              ? '📘'
              : depth === 0
                ? '🗃️'
                : depth === 1
                  ? '📂'
                  : '📁'}
          </span>
          <span className="node-name">{node.name}</span>
        </Link>
      </div>

      {hasChildren && isNodeOpen && (
        <ul className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              pathname={pathname}
              depth={depth + 1}
              forceOpen={forceOpen}
            />
          ))}
        </ul>
      )}
      <style jsx>{`
        li {
          position: relative;
        }
        
        /* Guide line for nesting */
        li:before {
          content: '';
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 1px;
          background: var(--border-color);
          opacity: 0.3;
          display: ${depth > 0 ? 'block' : 'none'};
        }

        .tree-node {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.25rem 0;
          border-radius: 4px;
          transition: background-color 0.2s;
        }

        .tree-node:hover {
          background-color: var(--bg-tertiary);
        }
        
        .tree-node.active-node {
          background-color: rgba(99, 102, 241, 0.1);
        }

        .toggle-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 0;
          width: 1.2rem;
          height: 1.2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: color 0.2s;
        }
        
        .toggle-btn.hidden {
          visibility: hidden;
        }

        .toggle-btn:hover {
          color: var(--text-primary);
        }

        .arrow {
          display: inline-block;
          font-size: 1.1rem;
          line-height: 1;
          transition: transform 0.2s ease;
          transform-origin: center;
        }

        .arrow.open {
          transform: rotate(90deg);
        }

        .node-link {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex: 1;
          min-width: 0; /* Enable text truncation */
          text-decoration: none;
          color: var(--text-secondary);
          font-size: 0.9rem;
          padding: 0.1rem 0.25rem;
          border-radius: 4px;
        }

        .node-link:hover {
          color: var(--text-primary);
        }

        .node-link.active {
          color: var(--accent-primary);
          font-weight: 500;
        }
        
        .node-icon {
          font-size: 1rem;
          opacity: 0.8;
          flex-shrink: 0;
        }

        .node-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tree-children {
          list-style: none;
          padding-left: 0;
          margin: 0;
        }
      `}</style>
    </li>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(true);
  const { isOpen, setIsOpen } = useSidebar();
  const { settings, updateSettings } = useSettings();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [parentFolder, setParentFolder] = useState('Cajon');
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter tree based on search term
  const filterTree = (nodes, term) => {
    if (!term) return nodes;

    return nodes.reduce((acc, node) => {
      const matches = node.name.toLowerCase().includes(term.toLowerCase());
      const filteredChildren = node.children ? filterTree(node.children, term) : [];

      if (matches || filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: filteredChildren
        });
      }

      return acc;
    }, []);
  };

  const filteredTree = filterTree(tree, searchTerm);

  // Flatten tree to get all folder paths for parent selection
  const getAllFolders = (nodes, prefix = '') => {
    let folders = [];
    if (!nodes) return folders;

    nodes.forEach(node => {
      const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
      folders.push(fullPath);
      if (node.children && node.children.length > 0) {
        folders = folders.concat(getAllFolders(node.children, fullPath));
      }
    });
    return folders;
  };

  const folderOptions = ['Cajon', ...getAllFolders(tree)];

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      alert('Please enter a project name');
      return;
    }

    setIsCreating(true);
    try {
      const projectPath = parentFolder === 'Cajon'
        ? newProjectName
        : `${parentFolder}/${newProjectName}`;

      const response = await fetch(`/api/projects/${parentFolder}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_folder',
          name: newProjectName
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create project');
      }

      // Reload tree
      const treeResponse = await fetch('/api/tree');
      const treeData = await treeResponse.json();
      setTree(treeData.tree || []);

      // Reset and close modal
      setNewProjectName('');
      setParentFolder('Cajon');
      setShowCreateModal(false);

      alert('Project created successfully!');
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Error creating project: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    fetch('/api/tree')
      .then(res => res.json())
      .then(data => {
        setTree(data.tree || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading tree:', err);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <button
        className="sidebar-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle sidebar"
        title={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {isOpen ? '✕' : '☰'}
      </button>

      <aside className={`sidebar ${isOpen ? 'open' : 'closed'}`}>
        <div className="logo">
          <Link href="/">
            <h2>ProjectNotes</h2>
          </Link>
        </div>

        <nav>
          <div className="nav-section">
            <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
              🏠 Dashboard
            </Link>
          </div>

          <div className="nav-section">
            <h3 className="section-title">Ajustes</h3>
            <button
              className={`nav-link settings-btn ${!settings.showMeetings ? 'muted' : ''}`}
              onClick={() => updateSettings({ showMeetings: !settings.showMeetings })}
            >
              {settings.showMeetings ? 'On' : 'Off'}
            </button>
          </div>

          <div className="nav-section">
            <h3 className="section-title">Projects</h3>

            {/* Search Input */}
            <div className="search-container">
              <input
                type="text"
                placeholder="🔍 Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>

            {loading ? (
              <p className="loading">Loading...</p>
            ) : (
              <ul className="tree-root">
                {filteredTree.map((node) => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    pathname={pathname}
                    forceOpen={!!searchTerm}
                  />
                ))}
                {filteredTree.length === 0 && searchTerm && (
                  <p className="empty-search">No projects found.</p>
                )}
              </ul>
            )}
          </div>
        </nav>

        <div className="sidebar-footer">
          <button
            className="create-project-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + New Project
          </button>
        </div>

        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Create New Project</h3>

              <div className="form-group">
                <label>Project Name:</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Enter project name..."
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Parent Folder:</label>
                <select
                  value={parentFolder}
                  onChange={(e) => setParentFolder(e.target.value)}
                >
                  {folderOptions.map(folder => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-actions">
                <button
                  className="btn-cancel"
                  onClick={() => setShowCreateModal(false)}
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  className="btn-create"
                  onClick={handleCreateProject}
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        <style jsx global>{`
          :root {
            --folder-color-0: #6366f1; /* Indigo */
            --folder-color-1: #10b981; /* Emerald */
            --folder-color-2: #f59e0b; /* Amber */
            --folder-color-3: #ec4899; /* Pink */
            --folder-color-4: #8b5cf6; /* Violet */
            --folder-color-5: #64748b; /* Slate */
          }

          .sidebar-toggle-btn {
            position: fixed;
            top: 1rem;
            left: ${isOpen ? '210px' : '1rem'};
            z-index: 1001;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--text-primary);
            font-size: 1.2rem;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          }

          .sidebar-toggle-btn:hover {
            background: var(--bg-tertiary);
            border-color: var(--accent-primary);
            transform: scale(1.05);
          }

          @media (max-width: 768px) {
            .sidebar-toggle-btn {
              left: 1rem !important;
            }
          }
        `}</style>

        <style jsx>{`
          .sidebar {
            position: fixed;
            top: 0;
            left: 0;
            height: 100vh;
            width: 250px;
            background: var(--bg-secondary);
            border-right: 1px solid var(--border-color);
            padding: 1.5rem;
            z-index: 1000;
            transition: transform 0.3s ease;
            display: flex;
            flex-direction: column;
          }

          .sidebar.closed {
            transform: translateX(-100%);
          }

          .sidebar.open {
            transform: translateX(0);
          }

          @media (max-width: 768px) {
            .sidebar {
              width: 80%;
              max-width: 300px;
            }
          }

          .logo {
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border-color);
            flex-shrink: 0;
          }

          .logo h2 {
            font-size: 1.3rem;
            color: var(--accent-primary);
            margin: 0;
            cursor: pointer;
            transition: color 0.2s;
          }

          .logo h2:hover {
            color: var(--accent-secondary);
          }

          nav {
            flex: 1;
            overflow-y: auto;
            min-height: 0; /* Crucial for nested flex scrolling */
            padding-right: 0.5rem; /* Avoid scrollbar covering content */
            margin-right: -0.5rem; /* Compensate padding */
          }

          /* Custom scrollbar for nav */
          nav::-webkit-scrollbar {
            width: 4px;
          }
          
          nav::-webkit-scrollbar-track {
            background: transparent;
          }
          
          nav::-webkit-scrollbar-thumb {
            background: var(--bg-tertiary);
            border-radius: 4px;
          }

          .nav-section {
            margin-bottom: 2rem;
          }

          .section-title {
            font-size: 0.8rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.75rem;
            font-weight: 600;
          }

          .nav-link {
            display: block;
            padding: 0.75rem;
            border-radius: 6px;
            color: var(--text-secondary);
            text-decoration: none;
            transition: all 0.2s;
            cursor: pointer;
          }

          .nav-link:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
          }

          .nav-link.active {
            background: var(--accent-primary);
            color: white;
            font-weight: 500;
          }

          .settings-btn {
            width: 100%;
            text-align: left;
            background: transparent;
            border: none;
            font-size: 1rem; /* Match other links */
          }
          
          .settings-btn.muted {
            opacity: 0.7;
            font-style: italic;
          }

          .tree-root {
            list-style: none;
            padding: 0;
            margin: 0;
          }

          /* Removed global link styles to allow TreeNode component styles to work correctly */

          .loading {
            color: var(--text-secondary);
            font-size: 0.85rem;
            padding: 0.5rem;
          }

          .sidebar-footer {
            padding-top: 1rem;
            border-top: 1px solid var(--border-color);
            background: var(--bg-secondary);
            flex-shrink: 0;
            margin-top: auto; /* Push to bottom if content is short */
          }

          .create-project-btn {
            width: 100%;
            padding: 0.75rem;
            background: var(--accent-primary);
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 0.9rem;
          }

          .create-project-btn:hover {
            background: var(--accent-secondary);
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(99, 102, 241, 0.3);
          }

          .search-container {
            margin-bottom: 1rem;
          }

          .search-input {
            width: 100%;
            padding: 0.6rem;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 0.9rem;
            transition: all 0.2s;
          }

          .search-input:focus {
            outline: none;
            border-color: var(--accent-primary);
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
          }

          .empty-search {
            color: var(--text-secondary);
            font-size: 0.85rem;
            font-style: italic;
            text-align: center;
            padding: 1rem 0;
          }

          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            backdrop-filter: blur(4px);
          }

          .modal-content {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 2rem;
            width: 90%;
            max-width: 500px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          }

          .modal-content h3 {
            margin: 0 0 1.5rem 0;
            color: var(--text-primary);
            font-size: 1.5rem;
          }

          .form-group {
            margin-bottom: 1.5rem;
          }

          .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            color: var(--text-secondary);
            font-size: 0.9rem;
            font-weight: 500;
          }

          .form-group input,
          .form-group select {
            width: 100%;
            padding: 0.75rem;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 1rem;
            transition: all 0.2s;
          }

          .form-group input:focus,
          .form-group select:focus {
            outline: none;
            border-color: var(--accent-primary);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
          }

          .modal-actions {
            display: flex;
            gap: 1rem;
            justify-content: flex-end;
            margin-top: 2rem;
          }

          .btn-cancel,
          .btn-create {
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            font-size: 0.95rem;
          }

          .btn-cancel {
            background: var(--bg-tertiary);
            color: var(--text-secondary);
          }

          .btn-cancel:hover:not(:disabled) {
            background: var(--bg-primary);
            color: var(--text-primary);
          }

          .btn-create {
            background: var(--accent-primary);
            color: white;
          }

          .btn-create:hover:not(:disabled) {
            background: var(--accent-secondary);
            box-shadow: 0 4px 8px rgba(99, 102, 241, 0.3);
          }

          .btn-cancel:disabled,
          .btn-create:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}</style>
      </aside>
    </>
  );
}
