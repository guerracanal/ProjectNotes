/**
 * El escritor de ZIP.
 *
 * Es formato binario escrito a mano, así que no basta con que nuestro propio
 * código lo vuelva a leer: eso solo probaría que somos consistentes con
 * nosotros mismos. La validación la hace el módulo `zipfile` de Python, que es
 * una implementación independiente, y comprueba los CRC de todas las entradas.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { zipDirectory } = await import(pathToFileURL(path.join(ROOT, 'scripts', 'lib', 'zip.mjs')).href);

function hayPython() {
  try {
    execFileSync('python3', ['-c', 'import zipfile'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/** Lee el zip con Python y devuelve lo que ve. */
function inspeccionar(zipPath) {
  const script = `
import json, zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
print(json.dumps({
    "corrupta": z.testzip(),
    "nombres": sorted(z.namelist()),
    "contenidos": {n: z.read(n).decode("utf-8", "replace") for n in z.namelist()},
}))`;
  return JSON.parse(execFileSync('python3', ['-c', script, zipPath], { encoding: 'utf8' }));
}

let dir;
let zipPath;

test('el zip lo entiende otra implementación', async () => {
  const visto = inspeccionar(zipPath);
  assert.equal(visto.corrupta, null, 'alguna entrada no cuadra con su CRC');
});

test('lleva todos los ficheros, bajo una sola carpeta', async () => {
  const { nombres } = inspeccionar(zipPath);
  assert.deepEqual(nombres, [
    'paquete/binario.dat',
    'paquete/hondo/anidado/nota.txt',
    'paquete/nombre con ñ y acentué.txt',
    'paquete/vacío.txt',
  ]);
});

test('el contenido sale intacto', async () => {
  const { contenidos } = inspeccionar(zipPath);
  assert.equal(contenidos['paquete/hondo/anidado/nota.txt'], 'hola\nqué tal\n');
  assert.equal(contenidos['paquete/nombre con ñ y acentué.txt'], 'acentos en el nombre');
});

test('un fichero vacío no rompe nada', async () => {
  const { contenidos } = inspeccionar(zipPath);
  assert.equal(contenidos['paquete/vacío.txt'], '');
});

test('informa de lo que ha metido', async () => {
  const zip2 = path.join(dir, 'otra.zip');
  const resultado = await zipDirectory(path.join(dir, 'fuente'), zip2, { root: 'paquete' });
  assert.equal(resultado.entries, 4);
  assert.ok(resultado.bytes > 0);
});

if (!hayPython()) {
  console.log('zip: omitido (hace falta python3 para validar el formato)');
  process.exit(0);
}

dir = await mkdtemp(path.join(tmpdir(), 'zip-test-'));
const fuente = path.join(dir, 'fuente');
await mkdir(path.join(fuente, 'hondo', 'anidado'), { recursive: true });
await writeFile(path.join(fuente, 'hondo', 'anidado', 'nota.txt'), 'hola\nqué tal\n');
await writeFile(path.join(fuente, 'nombre con ñ y acentué.txt'), 'acentos en el nombre');
await writeFile(path.join(fuente, 'vacío.txt'), '');
// Datos que no comprimen: fuerzan el camino de "guardar sin comprimir".
await writeFile(path.join(fuente, 'binario.dat'), Buffer.from([0x1f, 0x8b, 0x08, 0x00]));

zipPath = path.join(dir, 'paquete.zip');
await zipDirectory(fuente, zipPath, { root: 'paquete' });

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${error.message}`);
  }
}
await rm(dir, { recursive: true, force: true });
console.log(failed ? `\nzip: ${failed} fallo(s)` : `\nzip: ${tests.length} tests OK`);
process.exit(failed ? 1 : 0);
