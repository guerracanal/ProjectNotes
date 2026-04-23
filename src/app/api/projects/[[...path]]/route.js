import { NextResponse } from 'next/server';
import { getDirectoryContent, getFileContent, saveFile, createFolder, getImagesInDirectory } from '@/lib/fs-utils';

export async function GET(request, { params }) {
    const resolvedParams = await params;
    // params.path is an array of path segments
    // If params is undefined or path is undefined, it's the root
    const pathSegments = (resolvedParams?.path || []).map(segment => decodeURIComponent(segment));
    const subpath = pathSegments.join('/');

    try {
        // Check if we are requesting a specific file content (e.g. via query param or extension check)
        // For now, let's assume GET on a folder returns list, GET on a file returns content?
        // Or maybe we use a query param ?type=content

        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');

        if (type === 'file') {
            const fullPath = await import('path').then(p => p.join(process.cwd(), 'projects_data', subpath));
            // Check if file exists
            try {
                await import('fs/promises').then(fs => fs.stat(fullPath));
            } catch (e) {
                return NextResponse.json({ error: 'File not found' }, { status: 404 });
            }

            // Determine content type
            let contentType = 'application/octet-stream';
            if (subpath.endsWith('.mp4')) contentType = 'video/mp4';
            else if (subpath.endsWith('.webm')) contentType = 'video/webm';
            else if (subpath.endsWith('.mkv')) contentType = 'video/x-matroska';
            else if (subpath.endsWith('.pdf')) contentType = 'application/pdf';
            else if (subpath.endsWith('.doc')) contentType = 'application/msword';
            else if (subpath.endsWith('.docx')) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            else if (subpath.endsWith('.txt') || subpath.endsWith('.md')) contentType = 'text/plain; charset=utf-8';
            else if (subpath.endsWith('.jpg') || subpath.endsWith('.jpeg')) contentType = 'image/jpeg';
            else if (subpath.endsWith('.png')) contentType = 'image/png';
            else if (subpath.endsWith('.gif')) contentType = 'image/gif';
            else if (subpath.endsWith('.webp')) contentType = 'image/webp';
            else if (subpath.endsWith('.bmp')) contentType = 'image/bmp';
            else if (subpath.endsWith('.svg')) contentType = 'image/svg+xml';


            // For binary files (videos, PDFs, docs, images), we MUST stream
            // For binary files (videos, PDFs, docs, images), we MUST stream
            if (contentType.startsWith('video/') ||
                contentType.startsWith('image/') ||
                contentType === 'application/pdf' ||
                contentType === 'application/msword' ||
                contentType.includes('wordprocessingml')) {

                const fs = await import('fs');
                const { stat } = await import('fs/promises');
                const fileStat = await stat(fullPath);
                const fileSize = fileStat.size;
                const range = request.headers.get('range');

                if (range) {
                    const parts = range.replace(/bytes=/, "").split("-");
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                    const chunksize = (end - start) + 1;
                    const file = fs.createReadStream(fullPath, { start, end });

                    return new NextResponse(file, {
                        status: 206,
                        headers: {
                            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': chunksize,
                            'Content-Type': contentType,
                        }
                    });
                } else {
                    const file = fs.createReadStream(fullPath);
                    return new NextResponse(file, {
                        headers: {
                            'Content-Length': fileSize,
                            'Content-Type': contentType,
                            'Content-Disposition': 'inline',
                            'Accept-Ranges': 'bytes'
                        }
                    });
                }
            }

            // For text files, read as string
            const content = await getFileContent(subpath);
            return NextResponse.json({ content });
        }

        if (type === 'list') {
            // List images in the project's images directory
            // subpath includes "/images" but getImagesInDirectory adds it internally
            // so we need to remove it first
            const projectPath = subpath.endsWith('/images') ? subpath.slice(0, -7) : subpath;
            const images = await getImagesInDirectory(projectPath);
            return NextResponse.json({ images });
        }

        const items = await getDirectoryContent(subpath);
        return NextResponse.json({ items });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request, { params }) {
    const resolvedParams = await params;
    const pathSegments = (resolvedParams?.path || []).map(segment => decodeURIComponent(segment));
    const subpath = pathSegments.join('/');

    try {
        const body = await request.json();
        const { action, name, content } = body;

        if (action === 'create_folder') {
            await createFolder(`${subpath}/${name}`);
            return NextResponse.json({ success: true });
        } else if (action === 'save_file') {
            await saveFile(`${subpath}/${name}`, content);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(request, { params }) {
    const resolvedParams = await params;
    const pathSegments = (resolvedParams?.path || []).map(segment => decodeURIComponent(segment));
    const subpath = pathSegments.join('/');

    try {
        const body = await request.json();
        const { content } = body;

        if (content === undefined) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        await saveFile(subpath, content);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
