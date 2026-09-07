/**
 * Rutas de la aplicación.
 *
 * Estas cuatro constantes deciden dónde busca la app los proyectos, el índice
 * y los scripts. Un fallo aquí no da error: la app arranca y se comporta como
 * si no hubiera ningún proyecto, que es justo lo que pasaba al ejecutar el
 * paquete standalone antes de esta capa.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MODULE = pathToFileURL(path.join(ROOT, 'src', 'lib', 'paths.js')).href;

let counter = 0;

/**
 * Carga paths.js con un entorno concreto.
 *
 * Lee `process.env` una sola vez, al evaluarse, así que hace falta un módulo
 * nuevo por caso: de ahí el parámetro de caché en la URL.
 */
async function loadWith(env) {
  const keys = ['PROJECTNOTES_HOME', 'PROJECTS_DIR', 'PROJECTNOTES_INDEX_DIR', 'PROJECTNOTES_SCRIPTS_DIR'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, env);

  try {
    return await import(`${MODULE}?t=${counter++}`);
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('sin variables, todo cuelga del directorio de trabajo', async () => {
  const paths = await loadWith({});
  assert.equal(paths.APP_ROOT, process.cwd());
  assert.equal(paths.PROJECTS_DIR, path.join(process.cwd(), 'projects_data'));
  assert.equal(paths.INDEX_DIR, path.join(process.cwd(), '.projectnotes'));
  assert.equal(paths.SCRIPTS_DIR, path.join(process.cwd(), 'scripts'));
});

test('PROJECTNOTES_HOME reubica todo a la vez', async () => {
  const home = path.resolve('/opt/notas');
  const paths = await loadWith({ PROJECTNOTES_HOME: home });
  assert.equal(paths.APP_ROOT, home);
  assert.equal(paths.PROJECTS_DIR, path.join(home, 'projects_data'));
  assert.equal(paths.INDEX_DIR, path.join(home, '.projectnotes'));
  assert.equal(paths.SCRIPTS_DIR, path.join(home, 'scripts'));
});

test('cada ruta se puede fijar por separado y gana sobre HOME', async () => {
  const paths = await loadWith({
    PROJECTNOTES_HOME: path.resolve('/opt/notas'),
    PROJECTS_DIR: path.resolve('/datos/proyectos'),
    PROJECTNOTES_INDEX_DIR: path.resolve('/var/cache/pn'),
    PROJECTNOTES_SCRIPTS_DIR: path.resolve('/opt/bin'),
  });
  assert.equal(paths.PROJECTS_DIR, path.resolve('/datos/proyectos'));
  assert.equal(paths.INDEX_DIR, path.resolve('/var/cache/pn'));
  assert.equal(paths.SCRIPTS_DIR, path.resolve('/opt/bin'));
});

test('una ruta relativa se resuelve contra el directorio de trabajo', async () => {
  const paths = await loadWith({ PROJECTS_DIR: 'datos/mios' });
  assert.equal(paths.PROJECTS_DIR, path.resolve(process.cwd(), 'datos/mios'));
  assert.ok(path.isAbsolute(paths.PROJECTS_DIR));
});

test('una variable vacía o en blanco cuenta como ausente', async () => {
  // Un `PROJECTS_DIR=` suelto en un .env no debe dejar la app apuntando a la
  // raíz del disco.
  for (const value of ['', '   ']) {
    const paths = await loadWith({ PROJECTS_DIR: value });
    assert.equal(paths.PROJECTS_DIR, path.join(process.cwd(), 'projects_data'), `valor ${JSON.stringify(value)}`);
  }
});

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
console.log(failed ? `\npaths: ${failed} fallo(s)` : `\npaths: ${tests.length} tests OK`);
process.exit(failed ? 1 : 0);
