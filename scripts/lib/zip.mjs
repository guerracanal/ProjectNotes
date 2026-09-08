/**
 * Escritor de ZIP, en Node y sin dependencias.
 *
 * Node no trae nada para crear zips, y las alternativas no son portables: GNU
 * tar no sabe hacer zip, `zip` no viene en Windows y `Compress-Archive` no
 * existe fuera de PowerShell. Escribir el formato a mano son cien líneas y
 * funciona igual en las tres plataformas.
 *
 * Se queda en ZIP clásico a propósito: sin ZIP64, que haría falta a partir de
 * 4 GB o de 65535 entradas. El paquete standalone anda por 18 MB y 1800
 * entradas, así que sobra — y `zipDirectory` avisa si algún día deja de serlo.
 */

import { createWriteStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { once } from 'node:events';

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const DEFLATE = 8;
const STORE = 0;
const UTF8_NAMES = 0x0800; // bit 11: los nombres van en UTF-8, no en cp437
const MAX_ENTRIES = 0xffff;
const MAX_SIZE = 0xffffffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** La fecha, en el formato de MS-DOS que usa el ZIP (resolución: 2 segundos). */
function dosStamp(when) {
  const date = when < new Date('1980-01-01') ? new Date('1980-01-01') : when;
  return {
    time:
      ((date.getHours() & 0x1f) << 11) |
      ((date.getMinutes() & 0x3f) << 5) |
      ((date.getSeconds() >> 1) & 0x1f),
    date:
      (((date.getFullYear() - 1980) & 0x7f) << 9) |
      (((date.getMonth() + 1) & 0x0f) << 5) |
      (date.getDate() & 0x1f),
  };
}

/** Lista recursiva de ficheros, con su ruta relativa en barras hacia delante. */
async function walk(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full, base)));
    else if (entry.isFile()) out.push({ full, name: path.relative(base, full).split(path.sep).join('/') });
  }
  return out;
}

/**
 * Comprime `sourceDir` en `zipPath`.
 *
 * Todo cuelga de una carpeta dentro del zip (`root`), para que descomprimirlo
 * no vuelque mil ficheros sueltos en el escritorio de nadie.
 */
export async function zipDirectory(sourceDir, zipPath, { root = path.basename(sourceDir) } = {}) {
  const files = (await walk(sourceDir)).sort((a, b) => a.name.localeCompare(b.name));
  if (files.length > MAX_ENTRIES) {
    throw new Error(`El zip clásico admite ${MAX_ENTRIES} entradas y hay ${files.length}: haría falta ZIP64.`);
  }

  const salida = createWriteStream(zipPath);
  let offset = 0;
  const central = [];

  const escribir = async (buffer) => {
    if (!salida.write(buffer)) await once(salida, 'drain');
    offset += buffer.length;
  };

  for (const file of files) {
    const contenido = await readFile(file.full);
    const info = await stat(file.full);
    if (contenido.length > MAX_SIZE) {
      throw new Error(`${file.name} pasa de 4 GB: haría falta ZIP64.`);
    }

    // Comprimir antes de escribir la cabecera: lleva el tamaño comprimido, y
    // así no hace falta el descriptor que va detrás de los datos.
    const comprimido = contenido.length ? deflateRawSync(contenido, { level: 9 }) : Buffer.alloc(0);
    const usarDeflate = comprimido.length < contenido.length;
    const datos = usarDeflate ? comprimido : contenido;
    const { time, date } = dosStamp(info.mtime);
    const nombre = Buffer.from(`${root}/${file.name}`, 'utf8');
    const crc = crc32(contenido);

    const cabecera = Buffer.alloc(30);
    cabecera.writeUInt32LE(LOCAL_HEADER, 0);
    cabecera.writeUInt16LE(20, 4);
    cabecera.writeUInt16LE(UTF8_NAMES, 6);
    cabecera.writeUInt16LE(usarDeflate ? DEFLATE : STORE, 8);
    cabecera.writeUInt16LE(time, 10);
    cabecera.writeUInt16LE(date, 12);
    cabecera.writeUInt32LE(crc, 14);
    cabecera.writeUInt32LE(datos.length, 18);
    cabecera.writeUInt32LE(contenido.length, 22);
    cabecera.writeUInt16LE(nombre.length, 26);
    cabecera.writeUInt16LE(0, 28);

    central.push({
      nombre,
      crc,
      comprimido: datos.length,
      original: contenido.length,
      metodo: usarDeflate ? DEFLATE : STORE,
      time,
      date,
      offset,
      modo: info.mode & 0o7777,
    });

    await escribir(cabecera);
    await escribir(nombre);
    if (datos.length) await escribir(datos);
  }

  const inicioCentral = offset;
  for (const e of central) {
    const registro = Buffer.alloc(46);
    registro.writeUInt32LE(CENTRAL_HEADER, 0);
    registro.writeUInt16LE((3 << 8) | 20, 4); // creado en Unix: conserva permisos
    registro.writeUInt16LE(20, 6);
    registro.writeUInt16LE(UTF8_NAMES, 8);
    registro.writeUInt16LE(e.metodo, 10);
    registro.writeUInt16LE(e.time, 12);
    registro.writeUInt16LE(e.date, 14);
    registro.writeUInt32LE(e.crc, 16);
    registro.writeUInt32LE(e.comprimido, 20);
    registro.writeUInt32LE(e.original, 24);
    registro.writeUInt16LE(e.nombre.length, 28);
    registro.writeUInt16LE(0, 30);
    registro.writeUInt16LE(0, 32);
    registro.writeUInt16LE(0, 34);
    registro.writeUInt16LE(0, 36);
    registro.writeUInt32LE(((0o100000 | e.modo) >>> 0) * 65536, 38);
    registro.writeUInt32LE(e.offset, 42);
    await escribir(registro);
    await escribir(e.nombre);
  }

  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(END_OF_CENTRAL, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(central.length, 8);
  fin.writeUInt16LE(central.length, 10);
  fin.writeUInt32LE(offset - inicioCentral, 12);
  fin.writeUInt32LE(inicioCentral, 16);
  fin.writeUInt16LE(0, 20);
  await escribir(fin);

  salida.end();
  await once(salida, 'close');

  return { entries: files.length, bytes: offset };
}
