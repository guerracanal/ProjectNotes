import { parseEnv } from '../scripts/lib/load-env.mjs';

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

console.log('parseEnv');

// El fallo que reportó el usuario: fichero guardado en Windows.
const crlf = parseEnv('GEMINI_API_KEY=abc123\r\nGROQ_API_KEY=def456\r\n');
check('lee un fichero con finales de línea de Windows',
  crlf.GEMINI_API_KEY === 'abc123' && crlf.GROQ_API_KEY === 'def456',
  JSON.stringify(crlf));

check('no deja un \\r pegado al valor', !JSON.stringify(crlf).includes('\\r'), JSON.stringify(crlf));

const lf = parseEnv('GEMINI_API_KEY=abc123\nGROQ_API_KEY=def456');
check('lee un fichero con finales de línea de Unix',
  lf.GEMINI_API_KEY === 'abc123' && lf.GROQ_API_KEY === 'def456');

check('tolera el BOM de los editores de Windows',
  parseEnv('﻿GEMINI_API_KEY=abc').GEMINI_API_KEY === 'abc');

check('quita las comillas dobles', parseEnv('K="con espacios"').K === 'con espacios');
check('quita las comillas simples', parseEnv("K='valor'").K === 'valor');
check('acepta el prefijo export', parseEnv('export K=v').K === 'v');
check('ignora comentarios y líneas vacías',
  Object.keys(parseEnv('# nota\n\n  \nK=v')).length === 1);
check('quita un comentario al final de la línea', parseEnv('K=v # nota').K === 'v');
check('respeta las almohadillas dentro de comillas',
  parseEnv('K="a # b"').K === 'a # b');
check('tolera espacios alrededor del igual', parseEnv('  K  =  v  ').K === 'v');
check('admite un valor vacío', parseEnv('K=').K === '');
check('conserva los iguales del valor',
  parseEnv('K=a=b=c').K === 'a=b=c');
check('admite claves en minúscula', parseEnv('lower_key=v').lower_key === 'v');
check('ignora una línea sin igual', Object.keys(parseEnv('esto no es una variable')).length === 0);

// Una clave real de Gemini lleva guiones y guiones bajos.
check('no estropea una clave con guiones',
  parseEnv('GEMINI_API_KEY=AIza-Sy_D3f-gh1\r\n').GEMINI_API_KEY === 'AIza-Sy_D3f-gh1');

console.log();
if (failures.length) {
  console.log(`❌ ${failures.length} fallo(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('✅ El lector de .env aguanta lo que la gente escribe de verdad.');
