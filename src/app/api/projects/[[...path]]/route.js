import fs from 'fs';
import { NextResponse } from 'next/server';
import {
    classifyFile,
    createFolder,
    deleteEntry,
    extensionOf,
    getDirectoryContent,
    getFileContent,
    getImagesInDirectory,
    getSafePath,
    renameEntry,
    saveFile,
    statFile,
} from '@/lib/fs-utils';
import { invalidateIndex } from '@/lib/knowledge/store';

const MIME_TYPES = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
};

function resolveSubpath(resolvedParams) {
    return (resolvedParams?.path || []).map((segment) => decodeURIComponent(segment)).join('/');
}

function badPath(error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
}

/** Stream a binary file, honouring HTTP range requests so video can seek. */
function streamFile(fullPath, contentType, rangeHeader) {
    const fileSize = fs.statSync(fullPath).size;

    // A range request against an empty file is formally unsatisfiable, but a
    // 416 there just makes placeholder files look broken in the console.
    // Answer with an empty 200, as static file servers do.
    if (fileSize === 0) {
        return new NextResponse(null, {
            headers: { 'Content-Length': '0', 'Content-Type': contentType },
        });
    }

    if (rangeHeader) {
        const [startRaw, endRaw] = rangeHeader.replace(/bytes=/, '').split('-');
        const start = parseInt(startRaw, 10) || 0;
        const end = endRaw ? parseInt(endRaw, 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
            return new NextResponse(null, {
                status: 416,
                headers: { 'Content-Range': `bytes */${fileSize}` },
            });
        }

        return new NextResponse(fs.createReadStream(fullPath, { start, end }), {
            status: 206,
            headers: {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': String(end - start + 1),
                'Content-Type': contentType,
            },
        });
    }

    return new NextResponse(fs.createReadStream(fullPath), {
        headers: {
            'Content-Length': String(fileSize),
            'Content-Type': contentType,
            'Content-Disposition': 'inline',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=60',
        },
    });
}

export async function GET(request, { params }) {
    const subpath = resolveSubpath(await params);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    let fullPath;
    try {
        fullPath = getSafePath(subpath);
    } catch (error) {
        return badPath(error);
    }

    try {
        if (type === 'file') {
            const stat = await statFile(subpath);
            if (!stat || stat.isDirectory) {
                return NextResponse.json({ error: 'File not found' }, { status: 404 });
            }

            const kind = classifyFile(subpath);
            const contentType = MIME_TYPES[extensionOf(subpath)] || 'application/octet-stream';

            if (kind === 'video' || kind === 'image' || kind === 'audio' || kind === 'document') {
                return streamFile(fullPath, contentType, request.headers.get('range'));
            }

            const content = await getFileContent(subpath);
            return NextResponse.json({ content, size: stat.size, mtime: stat.mtime });
        }

        if (type === 'list') {
            const projectPath = subpath.endsWith('/images') ? subpath.slice(0, -7) : subpath;
            const images = await getImagesInDirectory(projectPath);
            return NextResponse.json({ images });
        }

        const items = await getDirectoryContent(subpath);
        if (items === null) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }
        return NextResponse.json({ items });
    } catch (error) {
        console.error('GET /api/projects failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    const subpath = resolveSubpath(await params);

    try {
        const body = await request.json();
        const { action, name, content } = body;

        if (!name || typeof name !== 'string' || name.includes('/') || name.includes('\\')) {
            return NextResponse.json({ error: 'A valid file or folder name is required' }, { status: 400 });
        }

        const target = subpath ? `${subpath}/${name}` : name;

        if (action === 'create_folder') {
            await createFolder(target);
        } else if (action === 'save_file') {
            await saveFile(target, content ?? '');
            invalidateIndex();
        } else {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        return NextResponse.json({ success: true, path: target });
    } catch (error) {
        if (error.message.startsWith('Invalid path')) return badPath(error);
        console.error('POST /api/projects failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    const subpath = resolveSubpath(await params);

    try {
        const { content, renameTo } = await request.json();

        if (renameTo) {
            await renameEntry(subpath, renameTo);
            invalidateIndex();
            return NextResponse.json({ success: true, path: renameTo });
        }

        if (content === undefined) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        await saveFile(subpath, content);
        invalidateIndex();
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error.message.startsWith('Invalid path')) return badPath(error);
        console.error('PUT /api/projects failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
    const subpath = resolveSubpath(await params);

    if (!subpath) {
        return NextResponse.json({ error: 'Refusing to delete the projects root' }, { status: 400 });
    }

    try {
        await deleteEntry(subpath);
        invalidateIndex();
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error.message.startsWith('Invalid path') || error.message.startsWith('Refusing')) {
            return badPath(error);
        }
        console.error('DELETE /api/projects failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
