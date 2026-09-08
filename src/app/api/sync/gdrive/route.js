import fs from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import {
    searchOrCreateRootFolder,
    listAllAppFiles,
    downloadFileFromDrive,
    uploadFileToDrive,
    createFolderInDrive
} from '@/lib/gdrive';
import { PROJECTS_DIR } from '@/lib/paths';
import { VIDEO_EXTENSIONS } from '@/lib/fs-utils';

/**
 * Recursively lists all files and folders in the local projects_data directory.
 */
async function getLocalFilesRecursive(dir, relativeDir = '') {
    let results = [];
    try {
        const list = await fs.readdir(dir, { withFileTypes: true });
        for (const file of list) {
            // Skip hidden files/folders (e.g. .DS_Store, .git)
            if (file.name.startsWith('.')) continue;

            const relPath = relativeDir ? `${relativeDir}/${file.name}` : file.name;
            const fullPath = path.join(dir, file.name);
            const stat = await fs.stat(fullPath);

            if (file.isDirectory()) {
                results.push({
                    path: relPath.replace(/\\/g, '/'),
                    type: 'folder',
                    mtime: stat.mtime
                });
                const subResults = await getLocalFilesRecursive(fullPath, relPath);
                results = results.concat(subResults);
            } else {
                results.push({
                    path: relPath.replace(/\\/g, '/'),
                    type: 'file',
                    mtime: stat.mtime,
                    size: stat.size,
                    fullPath: fullPath
                });
            }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error scanning local files:', error);
        }
    }
    return results;
}

/**
 * Resolves standard MIME types based on file extension
 */
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.md':
        case '.txt':
            return 'text/plain; charset=utf-8';
        case '.json':
            return 'application/json; charset=utf-8';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.gif':
            return 'image/gif';
        case '.webp':
            return 'image/webp';
        case '.mp4':
            return 'video/mp4';
        case '.webm':
            return 'video/webm';
        case '.mkv':
            return 'video/x-matroska';
        case '.pdf':
            return 'application/pdf';
        default:
            return 'application/octet-stream';
    }
}

/**
 * Reconstructs the relative paths of files in Google Drive relative to the root folder ID.
 */
function buildDrivePathsMap(driveFiles, rootFolderId) {
    const relativePathsMap = {}; // relativePath -> driveFileObj
    const driveFoldersMap = { '': rootFolderId }; // relativePath -> driveFolderId

    const folders = driveFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const files = driveFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

    // Helper to trace parent path recursively
    function getRelativePath(item) {
        let current = item;
        let pathParts = [];
        let visited = new Set();

        while (current) {
            if (visited.has(current.id)) return null;
            visited.add(current.id);

            if (current.parents && current.parents.includes(rootFolderId)) {
                pathParts.unshift(current.name);
                return pathParts.join('/');
            }

            const parentId = current.parents?.[0];
            if (!parentId) break;

            const parent = driveFiles.find(f => f.id === parentId);
            if (!parent) break;

            pathParts.unshift(current.name);
            current = parent;
        }

        return null;
    }

    // Process folders first to populate driveFoldersMap
    folders.forEach(folder => {
        const relPath = getRelativePath(folder);
        if (relPath) {
            relativePathsMap[relPath] = folder;
            driveFoldersMap[relPath] = folder.id;
        }
    });

    // Process files
    files.forEach(file => {
        const relPath = getRelativePath(file);
        if (relPath) {
            relativePathsMap[relPath] = file;
        }
    });

    return { relativePathsMap, driveFoldersMap };
}

/**
 * Los vídeos no se sincronizan salvo que se pida.
 *
 * Una grabación de reunión son varios GB, y lo que hace falta tener en Drive
 * —y lo que el asistente busca— es la transcripción y el resumen, que ocupan
 * unos pocos KB. Subir el vídeo original es mover mil veces más datos para
 * conseguir lo mismo. Se queda en local, junto a su transcripción.
 */
function esVideo(relPath) {
    const punto = relPath.lastIndexOf('.');
    return punto !== -1 && VIDEO_EXTENSIONS.includes(relPath.slice(punto).toLowerCase());
}

export async function POST(request) {
    try {
        const {
            accessToken,
            folderName = 'ProjectNotes',
            forceMode = 'two-way',
            syncVideos = false,
        } = await request.json();

        if (!accessToken) {
            return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
        }

        // Ensure the local projects_data directory exists
        await fs.mkdir(PROJECTS_DIR, { recursive: true });

        // 1. Get Google Drive Root Folder ID
        const rootFolderId = await searchOrCreateRootFolder(accessToken, folderName);

        // 2. Fetch all files from Google Drive
        const allDriveFiles = await listAllAppFiles(accessToken);

        // 3. Reconstruct paths from Drive files
        const { relativePathsMap: driveMap, driveFoldersMap } = buildDrivePathsMap(allDriveFiles, rootFolderId);

        // 4. Scan Local Directory
        const localFiles = await getLocalFilesRecursive(PROJECTS_DIR);
        const localMap = {};
        localFiles.forEach(f => {
            localMap[f.path] = f;
        });

        // Collect all unique paths
        const allPaths = Array.from(new Set([...Object.keys(localMap), ...Object.keys(driveMap)]));

        const toCreateFolderLocal = [];
        const toCreateFolderDrive = [];
        const toUpload = [];
        const toDownload = [];
        const logs = [];
        const failed = [];
        const skipped = [];
        let uploaded = 0;
        let downloaded = 0;

        // Build plan
        for (const relPath of allPaths) {
            const localItem = localMap[relPath];
            const driveItem = driveMap[relPath];

            // Filtrar aquí y no al ejecutar cubre las dos direcciones de una
            // vez: ni se sube el vídeo local ni se baja el que ya esté en Drive.
            if (!syncVideos && esVideo(relPath)) {
                skipped.push(relPath);
                continue;
            }

            const isFolder = (localItem && localItem.type === 'folder') || 
                             (driveItem && driveItem.mimeType === 'application/vnd.google-apps.folder');

            if (isFolder) {
                if (localItem && !driveItem) {
                    toCreateFolderDrive.push(relPath);
                } else if (!localItem && driveItem) {
                    toCreateFolderLocal.push(relPath);
                }
                continue;
            }

            // File comparisons
            if (localItem && !driveItem) {
                // Local only -> upload
                toUpload.push({ path: relPath, reason: 'new local file' });
            } else if (!localItem && driveItem) {
                // Drive only -> download
                toDownload.push({ path: relPath, reason: 'new remote file' });
            } else if (localItem && driveItem) {
                // Exists in both -> compare modified times
                const localMtime = new Date(localItem.mtime).getTime();
                const driveMtime = new Date(driveItem.modifiedTime).getTime();
                
                // Allow a tiny window (2 seconds) for precision discrepancy
                const timeDiff = localMtime - driveMtime;

                if (forceMode === 'upload') {
                    toUpload.push({ path: relPath, reason: 'force upload override' });
                } else if (forceMode === 'download') {
                    toDownload.push({ path: relPath, reason: 'force download override' });
                } else {
                    // Two-way comparison
                    if (timeDiff > 2000) {
                        toUpload.push({ path: relPath, reason: `local is newer (${Math.round(timeDiff / 1000)}s)` });
                    } else if (timeDiff < -2000) {
                        toDownload.push({ path: relPath, reason: `drive is newer (${Math.round(-timeDiff / 1000)}s)` });
                    }
                }
            }
        }

        if (skipped.length > 0) {
            logs.push(`[Omitidos] ${skipped.length} vídeo(s), que no se sincronizan: ${skipped.join(', ')}`);
        }

        // Sort folders by depth/length to ensure parents are created before subfolders
        toCreateFolderLocal.sort((a, b) => a.length - b.length);
        toCreateFolderDrive.sort((a, b) => a.length - b.length);

        // Execute local folder creation
        for (const folderPath of toCreateFolderLocal) {
            const fullLocalPath = path.join(PROJECTS_DIR, folderPath);
            await fs.mkdir(fullLocalPath, { recursive: true });
            logs.push(`[Carpeta] Creada localmente: ${folderPath}`);
        }

        // Execute Google Drive folder creation
        for (const folderPath of toCreateFolderDrive) {
            const parentPath = folderPath.includes('/')
                ? folderPath.substring(0, folderPath.lastIndexOf('/'))
                : '';

            const parentDriveId = driveFoldersMap[parentPath];
            if (!parentDriveId) {
                throw new Error(`No se encontró el ID de Google Drive para la carpeta padre: "${parentPath}"`);
            }

            const folderName = folderPath.includes('/')
                ? folderPath.substring(folderPath.lastIndexOf('/') + 1)
                : folderPath;

            const newId = await createFolderInDrive(accessToken, folderName, parentDriveId);
            driveFoldersMap[folderPath] = newId;
            logs.push(`[Carpeta] Creada en Google Drive: ${folderPath}`);
        }

        // Execute downloads
        for (const fileObj of toDownload) {
            const relPath = fileObj.path;
            const driveFile = driveMap[relPath];
            const fullLocalPath = path.join(PROJECTS_DIR, relPath);

            try {
                // Ensure parent directory exists
                await fs.mkdir(path.dirname(fullLocalPath), { recursive: true });

                await downloadFileFromDrive(accessToken, driveFile.id, fullLocalPath);

                // Sync modified date to local file to match drive modifiedTime
                const remoteTime = new Date(driveFile.modifiedTime);
                await fs.utimes(fullLocalPath, remoteTime, remoteTime);

                logs.push(`[Descarga] ${relPath} (${fileObj.reason})`);
                downloaded += 1;
            } catch (error) {
                failed.push({ path: relPath, direction: 'descarga', message: error.message });
                logs.push(`[Error] No se pudo descargar ${relPath}: ${error.message}`);
            }
        }

        // Execute uploads
        for (const fileObj of toUpload) {
            const relPath = fileObj.path;
            const localFile = localMap[relPath];
            const fullLocalPath = localFile.fullPath;

            const parentPath = relPath.includes('/')
                ? relPath.substring(0, relPath.lastIndexOf('/'))
                : '';

            const parentDriveId = driveFoldersMap[parentPath];
            if (!parentDriveId) {
                throw new Error(`ID del padre en Drive no encontrado para: ${parentPath}`);
            }

            const fileName = relPath.includes('/')
                ? relPath.substring(relPath.lastIndexOf('/') + 1)
                : relPath;

            const mimeType = getMimeType(relPath);
            const existingDriveFile = driveMap[relPath];

            try {
                // Se pasa la ruta, no el contenido: los ficheros grandes viajan
                // en streaming y nunca llegan a estar enteros en memoria.
                const driveResponse = await uploadFileToDrive(
                    accessToken,
                    fileName,
                    parentDriveId,
                    fullLocalPath,
                    mimeType,
                    existingDriveFile ? existingDriveFile.id : null
                );

                // Update local file modification date to match what Google Drive returned
                const updatedRemoteTime = new Date(driveResponse.modifiedTime);
                await fs.utimes(fullLocalPath, updatedRemoteTime, updatedRemoteTime);

                logs.push(`[Subida] ${relPath} (${fileObj.reason})`);
                uploaded += 1;
            } catch (error) {
                failed.push({ path: relPath, direction: 'subida', message: error.message });
                logs.push(`[Error] No se pudo subir ${relPath}: ${error.message}`);
            }
        }

        const stats = {
            foldersCreatedLocal: toCreateFolderLocal.length,
            foldersCreatedDrive: toCreateFolderDrive.length,
            // Lo que se ha transferido de verdad, no lo que se planeó: con un
            // fichero fallido los dos números dejan de coincidir, y decir que se
            // subieron diez cuando solo fueron nueve es lo peor que puede hacer
            // una sincronización.
            uploaded,
            downloaded,
            failed: failed.length,
            skipped: skipped.length,
            totalProcessed: toCreateFolderLocal.length + toCreateFolderDrive.length + uploaded + downloaded
        };

        return NextResponse.json({
            success: true,
            stats,
            failed,
            skipped,
            logs
        });

    } catch (error) {
        console.error('Error during Google Drive Sync:', error);
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
