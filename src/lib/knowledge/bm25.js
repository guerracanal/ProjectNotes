import { tokenize } from './tokenizer';

/**
 * Okapi BM25 over the chunk corpus.
 *
 * Lexical retrieval is the default because it needs no API key, no network and
 * no model download — the app stays fully usable offline. When embeddings are
 * configured they are fused on top of these scores rather than replacing them:
 * exact matches on project names, acronyms and people's names are precisely
 * what a dense model tends to lose.
 */

const K1 = 1.5;
const B = 0.75;

export function buildBm25Index(chunks) {
  const postings = new Map(); // term -> Map(chunkIndex -> termFrequency)
  const lengths = new Array(chunks.length).fill(0);

  chunks.forEach((chunk, i) => {
    // The heading is indexed twice: a section title is a strong relevance
    // signal and would otherwise be swamped by the body text.
    const tokens = tokenize(`${chunk.heading} ${chunk.heading} ${chunk.title || ''} ${chunk.text}`);
    lengths[i] = tokens.length;

    const counts = new Map();
    for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);

    for (const [term, tf] of counts) {
      if (!postings.has(term)) postings.set(term, new Map());
      postings.get(term).set(i, tf);
    }
  });

  const totalLength = lengths.reduce((a, b) => a + b, 0);
  const avgLength = chunks.length ? totalLength / chunks.length : 0;

  return { postings, lengths, avgLength, docCount: chunks.length };
}

export function searchBm25(index, query, limit = 40) {
  if (!index || !index.docCount) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const scores = new Map();

  for (const term of queryTerms) {
    const posting = index.postings.get(term);
    if (!posting) continue;

    const df = posting.size;
    const idf = Math.log(1 + (index.docCount - df + 0.5) / (df + 0.5));

    for (const [docIndex, tf] of posting) {
      const norm = 1 - B + (B * index.lengths[docIndex]) / (index.avgLength || 1);
      const score = idf * ((tf * (K1 + 1)) / (tf + K1 * norm));
      scores.set(docIndex, (scores.get(docIndex) || 0) + score);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([index_, score]) => ({ index: index_, score }));
}

/** Serialise the postings map so the index survives a process restart. */
export function serializeBm25(index) {
  return {
    postings: [...index.postings.entries()].map(([term, docs]) => [term, [...docs.entries()]]),
    lengths: index.lengths,
    avgLength: index.avgLength,
    docCount: index.docCount,
  };
}

export function deserializeBm25(raw) {
  return {
    postings: new Map(raw.postings.map(([term, docs]) => [term, new Map(docs)])),
    lengths: raw.lengths,
    avgLength: raw.avgLength,
    docCount: raw.docCount,
  };
}
