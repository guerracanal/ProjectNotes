/**
 * Resolución de módulos para ejecutar rutas de la API en un test suelto.
 *
 * Next resuelve dos cosas que Node no conoce: el alias `@/` de `jsconfig.json`
 * y sus propios paquetes. Esto las traduce, y nada más: el código de la ruta se
 * ejecuta tal cual, sin copias ni reimplementaciones.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function resolve(specifier, context, next) {
  if (specifier === 'next/server') {
    return { url: pathToFileURL(path.join(ROOT, 'tests', 'stubs', 'next-server.mjs')).href, shortCircuit: true };
  }

  if (specifier.startsWith('@/')) {
    const base = path.join(ROOT, 'src', specifier.slice(2));
    for (const candidato of [base, `${base}.js`, path.join(base, 'index.js')]) {
      if (existsSync(candidato)) {
        return { url: pathToFileURL(candidato).href, shortCircuit: true };
      }
    }
  }

  return next(specifier, context);
}
