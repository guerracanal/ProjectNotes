import { getDirectoryContent, getFileContent } from '@/lib/fs-utils';
import ProjectView from '@/components/ProjectView';

export default async function ProjectPage({ params }) {
    const resolvedParams = await params;
    const pathSegments = (resolvedParams.path || []).map(segment => decodeURIComponent(segment));
    const projectPath = pathSegments.join('/');

    const items = await getDirectoryContent(projectPath);

    if (!items) {
        return (
            <div className="container" style={{ padding: '2rem' }}>
                <h1>Project Not Found</h1>
                <p>The folder "{projectPath}" does not exist.</p>
                <a href="/" style={{ color: 'var(--accent-primary)', marginTop: '1rem', display: 'inline-block' }}>Go back home</a>
            </div>
        );
    }

    const subprojects = items.filter(item => item.type === 'folder');
    const files = items.filter(item => item.type === 'file');

    // Try to fetch description and tasks
    let description = '';
    let tasks = '';
    let links = '';

    try {
        const descItem = files.find(f => f.name === 'description.md');
        if (descItem) {
            description = await getFileContent(`${projectPath}/description.md`);
        }
    } catch (e) {
        console.error('Error reading description', e);
    }

    try {
        const tasksItem = files.find(f => f.name === 'tasks.md');
        if (tasksItem) {
            tasks = await getFileContent(`${projectPath}/tasks.md`);
        }
    } catch (e) {
        console.error('Error reading tasks', e);
    }

    try {
        const linksItem = files.find(f => f.name === 'links.md');
        if (linksItem) {
            links = await getFileContent(`${projectPath}/links.md`);
        }
    } catch (e) {
        console.error('Error reading links', e);
    }

    // Process meetings
    const videoFiles = files.filter(f => f.name.endsWith('.mp4') || f.name.endsWith('.webm') || f.name.endsWith('.mkv'));

    const meetings = await Promise.all(videoFiles.map(async (video) => {
        const baseName = video.name.substring(0, video.name.lastIndexOf('.'));
        // Pattern: YYYY-MM-DD HH-MM-SS_transcripcion.txt
        const transcriptFile = files.find(f => f.name === `${baseName}_transcripcion.txt`);
        // Pattern: YYYY-MM-DD HH-MM-SS_transcripcion_resumen.txt
        const summaryFile = files.find(f => f.name === `${baseName}_transcripcion_resumen.txt`);

        let summaryContent = '';
        if (summaryFile) {
            try {
                summaryContent = await getFileContent(`${projectPath}/${summaryFile.name}`);
            } catch (e) {
                console.error(`Error reading summary for ${video.name}`, e);
            }
        }

        return {
            name: video.name,
            baseName: baseName,
            path: video.path, // Relative path for API/Link
            mtime: video.mtime,
            transcriptPath: transcriptFile ? transcriptFile.path : null,
            summaryContent: summaryContent
        };
    }));

    // Sort by baseName (title with date pattern) descending
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
