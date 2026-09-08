/**
 * Sincronización con Google Drive: ficheros grandes.
 *
 * El fallo que motivó esto: `fs.readFile` tiene un tope duro de 2 GiB y lanza
 * `ERR_FS_FILE_TOO_LARGE`, así que una grabación de reunión larga tumbaba la
 * sincronización entera. Y por debajo de ese tope tampoco iba bien: el cliente
 * dejaba el fichero dos veces en memoria.
 *
 * Estas pruebas usan un fichero disperso de 2,5 GiB —ocupa cero en disco, pero
 * se lee como 2,5 GiB de ceros— y vigilan cuánta memoria gasta el proceso.
 */

import assert from 'node:assert/strict';
import { open, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startMockDrive } from './mock-drive.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GIB = 1024 ** 3;

/**
 * Por defecto se prueba con 300 MB: basta para que un regreso a `readFile` se
 * note en la medida de memoria, y no hace falta esperar ni ocupar disco.
 *
 * `TEST_LARGE_FILES=1` sube a 2,5 GiB, que es lo que cruza el tope duro de
 * `fs.readFile`. No es lo predeterminado porque un fichero disperso es gratis
 * en Linux pero en NTFS puede acabar ocupando los 2,5 GB de verdad.
 */
const GRANDE = process.env.TEST_LARGE_FILES ? Math.round(2.5 * GIB) : 300 * 1024 * 1024;
const LIMITE_MEMORIA = 100 * 1024 * 1024;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

const drive = await startMockDrive();
process.env.GOOGLE_DRIVE_API_BASE = drive.apiBase;
process.env.GOOGLE_DRIVE_UPLOAD_BASE = drive.uploadBase;

const { uploadFileToDrive, downloadFileFromDrive } = await import(
  pathToFileURL(path.join(ROOT, 'src', 'lib', 'gdrive.js')).href
);

const dir = await mkdtemp(path.join(tmpdir(), 'gdrive-test-'));
const fallos = [];
const check = (label, ok, detalle = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detalle ? '' : `  — ${detalle}`}`);
  if (!ok) fallos.push(label);
};

/** Un fichero disperso: se lee como N bytes de ceros sin ocuparlos en disco. */
async function ficheroDisperso(nombre, size) {
  const ruta = path.join(dir, nombre);
  const fh = await open(ruta, 'w');
  await fh.truncate(size);
  await fh.close();
  return ruta;
}

/** Cuánta memoria residente añade `fn` como máximo mientras corre. */
async function memoriaExtra(fn) {
  global.gc?.();
  const base = process.memoryUsage().rss;
  let pico = base;
  const reloj = setInterval(() => {
    pico = Math.max(pico, process.memoryUsage().rss);
  }, 25);
  try {
    return { resultado: await fn(), extra: pico - base };
  } finally {
    clearInterval(reloj);
  }
}

console.log(`\nSubida de un fichero grande (${mb(GRANDE)})`);
{
  const ruta = await ficheroDisperso('reunion-larga.mp4', GRANDE);
  const { extra } = await memoriaExtra(() =>
    uploadFileToDrive('token', 'reunion-larga.mp4', 'carpeta', ruta, 'video/mp4')
  );
  const recibido = drive.state.received.get('reunion-larga.mp4');

  check('la subida termina', Boolean(recibido));
  check('llegan todos los bytes', recibido?.bytes === GRANDE, `${recibido?.bytes} de ${GRANDE}`);
  check('va por el protocolo resumable', recibido?.via === 'resumable', recibido?.via);
  check('anuncia el tamaño al abrir la sesión', recibido?.declarado === GRANDE, String(recibido?.declarado));
  // Sin streaming haría falta el tamaño entero, o el doble con el
  // `Buffer.concat` que había antes.
  check('no se lo guarda en memoria', extra < LIMITE_MEMORIA, `pico +${mb(extra)}`);
  console.log(`      memoria extra durante la subida: ${mb(extra)} para un fichero de ${mb(GRANDE)}`);
}

console.log(`\nDescarga de un fichero grande (${mb(GRANDE)})`);
{
  const { extra } = await memoriaExtra(() =>
    // /dev/null: interesa el camino, no guardar 2,5 GB en el disco de nadie.
    downloadFileFromDrive('token', `grande-${GRANDE}`, '/dev/null')
  );
  check('no se lo guarda en memoria', extra < LIMITE_MEMORIA, `pico +${mb(extra)}`);
  console.log(`      memoria extra durante la descarga: ${mb(extra)}`);
}

console.log('\nLos ficheros pequeños siguen yendo en una sola petición');
{
  const ruta = path.join(dir, 'notas.md');
  const contenido = '# Hola\n\nesto es una nota corta.\n';
  await writeFile(ruta, contenido);
  const esperado = Buffer.byteLength(contenido);

  await uploadFileToDrive('token', 'notas.md', 'carpeta', ruta, 'text/markdown');
  const recibido = drive.state.received.get('notas.md');
  check('va por multipart', recibido?.via === 'multipart', recibido?.via);
  check('llega entero', recibido?.bytes === esperado, `${recibido?.bytes} de ${esperado}`);
}

await rm(dir, { recursive: true, force: true });
await drive.close();
console.log('\n' + (fallos.length ? `gdrive: ${fallos.length} fallo(s)` : 'gdrive: todo OK'));
process.exit(fallos.length ? 1 : 0);
