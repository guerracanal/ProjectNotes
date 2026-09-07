import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'prompt-'));
const root = fileURLToPath(new URL('../src/lib/', import.meta.url));

// Inline the one @/ import so the module can be loaded outside Next.
writeFileSync(join(dir, 'transcript.mjs'), readFileSync(`${root}transcript.js`, 'utf8'));
let prompt = readFileSync(`${root}knowledge/prompt.js`, 'utf8')
  .replace("from '@/lib/transcript'", "from './transcript.mjs'");
writeFileSync(join(dir, 'prompt.mjs'), prompt);

const { ASSISTANT_INSTRUCTIONS, buildContextBlock } = await import(join(dir, 'prompt.mjs'));

const failures = [];
const check = (l, ok, d = '') => {
  console.log(`${ok ? '✓' : '✗'} ${l}${ok ? '' : ` — ${d}`}`);
  if (!ok) failures.push(l);
};

const block = buildContextBlock([
  { project: 'Portal', title: 'reunion_kickoff_transcripcion.json', heading: '0:51 – 1:44',
    text: 'Una duda sobre el buscador…', start: 51.2, media: 'reunion_kickoff.mp4' },
  { project: 'Portal', title: 'notas.md', heading: 'Decisiones', text: 'Se acordó salir en noviembre.' },
]);

console.log('\n--- bloque de contexto ---\n' + block + '\n---\n');

check('a spoken chunk announces its minute', block.includes('(min. 0:51)'), block);
check('a spoken chunk names the recording', block.includes('«reunion_kickoff.mp4»'));
check('a written chunk keeps its heading trail', block.includes('notas.md › Decisiones'));
check('a written chunk carries no minute', !block.split('[2]')[1].includes('min.'));
check('chunks are numbered for citation', block.includes('[1]') && block.includes('[2]'));

check('the instructions require citing', ASSISTANT_INSTRUCTIONS.includes('Cita tus fuentes'));
check('the instructions forbid inventing', /Nunca inventes/.test(ASSISTANT_INSTRUCTIONS));
check('the instructions ask for the minute', ASSISTANT_INSTRUCTIONS.includes('min. 12:34'));
check('the instructions flag transcription errors',
  /reconocimiento de voz/.test(ASSISTANT_INSTRUCTIONS));

const empty = buildContextBlock([]);
check('says plainly when nothing was found', empty.includes('No se encontró'));

console.log();
if (failures.length) { console.log(`❌ ${failures.length} fallo(s)`); process.exit(1); }
console.log('✅ El contexto lleva los minutos al modelo.');
