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
        <div className="markdown-toolbar no-scrollbar">
            <div className="tb-group">
                <button onClick={() => insertText('# ')} title="Encabezado 1">H1</button>
                <button onClick={() => insertText('## ')} title="Encabezado 2">H2</button>
                <button onClick={() => insertText('### ')} title="Encabezado 3">H3</button>
            </div>

            <div className="tb-group">
                <button onClick={() => insertText('**', '**')} title="Negrita" style={{ fontWeight: 800 }}>B</button>
                <button onClick={() => insertText('*', '*')} title="Cursiva" style={{ fontStyle: 'italic' }}>I</button>
                <button onClick={() => insertText('`', '`')} title="Código en línea" className="mono">{'<>'}</button>
            </div>

            <div className="tb-group">
                <button onClick={() => insertList('ul')} title="Lista con viñetas">• Lista</button>
                <button onClick={() => insertList('ol')} title="Lista numerada">1. Lista</button>
                <button onClick={() => insertText('- [ ] ')} title="Lista de tareas">☑ Tareas</button>
                <button onClick={indentLines} title="Aumentar sangría">⇥</button>
                <button onClick={unindentLines} title="Reducir sangría">⇤</button>
            </div>

            <div className="tb-group">
                <button onClick={() => insertText('```\n', '\n```')} title="Bloque de código">Código</button>
                <button onClick={insertTable} title="Tabla">Tabla</button>
                <button onClick={() => insertText('[texto](url)')} title="Enlace">Enlace</button>
                <button onClick={() => insertText('![alt](url)')} title="Imagen">Imagen</button>
                <button onClick={() => insertText('> ')} title="Cita">Cita</button>
            </div>

            <style jsx>{`
                .markdown-toolbar {
                    display: flex;
                    gap: var(--sp-3);
                    padding: var(--sp-2) var(--sp-3);
                    background: var(--surface-2);
                    border-bottom: 1px solid var(--border);
                    overflow-x: auto;
                    flex-shrink: 0;
                }

                .tb-group {
                    display: flex;
                    gap: 2px;
                    padding-right: var(--sp-3);
                    border-right: 1px solid var(--border);
                    flex-shrink: 0;
                }

                .tb-group:last-of-type {
                    border-right: none;
                    padding-right: 0;
                }

                button {
                    min-width: 28px;
                    height: 28px;
                    padding-inline: var(--sp-2);
                    border-radius: var(--r-sm);
                    color: var(--text-muted);
                    font-size: var(--fs-xs);
                    font-weight: 600;
                    white-space: nowrap;
                    transition: background var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
                }

                button:hover {
                    background: var(--surface-hover);
                    color: var(--accent);
                }
            `}</style>
        </div>
    );
}
