import { notFound } from 'next/navigation';
import { getDirectoryContent, getFileContent } from '@/lib/fs-utils';
import { collectMeetings, meetingDateFromName } from '@/lib/meetings';
import ProjectView from '@/components/project/ProjectView';

export async function generateMetadata({ params }) {
    const resolved = await params;
    const segments = (resolved.path || []).map((s) => decodeURIComponent(s));
    return { title: segments[segments.length - 1] || 'Proyecto' };
}

/** Read a file, returning '' rather than throwing when it is absent. */
/**
 * La duración de la reunión, del json de marcas de tiempo.
 *
 * Es lo único que se saca de ese fichero aquí: sirve para que la portada de una
 * reunión sin vídeo diga cuánto duró, que es la primera pregunta al mirarla.
 */
async function readDuration(path) {
    try {
        const raw = await getFileContent(path);
        const seconds = JSON.parse(raw || '{}').duration;
        return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
    } catch {
        // Un json a medio escribir no debe tumbar la página del proyecto.
        return null;
    }
}

async function readOptional(path) {
    try {
        return (await getFileContent(path)) || '';
    } catch (error) {
        console.error(`Error reading ${path}:`, error);
        return '';
    }
}

export default async function ProjectPage({ params }) {
    const resolved = await params;
    const segments = (resolved.path || []).map((segment) => decodeURIComponent(segment));
    const projectPath = segments.join('/');

    let items;
    try {
        items = await getDirectoryContent(projectPath);
    } catch {
        notFound();
    }

    if (!items) notFound();

    const subprojects = items.filter((item) => item.type === 'folder');
    const files = items.filter((item) => item.type === 'file');

    const byName = new Map(files.map((f) => [f.name, f]));

    const [description, tasks, links] = await Promise.all([
        byName.has('description.md') ? readOptional(`${projectPath}/description.md`) : '',
        byName.has('tasks.md') ? readOptional(`${projectPath}/tasks.md`) : '',
        byName.has('links.md') ? readOptional(`${projectPath}/links.md`) : '',
    ]);

    // Una reunión es una grabación **o** una transcripción, con lo que tenga al
    // lado. Antes se armaba solo desde el fichero de vídeo, así que sin la
    // grabación —que ya no se sincroniza con Drive— desaparecía de la pestaña
    // aunque su transcripción y su resumen siguieran ahí.
    const meetings = await Promise.all(
        collectMeetings(files).map(async (grupo) => {
            // La fecha del fichero deja de ser fiable en cuanto se sincroniza:
            // pasa a ser la de la subida. El nombre suele llevar la de verdad.
            const fromName = meetingDateFromName(grupo.baseName);
            const anyFile = grupo.media || grupo.transcript || grupo.segments || grupo.summary;

            return {
                name: grupo.media ? grupo.media.name : null,
                baseName: grupo.baseName,
                path: grupo.media ? grupo.media.path : null,
                mtime: anyFile ? anyFile.mtime : null,
                date: (fromName || (anyFile ? new Date(anyFile.mtime) : null))?.toISOString() ?? null,
                dateFromName: Boolean(fromName),
                kind: grupo.kind,
                transcriptPath: grupo.transcript ? grupo.transcript.path : null,
                // Present only once the recording has been transcribed by a
                // version of the script that emits timestamps.
                segmentsPath: grupo.segments ? grupo.segments.path : null,
                duration: grupo.segments
                    ? await readDuration(`${projectPath}/${grupo.segments.name}`)
                    : null,
                summaryContent: grupo.summary
                    ? await readOptional(`${projectPath}/${grupo.summary.name}`)
                    : '',
            };
        })
    );

    // Lo más reciente primero. Con fecha reconocida se ordena por ella; si no,
    // por nombre, que es lo que se hacía antes.
    meetings.sort((a, b) => {
        if (a.date && b.date && a.date !== b.date) return b.date.localeCompare(a.date);
        return b.baseName.localeCompare(a.baseName);
    });

    return (
        <ProjectView
            projectPath={projectPath}
            subprojects={subprojects}
            files={files}
            description={description}
            tasks={tasks}
            meetings={meetings}
            links={links}
        />
    );
}
