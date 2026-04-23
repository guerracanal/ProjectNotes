'use client';

import { useState } from 'react';
import { parseTasks, serializeTasks, formatTimestamp, generateNoteFilename } from '@/lib/task-parser';

export default function TaskEditor({ projectPath, initialContent }) {
  const [tasks, setTasks] = useState(() => parseTasks(initialContent));
  const [originalContent] = useState(initialContent);
  const [newTaskText, setNewTaskText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleToggle = (taskId) => {
    setTasks(tasks.map(task =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    ));
  };

  const handleDelete = (taskId) => {
    setTasks(tasks.filter(task => task.id !== taskId));
  };

  const handleAddTask = () => {
    if (!newTaskText.trim()) return;

    const now = new Date();
    const timestamp = formatTimestamp(now);

    const newTask = {
      id: Date.now(),
      text: newTaskText,
      completed: false,
      timestamp: timestamp,
      line: undefined // New task, no line number
    };

    setTasks([...tasks, newTask]);
    setNewTaskText('');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedContent = serializeTasks(tasks, originalContent);

      console.log('Saving tasks:', {
        totalTasks: tasks.length,
        newTasks: tasks.filter(t => t.line === undefined).length,
        existingTasks: tasks.filter(t => t.line !== undefined).length,
        contentLength: updatedContent.length
      });

      const response = await fetch(`/api/projects/${projectPath}/tasks.md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: updatedContent })
      });

      if (response.ok) {
        console.log('Tasks saved successfully');
        alert('✅ Tasks saved successfully!');
        window.location.reload(); // Refresh to update content
      } else {
        const errorText = await response.text();
        console.error('Save failed:', response.status, errorText);
        alert(`❌ Error saving tasks: ${response.status} ${response.statusText}`);
      }
    } catch (e) {
      console.error('Error saving tasks:', e);
      alert(`❌ Error saving tasks: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenNote = async (task) => {
    const filename = generateNoteFilename(task);
    const notePath = `${projectPath}/${filename}`;

    // Check if note exists, if not create it
    try {
      const response = await fetch(`/api/projects/${notePath}?type=file`);

      if (!response.ok) {
        // Create the note file
        const initialContent = `# ${task.text}\n\nCreated: ${task.timestamp}\n\n---\n\n`;

        await fetch(`/api/projects/${projectPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_file',
            name: filename,
            content: initialContent
          })
        });
      }

      // Navigate to notes tab and select this file
      window.location.href = `/project/${projectPath}?tab=notes&file=${filename}`;
    } catch (e) {
      console.error('Error opening note:', e);
      alert('Error opening note');
    }
  };

  const pendingCount = tasks.filter(t => !t.completed).length;

  return (
    <div className="task-editor">
      <div className="task-header">
        <div>
          <h3>Project Tasks</h3>
          <p className="task-summary">
            {pendingCount} pending · {tasks.length} total
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="task-list">
        {tasks.map(task => (
          <div key={task.id} className="task-item">
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => handleToggle(task.id)}
            />
            <div className="task-content">
              <span className={task.completed ? 'completed' : ''}>
                {task.text}
              </span>
              {task.timestamp && (
                <span className="task-timestamp">
                  {task.timestamp}
                </span>
              )}
            </div>
            <div className="task-actions">
              <button
                className="note-btn"
                onClick={() => handleOpenNote(task)}
                title="Open/Create note for this task"
              >
                📝
              </button>
              <button
                className="delete-btn"
                onClick={() => handleDelete(task.id)}
                title="Delete task"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="add-task">
        <input
          type="text"
          placeholder="Add new task..."
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddTask()}
        />
        <button className="btn btn-primary" onClick={handleAddTask}>
          + Add
        </button>
      </div>

      <style jsx>{`
        .task-editor {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .task-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .task-summary {
          color: var(--text-secondary);
          font-size: 0.9rem;
          margin-top: 0.25rem;
        }

        .task-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .task-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background: var(--bg-tertiary);
          border-radius: 8px;
          transition: all 0.2s;
        }

        .task-item:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .task-item input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .task-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .task-content span {
          color: var(--text-primary);
        }

        .task-content span.completed {
          text-decoration: line-through;
          color: var(--text-secondary);
        }

        .task-timestamp {
          font-size: 0.75rem;
          color: var(--text-secondary);
          opacity: 0.7;
        }

        .task-actions {
          display: flex;
          gap: 0.5rem;
        }

        .note-btn, .delete-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 1.2rem;
          opacity: 0.5;
          transition: opacity 0.2s;
          padding: 0.25rem;
        }

        .note-btn:hover, .delete-btn:hover {
          opacity: 1;
        }

        .add-task {
          display: flex;
          gap: 0.75rem;
        }

        .add-task input {
          flex: 1;
          padding: 0.75rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-primary);
          outline: none;
        }

        .add-task input:focus {
          border-color: var(--accent-primary);
        }
      `}</style>
    </div>
  );
}
