import path from 'path';

/**
 * Dónde vive cada cosa en disco.
 *
 * Hasta ahora todo colgaba de `process.cwd()`, que sirve mientras el servidor
 * arranca desde la raíz del repo. La build standalone rompe esa premisa: el
 * `server.js` que genera Next corre desde su propia carpeta, así que
 * `projects_data`, el índice y los scripts de Python quedarían fuera de su
 * alcance. Con estas variables cada ruta se puede fijar desde fuera y el
 * comportamiento por defecto sigue siendo el de siempre.
 */

/** Una ruta del entorno, resuelta a absoluta. Cadena vacía cuenta como ausente. */
function fromEnv(name) {
  const raw = process.env[name];
  return raw && raw.trim() ? path.resolve(raw.trim()) : null;
}

/** Raíz de la que cuelga todo lo demás si no se dice otra cosa. */
export const APP_ROOT = fromEnv('PROJECTNOTES_HOME') || process.cwd();

/** Raíz del contenido del usuario: proyectos, notas, vídeos, transcripciones. */
export const PROJECTS_DIR = fromEnv('PROJECTS_DIR') || path.join(APP_ROOT, 'projects_data');

/** Caché en disco del índice de conocimiento. Se puede borrar sin perder nada. */
export const INDEX_DIR = fromEnv('PROJECTNOTES_INDEX_DIR') || path.join(APP_ROOT, '.projectnotes');

/** Scripts de Python (transcripción y resumen) que el servidor lanza como subproceso. */
export const SCRIPTS_DIR = fromEnv('PROJECTNOTES_SCRIPTS_DIR') || path.join(APP_ROOT, 'scripts');
