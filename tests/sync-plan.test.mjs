/**
 * Qué entra y qué no en la sincronización con Drive.
 *
 * La regla que se comprueba: los vídeos no viajan, ni hacia arriba ni hacia
 * abajo, salvo que se pida expresamente. Se prueba contra la propia ruta de la
 * API, no contra una copia de su lógica, levantando un Drive de mentira.
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';
import { startMockDrive } from './mock-drive.mjs';

// Traducir `@/` y `next/server` antes de importar la ruta.
register('./next-shim.mjs', import.meta.url);

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const drive = await startMockDrive();
process.env.GOOGLE_DRIVE_API_BASE = drive.apiBase;
process.env.GOOGLE_DRIVE_UPLOAD_BASE = drive.uploadBase;

// Un projects_data de usar y tirar: la ruta lo lee de PROJECTS_DIR.
const dir = await mkdtemp(path.join(tmpdir(), 'sync-test-'));
const datos = path.join(dir, 'projects_data');
await mkdir(path.join(datos, 'Reunión'), { recursive: true });
process.env.PROJECTS_DIR = datos;

const { POST } = await import(pathToFileURL(path.join(ROOT, 'src', 'app', 'api', 'sync', 'gdrive', 'route.js')).href);

const ficheros = {
  'Reunión/grabacion.mp4': 'x'.repeat(2048),
  'Reunión/grabacion_transcripcion.txt': 'lo que se dijo',
  'Reunión/grabacion_transcripcion.json': '{"segments":[]}',
  'Reunión/notas.md': '# Notas',
  'Reunión/pantallazo.png': 'png',
};
for (const [rel, contenido] of Object.entries(ficheros)) {
  await writeFile(path.join(datos, rel), contenido);
}

const fallos = [];
const check = (label, ok, detalle = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detalle ? '' : `  — ${detalle}`}`);
  if (!ok) fallos.push(label);
};

const sincronizar = async (body) => {
  drive.state.received.clear();
  const res = await POST(new Request('http://localhost/api/sync/gdrive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: 'token', ...body }),
  }));
  return res.json();
};

console.log('\nPor defecto: los vídeos se quedan en casa');
{
  const data = await sincronizar({});
  const subidos = [...drive.state.received.keys()].sort();

  check('la sincronización va bien', data.success === true, JSON.stringify(data).slice(0, 200));
  check('no sube el vídeo', !subidos.includes('grabacion.mp4'), subidos.join(', '));
  check('sí sube la transcripción', subidos.includes('grabacion_transcripcion.txt'), subidos.join(', '));
  check('sí sube el json con los minutos', subidos.includes('grabacion_transcripcion.json'));
  check('sí sube las notas', subidos.includes('notas.md'));
  check('sí sube las imágenes', subidos.includes('pantallazo.png'));
  check('lo cuenta como omitido', data.stats.skipped === 1, `skipped=${data.stats.skipped}`);
  check('dice cuál ha omitido', data.skipped?.[0] === 'Reunión/grabacion.mp4', JSON.stringify(data.skipped));
  check('no lo cuenta como subido', data.stats.uploaded === 4, `uploaded=${data.stats.uploaded}`);
}

console.log('\nCon la opción activada sí van');
{
  const data = await sincronizar({ syncVideos: true });
  const subidos = [...drive.state.received.keys()];
  check('sube el vídeo', subidos.includes('grabacion.mp4'), subidos.join(', '));
  check('no omite nada', data.stats.skipped === 0, `skipped=${data.stats.skipped}`);
}

console.log('\nUn vídeo que ya está en Drive tampoco se baja');
{
  // El sync anterior creó la carpeta raíz; se cuelgan de ella dos ficheros que
  // no existen en local, uno de ellos vídeo.
  const raiz = drive.state.files.find((f) => f.name === 'ProjectNotes' && !f.parents);
  drive.state.files.push(
    {
      id: 'remoto-video-4096',
      name: 'solo-en-drive.mp4',
      mimeType: 'video/mp4',
      modifiedTime: new Date().toISOString(),
      parents: [raiz.id],
    },
    {
      id: 'remoto-nota-64',
      name: 'solo-en-drive.md',
      mimeType: 'text/markdown',
      modifiedTime: new Date().toISOString(),
      parents: [raiz.id],
    }
  );

  const data = await sincronizar({});
  const enDisco = await readdir(datos);

  check('no baja el vídeo', !enDisco.includes('solo-en-drive.mp4'), enDisco.join(', '));
  check('sí baja la nota', enDisco.includes('solo-en-drive.md'), enDisco.join(', '));
  check('lo cuenta como omitido', data.stats.skipped === 2, `skipped=${data.stats.skipped}`);
  check('no lo cuenta como descargado', data.stats.downloaded === 1, `downloaded=${data.stats.downloaded}`);
}

await rm(dir, { recursive: true, force: true });
await drive.close();
console.log('\n' + (fallos.length ? `sync: ${fallos.length} fallo(s)` : 'sync: todo OK'));
process.exit(fallos.length ? 1 : 0);
