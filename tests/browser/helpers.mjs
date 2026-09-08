/**
 * Lo que comparten las pruebas de navegador.
 *
 * Todo lo que depende de la máquina sale de variables de entorno, para que
 * valgan igual en Linux, en Windows y en el contenedor donde se escribieron.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/** Servidor contra el que se prueba. Arráncalo antes con `npm run dev`. */
export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/** El proyecto de ejemplo, del que estas pruebas leen y en el que escriben. */
export const PROJECT_DIR =
  process.env.PROJECT_DIR || path.join(ROOT, 'projects_data', 'Proyecto_Ejemplo');

/**
 * Opciones de arranque de Chromium.
 *
 * `CHROMIUM_PATH` permite usar un Chromium ya instalado en vez del que se
 * bajaría Playwright, que es lo que hace falta en un contenedor.
 */
export function launchOptions() {
  const executablePath = process.env.CHROMIUM_PATH;
  return executablePath ? { executablePath } : {};
}
