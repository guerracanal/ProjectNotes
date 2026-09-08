#!/usr/bin/env node
/**
 * Ensambla `standalone/`: una copia autocontenida de la app que arranca con
 * `node server.js` sin `npm install` ni Next instalado.
 *
 * `next build` con `output: 'standalone'` deja en `.next/standalone` el
 * servidor y las dependencias que el código alcanza de verdad, pero no los
 * estáticos ni `public/` — eso está documentado y hay que copiarlo a mano.
 * Tampoco copia los scripts de Python, que la app lanza como subproceso.
 *
 *   node scripts/build-standalone.mjs [--skip-build] [--no-zip] [--out <dir>]
 */

import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipDirectory } from './lib/zip.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
  const options = { skipBuild: false, noZip: false, out: path.join(ROOT, 'standalone') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--skip-build') options.skipBuild = true;
    else if (arg === '--no-zip') options.noZip = true;
    else if (arg === '--out') options.out = path.resolve(argv[++i] ?? '');
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Opción desconocida: ${arg}`);
  }
  return options;
}

const step = (message) => console.log(`\x1b[36m▸\x1b[0m ${message}`);

/** Tamaño de un árbol, en bytes. */
async function treeSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await treeSize(full);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
  return total;
}

const human = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Uso: node scripts/build-standalone.mjs [--skip-build] [--no-zip] [--out <dir>]');
    return;
  }

  const out = options.out;
  const nextStandalone = path.join(ROOT, '.next', 'standalone');

  // El paso siguiente borra `out` entero. Si alguien lanza esto desde dentro
  // del propio paquete —fácil, porque hasta ahora llevaba una copia de los
  // scripts del repo— más vale decirlo que arrasar el directorio.
  const dentroDeLaSalida = process.cwd() === out || process.cwd().startsWith(out + path.sep);
  if (dentroDeLaSalida || out === ROOT || ROOT.startsWith(out + path.sep)) {
    throw new Error(
      `Esto se lanza desde la raíz del proyecto, no desde ${path.basename(out)}/.\n` +
        `  cd ${ROOT}\n  npm run build:standalone`
    );
  }

  if (!options.skipBuild) {
    step('next build');
    execFileSync('npx', ['next', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  }

  if (!existsSync(nextStandalone)) {
    throw new Error(
      'No existe .next/standalone. Falta `output: \'standalone\'` en next.config.mjs, o la build no llegó a terminar.'
    );
  }

  step(`limpiando ${path.relative(ROOT, out) || out}`);
  await rm(out, { recursive: true, force: true });
  await rm(`${out}.zip`, { force: true });
  await mkdir(out, { recursive: true });

  // Del volcado de Next solo interesan estas dos cosas: el resto (src, docs,
  // tests, projects_data...) lo arrastra el rastreo sin que haga falta.
  step('servidor y dependencias');
  for (const entry of ['.next', 'node_modules']) {
    const from = path.join(nextStandalone, entry);
    if (existsSync(from)) await cp(from, path.join(out, entry), { recursive: true });
  }
  await writeFile(path.join(out, 'package.json'), await bundleManifest(), 'utf8');
  // El entry de Next pasa a segundo plano: `server.js` es nuestro envoltorio.
  await cp(path.join(nextStandalone, 'server.js'), path.join(out, 'next-server.js'));

  step('estáticos y public/');
  await cp(path.join(ROOT, '.next', 'static'), path.join(out, '.next', 'static'), { recursive: true });
  await cp(path.join(ROOT, 'public'), path.join(out, 'public'), { recursive: true });

  // Sin esto, transcribir y resumir fallan al no encontrar el script.
  step('scripts de Python');
  await mkdir(path.join(out, 'scripts'), { recursive: true });
  for (const entry of await readdir(path.join(ROOT, 'scripts'), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.py')) {
      await cp(path.join(ROOT, 'scripts', entry.name), path.join(out, 'scripts', entry.name));
    }
  }
  // El envoltorio lee los .env con este módulo.
  await cp(path.join(ROOT, 'scripts', 'lib'), path.join(out, 'scripts', 'lib'), { recursive: true });
  await cp(path.join(ROOT, 'requirements.txt'), path.join(out, 'requirements.txt'));

  step('punto de entrada');
  await cp(path.join(ROOT, 'scripts', 'templates', 'standalone-server.js'), path.join(out, 'server.js'));
  await writeFile(path.join(out, 'README.md'), readme(), 'utf8');

  const size = await treeSize(out);

  let zip = null;
  if (!options.noZip) {
    step('empaquetando en zip');
    const zipPath = `${out}.zip`;
    const { entries, bytes } = await zipDirectory(out, zipPath, { root: path.basename(out) });
    zip = { path: zipPath, entries, bytes };
  }

  const rel = (p) => path.relative(ROOT, p) || p;
  console.log('');
  console.log(`\x1b[32m✓\x1b[0m ${rel(out)} listo — ${human(size)}`);
  if (zip) {
    console.log(`\x1b[32m✓\x1b[0m ${rel(zip.path)} — ${human(zip.bytes)}, ${zip.entries} ficheros`);
  }
  console.log('');
  console.log(`   cd ${rel(out)} && node server.js`);
  console.log('');
}

/**
 * El `package.json` del paquete.
 *
 * Deliberadamente mínimo. Next copia el del repo entero, con todos sus scripts,
 * y eso convierte la carpeta en una trampa: un `npm run build:standalone` desde
 * dentro ejecuta el script del proyecto con el directorio de trabajo cambiado.
 * Aquí solo queda `start`, que es lo único que tiene sentido ejecutar.
 *
 * `type` se arrastra del repo porque decide si Node lee `server.js` como CommonJS
 * o como módulo, y el que genera Next es CommonJS.
 */
async function bundleManifest() {
  const raiz = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
  return `${JSON.stringify(
    {
      name: `${raiz.name}-standalone`,
      version: raiz.version,
      private: true,
      ...(raiz.type ? { type: raiz.type } : {}),
      scripts: { start: 'node server.js' },
    },
    null,
    2
  )}\n`;
}

function readme() {
  return `# ProjectNotes — paquete standalone

Generado por \`npm run build:standalone\`. **No editar a mano**: cada build
borra y rehace esta carpeta.

## Arrancar

\`\`\`bash
node server.js
\`\`\`

No necesita \`npm install\`: las dependencias que el servidor usa ya están en
\`node_modules/\`. Sí necesita Node 20 o superior.

## Qué usa y de dónde

Al arrancar imprime lo que ha resuelto. Por defecto:

| Qué | Dónde | Variable para cambiarlo |
| --- | --- | --- |
| Proyectos | \`./projects_data\`, y si no existe, \`../projects_data\` | \`PROJECTS_DIR\` |
| Índice del asistente | \`.projectnotes/\` junto a los proyectos | \`PROJECTNOTES_INDEX_DIR\` |
| Claves y ajustes | \`.env.local\` y \`.env\` de esta carpeta, luego los de la carpeta padre | — |
| Python (transcribir/resumir) | \`venv/\` de esta carpeta o de la padre | \`PYTHON_BIN\` |
| Puerto | 3000 | \`PORT\` |

Mirar en la carpeta padre es deliberado: mientras el paquete viva dentro del
repo, comparte datos, índice y claves con \`npm run dev\` en vez de duplicarlos.

## Llevárselo a otra máquina

Copiar la carpeta entera. Allí hará falta:

1. Un \`projects_data/\` dentro (o \`PROJECTS_DIR\` apuntando a él).
2. Un \`.env.local\` con las claves, si se quiere el asistente. Sin clave el
   asistente sigue funcionando con búsqueda léxica local.
3. Un \`venv\` con \`pip install -r requirements.txt\`, solo si se va a
   transcribir o resumir desde esa máquina.
`;
}

main().catch((error) => {
  console.error(`\x1b[31m✗\x1b[0m ${error.message}`);
  process.exit(1);
});
