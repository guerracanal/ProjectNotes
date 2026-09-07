import {
  describeProfile,
  expandQueryForProfile,
  isFirstPerson,
  normalizeProfile,
  profileFromEnv,
} from '../src/lib/user-profile.js';

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

console.log('normalizeProfile');
{
  const p = normalizeProfile({ name: 'Jorge Guerra', aliases: 'Jorge, Guerra, jorge guerra' });
  check('el nombre completo entra como alias', p.aliases[0] === 'Jorge Guerra');
  check('separa los alias por comas', p.aliases.includes('Jorge') && p.aliases.includes('Guerra'));
  check('quita repetidos sin mirar mayúsculas',
    p.aliases.length === 3, JSON.stringify(p.aliases));
  check('marca que hay perfil', p.isSet === true);

  check('acepta un array de alias',
    normalizeProfile({ name: 'Ana', aliases: ['Anita'] }).aliases.length === 2);
  check('sin nada, no hay perfil', normalizeProfile({}).isSet === false);
  check('ignora espacios sueltos',
    normalizeProfile({ name: '  ', aliases: ' , ' }).isSet === false);
  check('vale solo con alias, sin nombre',
    normalizeProfile({ aliases: 'Jorge' }).isSet === true);
}

console.log('\nprofileFromEnv');
{
  const p = profileFromEnv({ USER_NAME: 'Jorge Guerra', USER_ALIASES: 'Jorge,Guerra' });
  check('lee del entorno', p.name === 'Jorge Guerra' && p.aliases.length === 3);
  check('sin variables, no hay perfil', profileFromEnv({}).isSet === false);
}

console.log('\nisFirstPerson');
{
  const sobreMi = [
    '¿Qué tareas tengo pendientes?',
    '¿Qué me comprometí a hacer?',
    'Resume mis pendientes',
    '¿A mí qué me toca?',
    'What did I agree to?',
  ];
  const sobreOtros = [
    '¿Qué se decidió sobre el buscador?',
    'Resume la reunión de kickoff',
    '¿Cuál es el plazo de la fase uno?',
  ];
  check('detecta preguntas en primera persona', sobreMi.every(isFirstPerson),
    JSON.stringify(sobreMi.filter((q) => !isFirstPerson(q))));
  check('no marca las que no lo son', sobreOtros.every((q) => !isFirstPerson(q)),
    JSON.stringify(sobreOtros.filter(isFirstPerson)));
}

console.log('\nexpandQueryForProfile');
{
  const profile = normalizeProfile({ name: 'Jorge Guerra', aliases: 'Jorge' });

  const expanded = expandQueryForProfile('¿Qué tareas tengo pendientes?', profile);
  check('añade el nombre a una pregunta sobre uno mismo',
    expanded.includes('Jorge Guerra') && expanded.includes('tareas'), expanded);

  check('no toca las preguntas que no van de uno mismo',
    expandQueryForProfile('¿Qué se decidió del buscador?', profile) ===
      '¿Qué se decidió del buscador?');

  check('sin perfil no cambia nada',
    expandQueryForProfile('¿Qué tengo?', normalizeProfile({})) === '¿Qué tengo?');

  check('no repite un nombre que ya está en la pregunta',
    (expandQueryForProfile('¿Qué tengo pendiente, Jorge Guerra?', profile).match(/Jorge Guerra/g) || [])
      .length === 1);
}

console.log('\ndescribeProfile');
{
  const text = describeProfile(normalizeProfile({ name: 'Jorge Guerra', aliases: 'Jorge' }));
  check('nombra a la persona', text.includes('Jorge Guerra'));
  check('lista las otras formas de nombrarla', text.includes('Jorge'));
  check('explica qué significa la primera persona', /primera persona|mis tareas/.test(text));
  check('pide avisar si hay ambigüedad', /varias personas/.test(text));
  check('sin perfil devuelve vacío', describeProfile(normalizeProfile({})) === '');
}

console.log();
if (failures.length) {
  console.log(`❌ ${failures.length} fallo(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('✅ El perfil de usuario se comporta como debe.');
