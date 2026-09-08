/**
 * Google Drive API Client for Node.js using native fetch
 */

import { createReadStream, createWriteStream } from 'fs';
import http from 'http';
import https from 'https';
import { readFile, stat } from 'fs/promises';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

/**
 * Las bases de la API son variables para poder apuntar a un servidor de prueba
 * en los tests. En producción no se tocan.
 */
const API_BASE = process.env.GOOGLE_DRIVE_API_BASE || 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = process.env.GOOGLE_DRIVE_UPLOAD_BASE || 'https://www.googleapis.com/upload/drive/v3';

/**
 * Por debajo de esto se sube en una sola petición multipart, que es una ida y
 * vuelta menos. Por encima se usa el protocolo «resumable» de Google, que es
 * el único que permite enviar el fichero según se lee del disco.
 */
const MULTIPART_LIMIT = 5 * 1024 * 1024;

/**
 * Searches for a folder by name, or creates it if it doesn't exist.
 */
export async function searchOrCreateRootFolder(accessToken, folderName = 'ProjectNotes') {
    const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`);
    const searchUrl = `${API_BASE}/files?q=${query}&fields=files(id,name)`;

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
    const createUrl = `${API_BASE}/files`;
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
    const url = `${API_BASE}/files?q=trashed=false&fields=${fields}&pageSize=1000`;

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
/**
 * Descarga un fichero de Drive directamente a disco.
 *
 * Devuelve nada a propósito: quien llama ya sabe dónde lo ha pedido, y
 * devolver el contenido invitaría a tenerlo en memoria, que es justo lo que
 * hay que evitar con vídeos de varios GB.
 */
export async function downloadFileFromDrive(accessToken, fileId, destinationPath) {
    const url = `${API_BASE}/files/${fileId}?alt=media`;
    
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error(`Google Drive file download failed: ${response.statusText}`);
    }

    // A disco según llega, sin pasar por un Buffer. Una grabación de reunión de
    // dos horas no cabe en memoria, y `response.arrayBuffer()` la pedía entera.
    await pipeline(Readable.fromWeb(response.body), createWriteStream(destinationPath));
}

/**
 * Sube un fichero a Drive, creándolo o actualizándolo.
 *
 * Lo pequeño va en una sola petición multipart. Lo grande va por el protocolo
 * «resumable», que es el único que permite enviar el contenido según se lee del
 * disco: la versión anterior hacía `readFile` del fichero entero y además lo
 * duplicaba con un `Buffer.concat`, así que una grabación de reunión se comía
 * el doble de su tamaño en RAM y, pasados los 2 GiB, ni siquiera llegaba a
 * intentarlo —`fs.readFile` tiene ahí un tope duro y lanza
 * `ERR_FS_FILE_TOO_LARGE`.
 */
export async function uploadFileToDrive(accessToken, name, parentId, filePath, mimeType, existingFileId = null) {
    const metadata = { name };
    // El padre solo se indica al crear: mover un fichero existente es otra cosa.
    if (!existingFileId && parentId) {
        metadata.parents = [parentId];
    }

    const { size } = await stat(filePath);
    return size > MULTIPART_LIMIT
        ? uploadResumable(accessToken, metadata, filePath, mimeType, size, existingFileId)
        : uploadMultipart(accessToken, metadata, filePath, mimeType, existingFileId);
}

/** Una sola petición con metadatos y contenido. Para ficheros pequeños. */
async function uploadMultipart(accessToken, metadata, filePath, mimeType, existingFileId) {
    const url = existingFileId
        ? `${UPLOAD_BASE}/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime`
        : `${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,modifiedTime`;

    const boundary = '314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;

    const body = Buffer.concat([
        Buffer.from(`${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}${delimiter}Content-Type: ${mimeType}\r\n\r\n`),
        await readFile(filePath),
        Buffer.from(`\r\n--${boundary}--`),
    ]);

    const response = await fetch(url, {
        method: existingFileId ? 'PATCH' : 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': String(body.length),
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`Google Drive upload failed: ${response.statusText} - ${await response.text()}`);
    }
    return response.json();
}

/**
 * Subida en dos pasos: se abre una sesión y se envía el contenido a la URL que
 * devuelve. El cuerpo va como flujo desde el disco, así que da igual que el
 * fichero ocupe 5 MB o 5 GB: la memoria que usa es la del buffer del flujo.
 */
async function uploadResumable(accessToken, metadata, filePath, mimeType, size, existingFileId) {
    const startUrl = existingFileId
        ? `${UPLOAD_BASE}/files/${existingFileId}?uploadType=resumable&fields=id,name,modifiedTime`
        : `${UPLOAD_BASE}/files?uploadType=resumable&fields=id,name,modifiedTime`;

    const start = await fetch(startUrl, {
        method: existingFileId ? 'PATCH' : 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': mimeType,
            'X-Upload-Content-Length': String(size),
        },
        body: JSON.stringify(metadata),
    });

    if (!start.ok) {
        throw new Error(`Google Drive upload failed: ${start.statusText} - ${await start.text()}`);
    }

    const session = start.headers.get('location');
    if (!session) {
        throw new Error('Google Drive no devolvió la URL de sesión para la subida.');
    }

    return putStream(session, filePath, size, mimeType);
}

/**
 * Envía el contenido a la URL de sesión, leyéndolo del disco.
 *
 * Aquí no vale `fetch`. Medido con un fichero de 1,5 GB: con un
 * `Content-Length` explícito, `fetch` materializa el cuerpo entero antes de
 * mandarlo (+1575 MB de memoria); sin esa cabecera sí hace streaming (+74 MB),
 * pero entonces la petición va con «chunked» y Drive espera el tamaño. El
 * cliente HTTP de Node hace las dos cosas a la vez: +22 MB con la cabecera
 * puesta.
 */
function putStream(sessionUrl, filePath, size, mimeType) {
    const url = new URL(sessionUrl);
    const transporte = url.protocol === 'http:' ? http : https;

    return new Promise((resolve, reject) => {
        const request = transporte.request(
            url,
            {
                method: 'PUT',
                headers: { 'Content-Type': mimeType, 'Content-Length': String(size) },
            },
            (response) => {
                let body = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => (body += chunk));
                response.on('end', () => {
                    if (response.statusCode >= 200 && response.statusCode < 300) {
                        try {
                            resolve(JSON.parse(body));
                        } catch {
                            reject(new Error(`Google Drive devolvió una respuesta ilegible: ${body.slice(0, 200)}`));
                        }
                        return;
                    }
                    reject(new Error(`Google Drive upload failed: ${response.statusCode} - ${body.slice(0, 500)}`));
                });
            }
        );

        request.on('error', reject);
        pipeline(createReadStream(filePath), request).catch(reject);
    });
}

export async function createFolderInDrive(accessToken, name, parentId) {
    const url = `${API_BASE}/files?fields=id,name`;
    
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
