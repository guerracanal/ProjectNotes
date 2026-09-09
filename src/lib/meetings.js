/**
 * Qué cuenta como reunión y cómo se llama.
 *
 * Antes una reunión era un fichero de vídeo o audio, y todo lo demás
 * —transcripción, resumen— colgaba de él. Eso deja de valer en cuanto la
 * grabación no está: los vídeos no se sincronizan con Drive, así que en otro
 * equipo hay transcripción y resumen pero no vídeo, y la reunión desaparecía de
 * la pestaña aunque todo lo que se lee de ella siguiera ahí.
 *
 * Ahora manda el contenido: hay reunión si hay grabación **o** transcripción.
 */

import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from './file-kinds';

const TRANSCRIPT = '_transcripcion.txt';
const SEGMENTS = '_transcripcion.json';
const SUMMARY = '_transcripcion_resumen.txt';

const MEDIA_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];

/** La extensión de `name` en minúsculas, con el punto. '' si no tiene. */
function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/**
 * Agrupa los ficheros de una carpeta en reuniones.
 *
 * `files` son objetos con al menos `name`. Devuelve una entrada por reunión,
 * con el nombre de cada pieza o null si falta. Función pura: la lectura de
 * contenidos la hace quien llama.
 */
export function collectMeetings(files) {
  const names = new Set(files.map((f) => f.name));
  const byName = new Map(files.map((f) => [f.name, f]));
  const meetings = new Map();

  const asegurar = (baseName) => {
    if (!meetings.has(baseName)) {
      meetings.set(baseName, {
        baseName,
        media: null,
        kind: 'none',
        transcript: names.has(baseName + TRANSCRIPT) ? byName.get(baseName + TRANSCRIPT) : null,
        segments: names.has(baseName + SEGMENTS) ? byName.get(baseName + SEGMENTS) : null,
        summary: names.has(baseName + SUMMARY) ? byName.get(baseName + SUMMARY) : null,
      });
    }
    return meetings.get(baseName);
  };

  // 1. Las grabaciones que haya.
  for (const file of files) {
    const ext = extensionOf(file.name);
    if (!MEDIA_EXTENSIONS.includes(ext)) continue;
    const entry = asegurar(file.name.slice(0, file.name.length - ext.length));
    entry.media = file;
    entry.kind = AUDIO_EXTENSIONS.includes(ext) ? 'audio' : 'video';
  }

  // 2. Las transcripciones sueltas, sin grabación al lado. Son las reuniones
  //    que antes no se veían.
  for (const file of files) {
    if (file.name.endsWith(TRANSCRIPT)) {
      asegurar(file.name.slice(0, file.name.length - TRANSCRIPT.length));
    } else if (file.name.endsWith(SEGMENTS)) {
      asegurar(file.name.slice(0, file.name.length - SEGMENTS.length));
    }
  }

  return [...meetings.values()];
}

/**
 * La fecha de la reunión, sacada de su nombre.
 *
 * Preferir el nombre a la fecha del fichero no es capricho: al sincronizar con
 * Drive la fecha de modificación pasa a ser la de la subida, así que una
 * reunión de marzo aparecería como de hoy. El nombre, en cambio, suele llevarla
 * —las grabaciones de Teams y OBS se llaman así.
 *
 * Devuelve null si no reconoce ninguna fecha, para que quien llame use la del
 * fichero.
 */
export function meetingDateFromName(baseName) {
  const texto = String(baseName ?? '');

  // 2026-09-07, con hora opcional detrás: «2026-09-07 10-16-35».
  const iso = texto.match(
    /(\d{4})-(\d{2})-(\d{2})(?:[ _T]+(\d{2})[-.:h](\d{2})(?:[-.:](\d{2}))?)?/
  );
  if (iso) {
    const fecha = construir(iso[1], iso[2], iso[3], iso[4], iso[5], iso[6]);
    if (fecha) return fecha;
  }

  // 07-09-2026 o 07/09/2026.
  const europea = texto.match(/(\d{2})[-/.](\d{2})[-/.](\d{4})/);
  if (europea) {
    const fecha = construir(europea[3], europea[2], europea[1]);
    if (fecha) return fecha;
  }

  // 20260907, pegado. Se exige que no vaya rodeado de más dígitos para no
  // confundirlo con un identificador cualquiera.
  const compacta = texto.match(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (compacta) {
    const fecha = construir(compacta[1], compacta[2], compacta[3]);
    if (fecha) return fecha;
  }

  return null;
}

/** Construye la fecha y comprueba que existe: «2026-02-31» no vale. */
function construir(año, mes, dia, hora = 0, minuto = 0, segundo = 0) {
  const y = Number(año);
  const m = Number(mes);
  const d = Number(dia);
  if (y < 1970 || y > 2999 || m < 1 || m > 12 || d < 1 || d > 31) return null;

  const fecha = new Date(y, m - 1, d, Number(hora) || 0, Number(minuto) || 0, Number(segundo) || 0);
  // Un desbordamiento (31 de febrero → 3 de marzo) cambia el mes: eso lo delata.
  if (fecha.getFullYear() !== y || fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return null;
  return fecha;
}

/**
 * Un título legible a partir del nombre del fichero.
 *
 * «2026-09-07 10-16-35» a secas no dice nada, y es justo como se llaman las
 * grabaciones de Teams: si el nombre es solo una fecha, la cabecera ya la
 * muestra, así que aquí se dice «Reunión» y se deja de repetir.
 */
export function meetingTitle(baseName) {
  const limpio = String(baseName ?? '').trim();
  const soloFecha = /^[\d\s_.:-]+$/.test(limpio);
  if (!limpio || soloFecha) return 'Reunión';

  return limpio
    .replace(/[_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
