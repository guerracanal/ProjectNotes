/**
 * Un Google Drive de mentira, suficiente para probar el cliente de verdad.
 *
 * Implementa lo que usa `gdrive.js`: subida multipart, subida «resumable» en
 * dos pasos y descarga. No guarda nada en disco —cuenta bytes y los tira—,
 * porque lo que se quiere comprobar es que el cliente no se los guarda en
 * memoria por el camino.
 */

import { createServer } from 'node:http';

export function startMockDrive() {
  const state = { received: new Map(), sessions: new Map(), nextId: 1 };

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (body, status = 200, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };

    // Descarga: el id del fichero lleva el tamaño detrás («grande-1234»), que
    // es más simple que otro parámetro —el cliente ya añade el suyo (?alt=media).
    if (req.method === 'GET' && url.pathname.startsWith('/drive/files/')) {
      const size = Number(url.pathname.split('-').pop());
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) });
      const trozo = Buffer.alloc(1024 * 256);
      let enviado = 0;
      const escribir = () => {
        while (enviado < size) {
          const n = Math.min(trozo.length, size - enviado);
          enviado += n;
          if (!res.write(n === trozo.length ? trozo : trozo.subarray(0, n))) {
            res.once('drain', escribir);
            return;
          }
        }
        res.end();
      };
      escribir();
      return;
    }

    // Paso 1 de la subida resumable: abrir sesión y devolver su URL.
    if (url.searchParams.get('uploadType') === 'resumable') {
      let metadata = '';
      req.on('data', (c) => (metadata += c));
      req.on('end', () => {
        const id = `sesion-${state.nextId++}`;
        state.sessions.set(id, {
          nombre: JSON.parse(metadata || '{}').name,
          declarado: Number(req.headers['x-upload-content-length'] || 0),
        });
        json({}, 200, { Location: `http://127.0.0.1:${server.address().port}/session/${id}` });
      });
      return;
    }

    // Paso 2: el contenido. Se cuenta y se descarta.
    if (req.method === 'PUT' && url.pathname.startsWith('/session/')) {
      const id = url.pathname.split('/').pop();
      const sesion = state.sessions.get(id);
      let bytes = 0;
      req.on('data', (c) => (bytes += c.length));
      req.on('end', () => {
        state.received.set(sesion.nombre, { bytes, via: 'resumable', declarado: sesion.declarado });
        json({ id: `id-${id}`, name: sesion.nombre, modifiedTime: new Date().toISOString() });
      });
      return;
    }

    // Subida multipart: un solo cuerpo con metadatos y contenido.
    if (url.searchParams.get('uploadType') === 'multipart') {
      const trozos = [];
      req.on('data', (c) => trozos.push(c));
      req.on('end', () => {
        const cuerpo = Buffer.concat(trozos).toString('binary');
        const nombre = JSON.parse(cuerpo.match(/\{"name":.*?\}/)[0]).name;
        // El contenido va tras la segunda cabecera en blanco y antes del cierre.
        const inicio = cuerpo.indexOf('\r\n\r\n', cuerpo.indexOf('Content-Type: ', cuerpo.indexOf('json'))) + 4;
        const fin = cuerpo.lastIndexOf('\r\n--');
        state.received.set(nombre, { bytes: fin - inicio, via: 'multipart' });
        json({ id: `id-${nombre}`, name: nombre, modifiedTime: new Date().toISOString() });
      });
      return;
    }

    json({ error: `sin ruta para ${req.method} ${req.url}` }, 404);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        state,
        apiBase: `http://127.0.0.1:${port}/drive`,
        uploadBase: `http://127.0.0.1:${port}/upload`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
