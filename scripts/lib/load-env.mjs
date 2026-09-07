/**
 * Lector de ficheros .env para los scripts del proyecto.
 *
 * Next.js trae el suyo, pero los scripts sueltos (el diagnóstico) corren fuera
 * de Next y necesitan uno propio.
 *
 * Tolera lo que la gente escribe de verdad en estos ficheros: finales de línea
 * de Windows, BOM, comillas, `export` delante, comentarios y espacios sueltos.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Convierte el contenido de un .env en un objeto.
 *
 * El corte por `/\r?\n/` no es cosmético: en JavaScript `\r` es un terminador
 * de línea, así que `.` no lo captura y un `$` sin flag `m` no lo tolera. Con
 * un fichero guardado en Windows, partir solo por `\n` deja un `\r` colgando
 * que hace fallar el match y descarta la línea entera en silencio.
 */
export function parseEnv(contents) {
  const result = {};

  // Quitar el BOM que añaden algunos editores de Windows.
  const text = contents.replace(/^﻿/, '');

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    } else {
      // Un comentario al final solo cuenta si el valor no iba entrecomillado.
      value = value.replace(/\s+#.*$/, '').trim();
    }

    result[key] = value;
  }

  return result;
}

/**
 * Carga los .env del proyecto en process.env, sin pisar lo que ya venga del
 * entorno. Devuelve los ficheros que ha leído, para poder informar.
 */
export function loadEnvFiles(root, files = ['.env.local', '.env']) {
  const loaded = [];

  for (const file of files) {
    const path = join(root, file);
    if (!existsSync(path)) continue;

    const values = parseEnv(readFileSync(path, 'utf8'));
    let applied = 0;

    for (const [key, value] of Object.entries(values)) {
      if (value && !process.env[key]) {
        process.env[key] = value;
        applied += 1;
      }
    }

    loaded.push({ file, keys: Object.keys(values), applied });
  }

  return loaded;
}
