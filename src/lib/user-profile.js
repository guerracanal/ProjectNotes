/**
 * Quién es la persona que usa la aplicación.
 *
 * Sirve para dos cosas distintas, y la segunda es la que de verdad importa:
 *
 *  1. Que el asistente sepa a quién se refiere «mis tareas» o «qué me
 *     comprometí a hacer».
 *  2. Que la búsqueda encuentre los fragmentos donde alguien te nombra. En una
 *     transcripción nadie dice «las tareas del usuario»: dicen «Jorge, ¿te
 *     encargas tú de esto?». Sin el nombre en la consulta, ese fragmento no se
 *     recupera nunca.
 *
 * Sin dependencias de Node: lo usan el servidor y el navegador.
 */

/** Marcadores de que la pregunta va sobre uno mismo. */
const FIRST_PERSON = new RegExp(
  '\\b(' +
    // Español
    'yo|me|mi|mis|mí|mío|mía|míos|mías|conmigo|' +
    'tengo|tenía|debo|debía|asumí|asumo|acordé|comprometí|comprometo|dije|' +
    'llevo|llevaba|encargo|encargué|toca|tocaba' +
    '|' +
    // Inglés
    'i|me|my|mine|myself' +
    ')\\b',
  'i'
);

/** Normaliza el perfil venga de donde venga (entorno o ajustes). */
export function normalizeProfile({ name, aliases } = {}) {
  const cleanName = typeof name === 'string' ? name.trim() : '';

  const rawAliases = Array.isArray(aliases)
    ? aliases
    : typeof aliases === 'string'
      ? aliases.split(',')
      : [];

  const list = [cleanName, ...rawAliases]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);

  // Sin distinguir mayúsculas ni repetidos, conservando el orden de entrada.
  const seen = new Set();
  const unique = [];
  for (const entry of list) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }

  return {
    name: cleanName,
    // El nombre completo también cuenta como forma de referirse a la persona.
    aliases: unique,
    isSet: unique.length > 0,
  };
}

/** Perfil configurado en el entorno del servidor. */
export function profileFromEnv(env = process.env) {
  return normalizeProfile({ name: env.USER_NAME, aliases: env.USER_ALIASES });
}

/** ¿La pregunta habla de quien la escribe? */
export function isFirstPerson(question) {
  return FIRST_PERSON.test(String(question || ''));
}

/**
 * Añade los nombres de la persona a una consulta que habla de ella.
 *
 * Solo se usa para recuperar: la pregunta que ve el modelo no cambia. Los
 * términos originales siguen pesando, así que esto amplía la cobertura sin
 * secuestrar la búsqueda.
 */
export function expandQueryForProfile(query, profile) {
  if (!profile?.isSet) return query;
  if (!isFirstPerson(query)) return query;

  const missing = profile.aliases.filter(
    (alias) => !query.toLowerCase().includes(alias.toLowerCase())
  );
  if (missing.length === 0) return query;

  return `${query} ${missing.join(' ')}`;
}

/** Frase que se le da al modelo para que sepa con quién habla. */
export function describeProfile(profile) {
  if (!profile?.isSet) return '';

  const others = profile.aliases.filter((alias) => alias !== profile.name);
  const alsoKnown = others.length
    ? ` En las notas y transcripciones puede aparecer también como: ${others.join(', ')}.`
    : '';

  return (
    `QUIÉN PREGUNTA: la persona que usa la aplicación se llama ${profile.name || profile.aliases[0]}.${alsoKnown}\n` +
    'Cuando pregunte en primera persona («mis tareas», «qué me comprometí a hacer», «qué tengo pendiente»), ' +
    'se refiere a esa persona: busca en el contexto lo que se dice sobre ella, incluso si aparece nombrada en tercera persona.\n' +
    'Si en el contexto hay varias personas que podrían corresponder a ese nombre, dilo en vez de dar por hecho cuál es.'
  );
}
