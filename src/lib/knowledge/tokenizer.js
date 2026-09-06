/**
 * Language-agnostic tokenizer tuned for the Spanish/English mix that this app's
 * notes and meeting transcripts are written in.
 *
 * Accents are folded (so "reunión" matches "reunion"), case is normalised, and
 * a small bilingual stop-word list keeps the index focused on content words.
 */

const STOPWORDS = new Set([
  // Spanish
  'a', 'al', 'algo', 'algunas', 'algunos', 'ante', 'antes', 'como', 'con', 'contra',
  'cual', 'cuando', 'de', 'del', 'desde', 'donde', 'durante', 'e', 'el', 'ella',
  'ellas', 'ellos', 'en', 'entre', 'era', 'eran', 'es', 'esa', 'esas', 'ese', 'eso',
  'esos', 'esta', 'estaba', 'estan', 'estas', 'este', 'esto', 'estos', 'estoy', 'fue',
  'fueron', 'ha', 'habia', 'han', 'hasta', 'hay', 'la', 'las', 'le', 'les', 'lo',
  'los', 'mas', 'me', 'mi', 'mis', 'mucho', 'muy', 'nada', 'ni', 'no', 'nos',
  'nosotros', 'nuestro', 'o', 'os', 'otra', 'otro', 'para', 'pero', 'poco', 'por',
  'porque', 'que', 'quien', 'se', 'sea', 'segun', 'ser', 'si', 'sin', 'sobre', 'solo',
  'son', 'su', 'sus', 'tambien', 'tanto', 'te', 'tiene', 'todo', 'todos', 'tu', 'un',
  'una', 'uno', 'unos', 'y', 'ya', 'yo',
  // English
  'a', 'about', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been',
  'but', 'by', 'can', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'he',
  'her', 'his', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'just', 'me', 'more', 'my',
  'no', 'not', 'of', 'on', 'or', 'our', 'out', 'she', 'so', 'some', 'than', 'that',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'up', 'was',
  'we', 'were', 'what', 'when', 'which', 'who', 'will', 'with', 'would', 'you', 'your',
]);

/** Strip diacritics so accented and unaccented spellings collide. */
export function foldAccents(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalize(text) {
  return foldAccents(String(text || '').toLowerCase());
}

/**
 * Very light stemmer: trims the handful of Spanish/English inflections that
 * matter most for recall. Deliberately conservative — over-stemming hurts
 * precision more than the extra recall helps.
 */
function stem(token) {
  if (token.length <= 4) return token;
  for (const suffix of ['ciones', 'aciones', 'mente', 'ando', 'endo', 'ies', 'ing', 'es', 's']) {
    if (token.length - suffix.length >= 3 && token.endsWith(suffix)) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

export function tokenize(text, { keepStopwords = false } = {}) {
  const normalized = normalize(text);
  const raw = normalized.match(/[a-z0-9][a-z0-9_-]*/g) || [];
  const tokens = [];

  const accept = (token) => {
    if (token.length < 2) return;
    if (!keepStopwords && STOPWORDS.has(token)) return;
    tokens.push(stem(token));
  };

  for (const token of raw) {
    accept(token);

    // File names carry real signal ("reunion_kickoff_transcripcion.txt"), but
    // nobody searches for the whole slug — index the parts as well.
    if (token.includes('_') || token.includes('-')) {
      for (const part of token.split(/[_-]+/)) accept(part);
    }
  }

  return tokens;
}

export { STOPWORDS };
