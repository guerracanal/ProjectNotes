import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// In-memory job store (resets on server restart)
const jobs = new Map();

export async function POST(request) {
    try {
        const { videoPath } = await request.json();

        if (!videoPath) {
            return NextResponse.json({ error: 'Video path is required' }, { status: 400 });
        }

        // Generate job ID
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Full path to video
        const fullVideoPath = path.join(process.cwd(), 'projects_data', videoPath);

        // Script path
        const scriptPath = path.join(process.cwd(), 'scripts', 'transcribir_video.py');

        // Initialize job
        jobs.set(jobId, {
            status: 'pending',
            videoPath,
            startTime: new Date(),
            error: null
        });

        // Execute script in background
        (async () => {
            try {
                jobs.set(jobId, { ...jobs.get(jobId), status: 'running' });

                // Use venv Python interpreter
                const pythonExecutable = process.platform === 'win32' ? 'python.exe' : 'python3';
                const pythonPath = path.join(process.cwd(), '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', pythonExecutable);
                const resolvedPythonPath = fs.existsSync(pythonPath) ? pythonPath : pythonExecutable;
                const { stdout, stderr } = await execAsync(`"${resolvedPythonPath}" "${scriptPath}" "${fullVideoPath}"`);

                jobs.set(jobId, {
                    ...jobs.get(jobId),
                    status: 'completed',
                    endTime: new Date(),
                    stdout,
                    stderr
                });
            } catch (error) {
                jobs.set(jobId, {
                    ...jobs.get(jobId),
                    status: 'error',
                    endTime: new Date(),
                    error: error.message
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

    const job = jobs.get(jobId);

    if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({
        jobId,
        status: job.status,
        videoPath: job.videoPath,
        startTime: job.startTime,
        endTime: job.endTime,
        error: job.error,
        stdout: job.stdout || '',
        stderr: job.stderr || ''
    });
}
