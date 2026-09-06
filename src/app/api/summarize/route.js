import path from 'path';
import { NextResponse } from 'next/server';
import { getSafePath, statFile } from '@/lib/fs-utils';
import { createJob, getJob, updateJob } from '@/lib/job-store';
import { runPythonScript } from '@/lib/run-script';

const SCRIPT = path.join(process.cwd(), 'scripts', 'resumen_transcripcion.py');

export async function POST(request) {
    try {
        const { transcriptPath } = await request.json();

        if (!transcriptPath) {
            return NextResponse.json({ error: 'Transcript path is required' }, { status: 400 });
        }

        let fullTranscriptPath;
        try {
            fullTranscriptPath = getSafePath(transcriptPath);
        } catch {
            return NextResponse.json({ error: 'Invalid transcript path' }, { status: 400 });
        }

        const stat = await statFile(transcriptPath);
        if (!stat || stat.isDirectory) {
            return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
        }

        const jobId = createJob('summary', { transcriptPath });

        (async () => {
            updateJob(jobId, { status: 'running' });
            try {
                const { stdout, stderr } = await runPythonScript(SCRIPT, [fullTranscriptPath]);
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
        console.error('Error starting summarization:', error);
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
