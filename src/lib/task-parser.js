/**
 * Task parser and serializer for markdown checkbox lists
 */

export function parseTasks(markdownContent) {
    if (!markdownContent) return [];

    const lines = markdownContent.split('\n');
    const tasks = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Match checkbox pattern with optional timestamp: - [ ] Task text (Created: 2025-11-28 13:59)
        const checkboxMatch = trimmed.match(/^-\s+\[([ xX])\]\s+(.+)$/);

        if (checkboxMatch) {
            const completed = checkboxMatch[1].toLowerCase() === 'x';
            const fullText = checkboxMatch[2];

            // Try to extract timestamp from format: (Created: YYYY-MM-DD HH:MM)
            const timestampMatch = fullText.match(/^(.*?)\s*\(Created:\s*(.+?)\)\s*$/);

            let text, timestamp;
            if (timestampMatch) {
                text = timestampMatch[1].trim();
                timestamp = timestampMatch[2].trim();
            } else {
                text = fullText;
                timestamp = null;
            }

            tasks.push({
                id: i,
                text: text,
                completed: completed,
                timestamp: timestamp,
                line: i
            });
        }
    }

    return tasks;
}

export function serializeTasks(tasks, originalContent) {
    if (!originalContent) {
        // Create new content from scratch
        return tasks.map(task => {
            const checkbox = task.completed ? '[x]' : '[ ]';
            const timestampStr = task.timestamp ? ` (Created: ${task.timestamp})` : '';
            return `- ${checkbox} ${task.text}${timestampStr}`;
        }).join('\n');
    }

    const lines = originalContent.split('\n');
    const taskLineNumbers = new Set();

    // Update existing tasks by line number
    tasks.forEach(task => {
        if (task.line !== undefined && task.line < lines.length) {
            const checkbox = task.completed ? '[x]' : '[ ]';
            const timestampStr = task.timestamp ? ` (Created: ${task.timestamp})` : '';
            lines[task.line] = `- ${checkbox} ${task.text}${timestampStr}`;
            taskLineNumbers.add(task.line);
        }
    });

    // Remove deleted tasks (lines that were tasks but aren't in current task list)
    const originalLines = originalContent.split('\n');
    for (let i = originalLines.length - 1; i >= 0; i--) {
        const trimmed = originalLines[i].trim();
        const isTaskLine = trimmed.match(/^-\s+\[([ xX])\]\s+(.+)$/);
        if (isTaskLine && !taskLineNumbers.has(i)) {
            lines.splice(i, 1);
        }
    }

    // Append new tasks to the end
    const newTasks = tasks.filter(task => task.line === undefined);
    newTasks.forEach(task => {
        const checkbox = task.completed ? '[x]' : '[ ]';
        const timestampStr = task.timestamp ? ` (Created: ${task.timestamp})` : '';
        lines.push(`- ${checkbox} ${task.text}${timestampStr}`);
    });

    return lines.join('\n');
}

export function addTask(markdownContent, taskText, timestamp) {
    const timestampStr = timestamp ? ` (Created: ${timestamp})` : '';
    const newLine = `- [ ] ${taskText}${timestampStr}`;
    return markdownContent ? `${markdownContent}\n${newLine}` : newLine;
}

export function deleteTask(markdownContent, lineNumber) {
    const lines = markdownContent.split('\n');
    lines.splice(lineNumber, 1);
    return lines.join('\n');
}

export function generateNoteFilename(task) {
    // Generate filename: task_YYYYMMDD_HHMMSS_sanitized-title.md
    if (!task.timestamp) {
        const now = new Date();
        task.timestamp = formatTimestamp(now);
    }

    const dateStr = task.timestamp.replace(/[-:\s]/g, '').substring(0, 15); // YYYYMMDDHHMMSS
    const sanitized = task.text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .substring(0, 50);

    return `task_${dateStr}_${sanitized}.md`;
}

export function formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}`;
}
