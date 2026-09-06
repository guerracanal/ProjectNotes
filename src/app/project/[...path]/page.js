import { notFound } from 'next/navigation';
import { getDirectoryContent, getFileContent, VIDEO_EXTENSIONS } from '@/lib/fs-utils';
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

    // A "meeting" is a video plus whatever transcript and summary sit beside it.
    const videos = files.filter((f) =>
        VIDEO_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
    );

    const meetings = await Promise.all(
        videos.map(async (video) => {
            const baseName = video.name.slice(0, video.name.lastIndexOf('.'));
            const transcript = byName.get(`${baseName}_transcripcion.txt`);
            const summary = byName.get(`${baseName}_transcripcion_resumen.txt`);

            return {
                name: video.name,
                baseName,
                path: video.path,
                mtime: video.mtime,
                transcriptPath: transcript ? transcript.path : null,
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
