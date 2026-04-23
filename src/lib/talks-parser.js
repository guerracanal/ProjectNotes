
/**
 * Parsea el contenido de talks.md en un formato estructurado.
 * 
 * Formato esperado:
 * # Título de la charla
 * - Date: ...
 * - Video: ...
 * - Slides: ...
 * 
 * @param {string} content - Contenido raw del archivo markdown
 * @returns {Array} Array de objetos con la info de las charlas
 */
export function parseTalks(content) {
    if (!content) return [];

    const lines = content.split('\n');
    const talks = [];
    let currentTalk = null;

    // Regex para detectar propiedades: "- Key: Value"
    const propertyRegex = /^\s*-\s*([a-zA-Z0-9]+)\s*:\s*(.+)$/;

    // Limpiar summary de delimitadores si existen
    const cleanSummary = (summary) => {
        if (!summary) return '';
        let cleaned = summary.trim();
        // Eliminar ''' o """ del principio y final
        if ((cleaned.startsWith("'''") && cleaned.endsWith("'''")) ||
            (cleaned.startsWith('"""') && cleaned.endsWith('"""'))) {
            cleaned = cleaned.substring(3, cleaned.length - 3).trim();
        }
        return cleaned;
    };

    lines.forEach(line => {
        const trimmedLine = line.trim();

        // Detectar Título (H1 o H2)
        if (trimmedLine.startsWith('#')) {
            // Si ya teníamos una charla procesándose, la guardamos
            if (currentTalk) {
                currentTalk.summary = cleanSummary(currentTalk.summary);
                talks.push(currentTalk);
            }
            // ... (resto del código igual)


            // Limpiar el título de caracteres markdown (# y links)
            let title = trimmedLine.replace(/^#+\s*/, '');

            // Si el título es un link markdown [Texto](url), extraer solo el texto
            const linkMatch = title.match(/^\[(.*?)\]\(.*\)$/);
            if (linkMatch) {
                title = linkMatch[1];
            }

            currentTalk = {
                title: title,
                date: '',
                video: [],
                slides: [],
                link: '',
                notes: '',
                summary: '',
                customLinks: []
            };
        }
        // Detectar Propiedades
        else if (currentTalk && propertyRegex.test(trimmedLine)) {
            const match = trimmedLine.match(propertyRegex);
            const originalKey = match[1];
            const key = originalKey.toLowerCase();
            const value = match[2].trim();

            if (key === 'date' || key === 'fecha') currentTalk.date = value;
            else if (key === 'video') currentTalk.video.push(value);
            else if (key === 'slides' || key === 'presentation') {
                if (value) currentTalk.slides.push(value);
            }
            else if (key === 'link' || key === 'enlace') currentTalk.link = value;
            else if (key === 'notes' || key === 'notas') currentTalk.notes = value;
            else if (key === 'summary' || key === 'resumen') currentTalk.summary = value;
            else if (key === 'desc' || key === 'description') currentTalk.summary = value;
            else {
                // Cualquier otra clave se trata como un enlace personalizado
                currentTalk.customLinks.push({
                    label: originalKey, // Usamos la clave original para mantener mayúsculas (ej: CAS)
                    url: value
                });
            }
        }
        // Detectar contenido multilínea (para Summary)
        else if (currentTalk && trimmedLine.length > 0 && !trimmedLine.startsWith('<iframe')) {
            // Si la línea empieza con guión pero no es una propiedad clave:valor, es parte del resumen (lista)
            // O si es texto plano
            if (currentTalk.summary) {
                currentTalk.summary += '\n' + trimmedLine;
            } else {
                currentTalk.summary = trimmedLine;
            }
        }
        // Intentar rescatar iframes del formato antiguo (Legacy support)
        else if (currentTalk && trimmedLine.startsWith('<iframe')) {
            const srcMatch = trimmedLine.match(/src="([^"]+)"/);
            if (srcMatch) {
                const src = srcMatch[1];
                if (src.includes('presentation') || src.includes('google.com/presentation')) {
                    currentTalk.slides.push(src);
                } else {
                    currentTalk.video.push(src);
                }
            }
        }
    });

    // Añadir la última charla
    if (currentTalk) {
        currentTalk.summary = cleanSummary(currentTalk.summary);
        talks.push(currentTalk);
    }

    return talks;
}
