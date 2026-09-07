/**
 * Punto de entrada del paquete standalone: `node server.js`.
 *
 * El `server.js` que genera Next arranca el servidor y poco más: no lee
 * ficheros `.env` ni sabe dónde está `projects_data`. Este envoltorio resuelve
 * las dos cosas antes de cederle el control (queda como `next-server.js`).
 *
 * Generado por `npm run build:standalone`. No editar aquí: los cambios se
 * pierden en la siguiente build. El original está en
 * `scripts/templates/standalone-server.js`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const PARENT = path.dirname(HERE);

/** El primer candidato que exista, o null. */
function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Dónde está el contenido del usuario.
 *
 * Buscar también en el directorio padre no es adivinar: el paquete se genera
 * dentro del propio repo, así que `../projects_data` es el `projects_data` de
 * siempre. Así la versión standalone y `npm run dev` trabajan sobre los mismos
 * ficheros en vez de sobre dos copias que se separan.
 */
function resolveProjectsDir() {
  if (process.env.PROJECTS_DIR && process.env.PROJECTS_DIR.trim()) {
    return path.resolve(process.env.PROJECTS_DIR.trim());
  }
  return (
    firstExisting([path.join(HERE, 'projects_data'), path.join(PARENT, 'projects_data')]) ||
    path.join(HERE, 'projects_data')
  );
}

/** El venv del proyecto, para transcribir y resumir. */
function resolvePython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const names = [
    path.join('venv', 'bin', 'python3'),
    path.join('venv', 'Scripts', 'python.exe'),
    path.join('.venv', 'bin', 'python3'),
    path.join('.venv', 'Scripts', 'python.exe'),
  ];
  const roots = [HERE, PARENT];
  return firstExisting(roots.flatMap((root) => names.map((name) => path.join(root, name))));
}

async function main() {
  // 1. Variables de entorno. Las del propio paquete mandan sobre las del repo,
  //    y ninguna pisa lo que ya venga del entorno real.
  let envFiles = [];
  try {
    const { loadEnvFiles } = await import('./scripts/lib/load-env.mjs');
    envFiles = [...loadEnvFiles(HERE), ...loadEnvFiles(PARENT)];
  } catch (error) {
    console.warn(`[standalone] no se pudieron leer los .env: ${error.message}`);
  }

  // 2. Rutas. Sin esto todo colgaría de este directorio y la app no vería ni
  //    los proyectos ni los scripts de Python.
  const projectsDir = resolveProjectsDir();
  process.env.PROJECTNOTES_HOME = HERE;
  process.env.PROJECTS_DIR = projectsDir;
  process.env.PROJECTNOTES_SCRIPTS_DIR =
    process.env.PROJECTNOTES_SCRIPTS_DIR || path.join(HERE, 'scripts');
  // El índice vive junto a los datos que describe, no junto al binario: así
  // sobrevive a rehacer el paquete y se comparte con `npm run dev`.
  process.env.PROJECTNOTES_INDEX_DIR =
    process.env.PROJECTNOTES_INDEX_DIR || path.join(path.dirname(projectsDir), '.projectnotes');

  const python = resolvePython();
  if (python) process.env.PYTHON_BIN = python;

  fs.mkdirSync(projectsDir, { recursive: true });

  const port = process.env.PORT || '3000';
  const host = process.env.HOSTNAME || '0.0.0.0';
  const shown = envFiles.map((entry) => entry.file);

  console.log('ProjectNotes (standalone)');
  console.log(`  datos    ${projectsDir}`);
  console.log(`  índice   ${process.env.PROJECTNOTES_INDEX_DIR}`);
  console.log(`  python   ${python || 'python3 (del sistema)'}`);
  console.log(`  entorno  ${shown.length ? shown.join(', ') : 'sin ficheros .env'}`);
  console.log(`  http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  console.log('');

  // 3. Arrancar Next. Su server.js hace chdir a este directorio y se ejecuta
  //    al requerirlo, así que esto es lo último.
  require('./next-server.js');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
