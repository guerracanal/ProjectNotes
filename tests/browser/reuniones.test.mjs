/**
 * Una reunión sin grabación tiene que verse igual.
 *
 * Los vídeos no se sincronizan con Drive, así que en otro equipo quedan la
 * transcripción y el resumen pero no el .mp4. Antes la reunión desaparecía de
 * la pestaña: la lista se armaba desde los ficheros de vídeo.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchOptions, BASE_URL, PROJECT_DIR } from './helpers.mjs';

/**
 * El caso lo crea la propia prueba.
 *
 * `projects_data` está en .gitignore, así que un fichero de ejemplo dejado ahí
 * no viajaría con el repositorio y la prueba fallaría en otra máquina. Se
 * escriben tres ficheros —transcripción, marcas de tiempo y resumen, sin
 * grabación—, se comprueba, y se borran al terminar.
 */
const BASE = '_prueba-reunion-2026-03-12 09-30-00';
const FIXTURES = {
  [`${BASE}_transcripcion.txt`]:
    '[0:00] Buenos días. Empezamos la revisión mensual del portal.\n' +
    '[1:10] La mediana bajó a 380 ms después del cambio de caché.\n',
  [`${BASE}_transcripcion.json`]: JSON.stringify(
    {
      version: 1,
      media: null,
      language: 'es',
      duration: 210,
      segmentCount: 2,
      segments: [
        { id: 0, start: 0, end: 69, text: 'Buenos días. Empezamos la revisión mensual del portal.', speaker: null },
        { id: 1, start: 70, end: 210, text: 'La mediana bajó a 380 ms después del cambio de caché.', speaker: null },
      ],
    },
    null,
    2
  ),
  [`${BASE}_transcripcion_resumen.txt`]:
    '## Resumen\nRevisión mensual del portal.\n',
};

async function crearFixture() {
  for (const [nombre, contenido] of Object.entries(FIXTURES)) {
    await writeFile(path.join(PROJECT_DIR, nombre), contenido, 'utf8');
  }
}

async function borrarFixture() {
  for (const nombre of Object.keys(FIXTURES)) {
    await rm(path.join(PROJECT_DIR, nombre), { force: true });
  }
}

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const fallos = [];
const check = (label, ok, detalle = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detalle ? '' : `  — ${detalle}`}`);
  if (!ok) fallos.push(label);
};

const errores = [];
page.on('pageerror', (e) => errores.push(e.message));

const PROYECTO = process.env.PROJECT || 'Proyecto_Ejemplo';
const SIN_VIDEO = BASE;

await crearFixture();

async function irAReuniones() {
  await page.goto(`${BASE_URL}/project/${PROYECTO}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('button.tab', { hasText: /^Reuniones/ }).click();
  await page.waitForTimeout(900);
}

console.log('\nLa reunión aparece aunque no haya vídeo');
await irAReuniones();
{
  const tarjetas = page.locator('article.meeting');
  const total = await tarjetas.count();
  check('hay más de una reunión listada', total >= 2, `${total}`);

  const sinVideo = tarjetas.filter({ has: page.locator('.poster') });
  check('una de ellas tiene portada en vez de reproductor', (await sinVideo.count()) >= 1);

  const portada = sinVideo.first().locator('.poster');
  const texto = await portada.textContent();
  check('la portada lleva la fecha', /\d{4}/.test(texto), texto);
  check('la portada dice que no está la grabación', /no disponible/i.test(texto), texto);
  check('la portada dice que hay transcripción', /Transcripción/i.test(texto), texto);
  check('no hay botón de transcribir sin grabación',
    (await sinVideo.first().locator('button', { hasText: /^Transcribir$/ }).count()) === 0);
  check('sí ofrece leerla',
    (await sinVideo.first().locator('button', { hasText: /Leer|transcripción/i }).count()) >= 1);
}

console.log('\nEl lector se abre sin grabación');
{
  await page.locator('article.meeting').filter({ has: page.locator('.poster') }).first()
    .locator('button', { hasText: /Leer|transcripción/i }).first().click();
  await page.waitForTimeout(1000);

  const lineas = await page.locator('.reader').count();
  check('el lector se abre', lineas > 0);
  check('muestra la transcripción', (await page.locator('.reader').textContent()).includes('revisión mensual'));
  check('avisa de que no hay a dónde saltar',
    /no está aquí/i.test(await page.locator('.reader').textContent()));
  check('la portada ocupa el sitio del reproductor',
    (await page.locator('.reader .poster').count()) === 1);
}

console.log('\nUna cita al .mp4 desaparecido abre la reunión igual');
{
  // Esto es lo que enlaza el asistente: el json de la transcripción guarda el
  // nombre del vídeo, que puede no estar en este equipo.
  await page.goto(
    `${BASE_URL}/project/${PROYECTO}?tab=meetings&media=${encodeURIComponent(`${SIN_VIDEO}.mp4`)}&t=70`,
    { waitUntil: 'networkidle' }
  );
  await page.waitForTimeout(1200);
  check('abre el lector desde el enlace', (await page.locator('.reader').count()) === 1);
}

check('ningún error de JavaScript', errores.length === 0, errores.join(' | '));

await browser.close();
await borrarFixture();

console.log('\n' + (fallos.length ? `✗ ${fallos.length} fallo(s): ${fallos.join(', ')}` : '✓ las reuniones sin vídeo se ven'));
process.exit(fallos.length ? 1 : 0);
