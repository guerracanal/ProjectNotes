import path from 'path';
import { NextResponse } from 'next/server';
import { getSafePath, statFile } from '@/lib/fs-utils';
import { createJob, getJob, updateJob } from '@/lib/job-store';
import { runPythonScript } from '@/lib/run-script';

const SCRIPT = path.join(process.cwd(), 'scripts', 'transcribir_video.py');

export async function POST(request) {
    try {
        const { videoPath } = await request.json();

        if (!videoPath) {
            return NextResponse.json({ error: 'Video path is required' }, { status: 400 });
        }

        // Confine the argument to projects_data before it reaches the script.
        let fullVideoPath;
        try {
            fullVideoPath = getSafePath(videoPath);
        } catch {
            return NextResponse.json({ error: 'Invalid video path' }, { status: 400 });
        }

        const stat = await statFile(videoPath);
        if (!stat || stat.isDirectory) {
            return NextResponse.json({ error: 'Video not found' }, { status: 404 });
        }

        const jobId = createJob('transcribe', { videoPath });

        // Fire and forget: the client polls GET /api/transcribe?jobId=...
        (async () => {
            updateJob(jobId, { status: 'running' });
            try {
                const { stdout, stderr } = await runPythonScript(SCRIPT, [fullVideoPath]);
                updateJob(jobId, {
                    status: 'completed',
                    endTime: new Date().toISOString(),
                    stdout,
                    stderr,
                });
            } catch (error) {
                updateJob(jobId, {
                    status: 'error',
                    endTime: new Date().toISOString(),
                    error: error.message,
                    stdout: error.stdout || '',
                    stderr: error.stderr || '',
                });
            }
        })();

        return NextResponse.json({ jobId, status: 'pending' });
    } catch (error) {
        console.error('Error starting transcription:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
        return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    const job = getJob(jobId);
    if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(job);
}
