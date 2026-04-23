'use client';

export default function MarkdownToolbar({ textareaRef, onUpdate }) {
    const insertText = (before, after = '') => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selection = text.substring(start, end);

        const newText = text.substring(0, start) + before + selection + after + text.substring(end);

        // Update content via callback
        onUpdate(newText);

        // Restore focus and cursor
        setTimeout(() => {
            textarea.focus();
            const newCursorPos = start + before.length + selection.length + after.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }, 0);
    };

    const insertList = (type) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selection = text.substring(start, end);

        // If there's a selection, try to apply list to each line
        if (selection) {
            const lines = selection.split('\n');
            const prefix = type === 'ol' ? '1. ' : '- ';
            const newSelection = lines.map((line, i) => {
                if (type === 'ol') return `${i + 1}. ${line}`;
                return `- ${line}`;
            }).join('\n');

            const newText = text.substring(0, start) + newSelection + text.substring(end);
            onUpdate(newText);
        } else {
            // Just insert a new list item
            const prefix = type === 'ol' ? '1. ' : '- ';
            insertText(prefix);
        }
    };

    const insertTable = () => {
        const template =
            `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |`;
        insertText(template);
    };

    const indentLines = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;

        // Find start of the line where selection starts
        let lineStart = text.lastIndexOf('\n', start - 1) + 1;
        if (lineStart === -1) lineStart = 0;

        // Find end of the line where selection ends
        let lineEnd = text.indexOf('\n', end);
        if (lineEnd === -1) lineEnd = text.length;

        const selectedText = text.substring(lineStart, lineEnd);
        const lines = selectedText.split('\n');
        const indentedLines = lines.map(line => '  ' + line).join('\n');

        const newText = text.substring(0, lineStart) + indentedLines + text.substring(lineEnd);
        onUpdate(newText);

        // Restore selection including new indentation
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(lineStart, lineStart + indentedLines.length);
        }, 0);
    };

    const unindentLines = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;

        // Find start of the line where selection starts
        let lineStart = text.lastIndexOf('\n', start - 1) + 1;
        if (lineStart === -1) lineStart = 0;

        // Find end of the line where selection ends
        let lineEnd = text.indexOf('\n', end);
        if (lineEnd === -1) lineEnd = text.length;

        const selectedText = text.substring(lineStart, lineEnd);
        const lines = selectedText.split('\n');
        const unindentedLines = lines.map(line => line.replace(/^ {1,2}/, '')).join('\n');

        const newText = text.substring(0, lineStart) + unindentedLines + text.substring(lineEnd);
        onUpdate(newText);

        // Restore selection
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(lineStart, lineStart + unindentedLines.length);
        }, 0);
    };

    return (
        <div className="markdown-toolbar">
            <div className="toolbar-group">
                <button onClick={() => insertText('# ')} title="Heading 1">H1</button>
                <button onClick={() => insertText('## ')} title="Heading 2">H2</button>
                <button onClick={() => insertText('### ')} title="Heading 3">H3</button>
            </div>

            <div className="toolbar-group">
                <button onClick={() => insertText('**', '**')} title="Bold">B</button>
                <button onClick={() => insertText('*', '*')} title="Italic">I</button>
                <button onClick={() => insertText('`', '`')} title="Inline Code">{'<>'}</button>
            </div>

            <div className="toolbar-group">
                <button onClick={() => insertList('ul')} title="Bullet List">• List</button>
                <button onClick={() => insertList('ol')} title="Numbered List">1. List</button>
                <button onClick={() => insertText('- [ ] ')} title="Checklist">☑ List</button>
                <button onClick={indentLines} title="Indent (Add 2 spaces)">⇥ Indent</button>
                <button onClick={unindentLines} title="Unindent (Remove 2 spaces)">⇤ Unindent</button>
            </div>

            <div className="toolbar-group">
                <button onClick={() => insertText('```\n', '\n```')} title="Code Block">Code Block</button>
                <button onClick={insertTable} title="Table">Table</button>
                <button onClick={() => insertText('[Link Text](url)')} title="Link">Link</button>
                <button onClick={() => insertText('![Alt Text](url)')} title="Image">Image</button>
            </div>

            <style jsx>{`
        .markdown-toolbar {
          display: flex;
          gap: 1rem;
          padding: 0.5rem;
          background: var(--bg-tertiary);
          border-bottom: 1px solid var(--border-color);
          border-radius: 8px 8px 0 0;
          flex-wrap: wrap;
        }

        .toolbar-group {
          display: flex;
          gap: 0.25rem;
          padding-right: 1rem;
          border-right: 1px solid var(--border-color);
        }

        .toolbar-group:last-child {
          border-right: none;
        }

        button {
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-secondary);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          transition: all 0.2s;
        }

        button:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
          border-color: var(--border-color);
        }
      `}</style>
        </div>
    );
}
