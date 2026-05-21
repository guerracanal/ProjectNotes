/**
 * Google Drive API Client for Node.js using native fetch
 */

/**
 * Searches for a folder by name, or creates it if it doesn't exist.
 */
export async function searchOrCreateRootFolder(accessToken, folderName = 'ProjectNotes') {
    const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`);
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

    const searchResponse = await fetch(searchUrl, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });

    if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        throw new Error(`Google Drive Folder search failed: ${searchResponse.statusText} - ${errorText}`);
    }

    const searchData = await searchResponse.json();
    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
    }

    // Folder doesn't exist, create it
    const createUrl = 'https://www.googleapis.com/drive/v3/files';
    const createResponse = await fetch(createUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        })
    });

    if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Google Drive Folder creation failed: ${createResponse.statusText} - ${errorText}`);
    }

    const createData = await createResponse.json();
    return createData.id;
}

/**
 * Lists all files and folders in Google Drive that were created/accessible by this app.
 */
export async function listAllAppFiles(accessToken) {
    const fields = encodeURIComponent('files(id, name, mimeType, modifiedTime, size, parents)');
    const url = `https://www.googleapis.com/drive/v3/files?q=trashed=false&fields=${fields}&pageSize=1000`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Drive file listing failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.files || [];
}

/**
 * Downloads a file from Google Drive as a binary Buffer.
 */
export async function downloadFileFromDrive(accessToken, fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error(`Google Drive file download failed: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Uploads a text or binary file to Google Drive using a multipart request.
 * Creates a new file or updates an existing one.
 */
export async function uploadFileToDrive(accessToken, name, parentId, contentBuffer, mimeType, existingFileId = null) {
    const url = existingFileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime`;

    const method = existingFileId ? 'PATCH' : 'POST';

    const metadata = {
        name: name
    };
    
    // Parents are only set on creation
    if (!existingFileId && parentId) {
        metadata.parents = [parentId];
    }

    const boundary = '314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataPart = 
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata);

    // Combine into a single Buffer
    const header = Buffer.concat([
        Buffer.from(delimiter),
        Buffer.from(metadataPart),
        Buffer.from(delimiter),
        Buffer.from(`Content-Type: ${mimeType}\r\n\r\n`)
    ]);

    const footer = Buffer.from(closeDelimiter);
    const dataBuffer = typeof contentBuffer === 'string' ? Buffer.from(contentBuffer) : contentBuffer;

    const bodyBuffer = Buffer.concat([
        header,
        dataBuffer,
        footer
    ]);

    const response = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': bodyBuffer.length.toString()
        },
        body: bodyBuffer
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Drive upload failed: ${response.statusText} - ${errorText}`);
    }

    return response.json();
}

/**
 * Creates a folder inside a parent folder on Google Drive.
 */
export async function createFolderInDrive(accessToken, name, parentId) {
    const url = 'https://www.googleapis.com/drive/v3/files?fields=id,name';
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : undefined
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Drive folder creation failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.id;
}
