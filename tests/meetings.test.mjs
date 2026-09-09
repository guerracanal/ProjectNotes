/**
 * Qué cuenta como reunión, y con qué nombre y fecha.
 *
 * El caso que motivó esto: los vídeos no se sincronizan con Drive, así que en
 * otro equipo quedan la transcripción y el resumen pero no la grabación. Antes
 * la reunión desaparecía de la pestaña, porque la lista se armaba a partir de
 * los ficheros de vídeo.
 */

import assert from 'node:assert/strict';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// El código usa imports sin extensión, que Next resuelve y Node no.
register('./next-shim.mjs', import.meta.url);

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { collectMeetings, meetingDateFromName, meetingTitle } = await import(
  pathToFileURL(path.join(ROOT, 'src', 'lib', 'meetings.js')).href
);

const ficheros = (...nombres) => nombres.map((name) => ({ name, path: `p/${name}` }));
const porNombre = (lista) => Object.fromEntries(lista.map((m) => [m.baseName, m]));

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('una grabación con todo al lado es una reunión', () => {
  const m = porNombre(
    collectMeetings(
      ficheros(
        'kickoff.mp4',
        'kickoff_transcripcion.txt',
        'kickoff_transcripcion.json',
        'kickoff_transcripcion_resumen.txt'
      )
    )
  );
  assert.equal(Object.keys(m).length, 1);
  assert.equal(m.kickoff.kind, 'video');
  assert.ok(m.kickoff.media);
  assert.ok(m.kickoff.transcript && m.kickoff.segments && m.kickoff.summary);
});

test('sin vídeo, la transcripción basta', () => {
  const m = porNombre(
    collectMeetings(ficheros('kickoff_transcripcion.txt', 'kickoff_transcripcion_resumen.txt'))
  );
  assert.deepEqual(Object.keys(m), ['kickoff']);
  assert.equal(m.kickoff.media, null);
  assert.equal(m.kickoff.kind, 'none');
  assert.ok(m.kickoff.transcript, 'debe conservar la transcripción');
  assert.ok(m.kickoff.summary, 'debe conservar el resumen');
});

test('el json de marcas de tiempo también basta por sí solo', () => {
  const m = porNombre(collectMeetings(ficheros('kickoff_transcripcion.json')));
  assert.deepEqual(Object.keys(m), ['kickoff']);
  assert.ok(m.kickoff.segments);
});

test('el audio sigue contando como reunión', () => {
  const m = porNombre(collectMeetings(ficheros('nota.m4a')));
  assert.equal(m.nota.kind, 'audio');
});

test('no inventa reuniones con ficheros sueltos', () => {
  assert.deepEqual(collectMeetings(ficheros('notas.md', 'tasks.md', 'foto.png')), []);
});

test('no duplica cuando están el vídeo y la transcripción', () => {
  const lista = collectMeetings(ficheros('kickoff.mp4', 'kickoff_transcripcion.txt'));
  assert.equal(lista.length, 1);
  assert.ok(lista[0].media, 'la entrada debe conservar el vídeo');
});

test('un nombre con puntos no se parte por el sitio equivocado', () => {
  const m = porNombre(collectMeetings(ficheros('v1.2 revisión.mp4')));
  assert.deepEqual(Object.keys(m), ['v1.2 revisión']);
});

test('la fecha sale del nombre, con hora', () => {
  const f = meetingDateFromName('2026-09-07 10-16-35');
  assert.equal(f.getFullYear(), 2026);
  assert.equal(f.getMonth(), 8);
  assert.equal(f.getDate(), 7);
  assert.equal(f.getHours(), 10);
  assert.equal(f.getMinutes(), 16);
});

test('la fecha sale del nombre aunque lleve texto alrededor', () => {
  const f = meetingDateFromName('Comité 2026-03-01 semanal');
  assert.equal(f.getMonth(), 2);
  assert.equal(f.getDate(), 1);
});

test('acepta el formato de aquí, 07-09-2026', () => {
  const f = meetingDateFromName('reunión 07-09-2026');
  assert.equal(f.getFullYear(), 2026);
  assert.equal(f.getMonth(), 8);
  assert.equal(f.getDate(), 7);
});

test('acepta la fecha pegada', () => {
  const f = meetingDateFromName('20260907_kickoff');
  assert.equal(f.getMonth(), 8);
  assert.equal(f.getDate(), 7);
});

test('una fecha imposible no cuela', () => {
  // Sin comprobarlo, el 31 de febrero se convertiría en el 3 de marzo.
  assert.equal(meetingDateFromName('2026-02-31'), null);
  assert.equal(meetingDateFromName('2026-13-01'), null);
});

test('sin fecha en el nombre, devuelve null', () => {
  assert.equal(meetingDateFromName('kickoff'), null);
  assert.equal(meetingDateFromName(''), null);
  assert.equal(meetingDateFromName(undefined), null);
});

test('un identificador largo no se confunde con una fecha', () => {
  assert.equal(meetingDateFromName('id-123456789012'), null);
});

test('un nombre que es solo una fecha no se repite como título', () => {
  // La cabecera ya muestra la fecha: repetirla como título no aporta nada.
  assert.equal(meetingTitle('2026-09-07 10-16-35'), 'Reunión');
});

test('un nombre con texto se conserva, legible', () => {
  assert.equal(meetingTitle('comite_semanal'), 'comite semanal');
  assert.equal(meetingTitle('Kickoff del proyecto'), 'Kickoff del proyecto');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${error.message.split('\n')[0]}`);
  }
}
console.log(failed ? `\nmeetings: ${failed} fallo(s)` : `\nmeetings: ${tests.length} tests OK`);
process.exit(failed ? 1 : 0);
