import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Emite en `.next/standalone` un servidor autocontenido con solo las
   * dependencias que el código alcanza de verdad, en vez de todo `node_modules`.
   * Es lo que empaqueta `npm run build:standalone`; para `next dev` y
   * `next start` no cambia nada.
   */
  output: 'standalone',

  // Fijar la raíz del rastreo evita que Next la deduzca del lockfile más
  // cercano y acabe recogiendo ficheros de fuera del proyecto.
  outputFileTracingRoot: projectRoot,

  // El rastreo peca de generoso. `typescript` solo hace falta al compilar, y
  // `sharp` es el optimizador de imágenes de `next/image`, que esta app no usa
  // (las miniaturas se sirven tal cual desde /api/projects). Entre los dos son
  // ~53 MB de los 76 MB del paquete. Si algún día se usa `next/image`, hay que
  // quitar sharp y @img de esta lista.
  outputFileTracingExcludes: {
    '*': [
      'node_modules/typescript/**',
      'node_modules/sharp/**',
      'node_modules/@img/**',
    ],
  },
};

export default nextConfig;
