import { notFound } from 'next/navigation';
import {
    AUDIO_EXTENSIONS,
    VIDEO_EXTENSIONS,
    getDirectoryContent,
    getFileContent,
} from '@/lib/fs-utils';
import ProjectView from '@/components/project/ProjectView';

export async function generateMetadata({ params }) {
    const resolved = await params;
    const segments = (resolved.path || []).map((s) => decodeURIComponent(s));
    return { title: segments[segments.length - 1] || 'Proyecto' };
}

/** Read a file, returning '' rather than throwing when it is absent. */
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

    // A "meeting" is a recording plus whatever transcript and summary sit
    // beside it. Audio counts too — a voice note is a meeting with one person.
    const recordings = files.filter((f) => {
        const lower = f.name.toLowerCase();
        return [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS].some((ext) => lower.endsWith(ext));
    });

    const meetings = await Promise.all(
        recordings.map(async (media) => {
            const baseName = media.name.slice(0, media.name.lastIndexOf('.'));
            const transcript = byName.get(`${baseName}_transcripcion.txt`);
            const segments = byName.get(`${baseName}_transcripcion.json`);
            const summary = byName.get(`${baseName}_transcripcion_resumen.txt`);
            const isAudio = AUDIO_EXTENSIONS.some((ext) => media.name.toLowerCase().endsWith(ext));

            return {
                name: media.name,
                baseName,
                path: media.path,
                mtime: media.mtime,
                kind: isAudio ? 'audio' : 'video',
                transcriptPath: transcript ? transcript.path : null,
                // Present only once the recording has been transcribed by a
                // version of the script that emits timestamps.
                segmentsPath: segments ? segments.path : null,
                summaryContent: summary
                    ? await readOptional(`${projectPath}/${summary.name}`)
                    : '',
            };
        })
    );

    meetings.sort((a, b) => b.baseName.localeCompare(a.baseName));

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
