import { NextResponse } from 'next/server';
import { saveImageFile, ensureImagesFolderExists } from '@/lib/fs-utils';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const projectPath = formData.get('projectPath');
        const files = formData.getAll('images');

        if (!projectPath) {
            return NextResponse.json({ error: 'Project path is required' }, { status: 400 });
        }

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        }

        // Ensure images folder exists
        await ensureImagesFolderExists(projectPath);

        const uploadedFiles = [];
        const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];

        for (const file of files) {
            // Validate file type
            if (!validImageTypes.includes(file.type)) {
                console.warn(`Skipping invalid file type: ${file.type}`);
                continue;
            }

            // Generate unique filename with timestamp
            const timestamp = Date.now();
            const originalName = file.name;
            const extension = originalName.substring(originalName.lastIndexOf('.'));
            const baseName = originalName.substring(0, originalName.lastIndexOf('.'));
            const uniqueName = `${baseName}_${timestamp}${extension}`;

            // Convert file to buffer
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Save file
            const imagePath = `${projectPath}/images/${uniqueName}`;
            await saveImageFile(imagePath, buffer);

            uploadedFiles.push({
                name: uniqueName,
                path: imagePath,
                size: file.size,
                type: file.type,
            });
        }

        return NextResponse.json({
            success: true,
            files: uploadedFiles
        });
    } catch (error) {
        console.error('Error uploading images:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
