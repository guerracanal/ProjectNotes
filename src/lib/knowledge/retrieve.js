import { searchBm25 } from './bm25';
import { cosineSimilarity, embedTexts, getEmbeddingConfig } from './embeddings';
import { getIndex } from './store';
import { normalize } from './tokenizer';

/**
 * Hybrid retrieval: BM25 and (when available) dense embeddings, fused with
 * Reciprocal Rank Fusion.
 *
 * RRF is used rather than a weighted score sum because BM25 scores and cosine
 * similarities live on incomparable scales; ranks are the only thing the two
 * retrievers agree on.
 */

const RRF_K = 60;

function rrfMerge(rankedLists, weights) {
  const scores = new Map();
  rankedLists.forEach((list, listIndex) => {
    const weight = weights[listIndex] ?? 1;
    list.forEach((hit, rank) => {
      const contribution = weight / (RRF_K + rank + 1);
      scores.set(hit.index, (scores.get(hit.index) || 0) + contribution);
    });
  });
  return [...scores.entries()].sort((a, b) => b[1] - a[1]);
}

function withinScope(chunk, scope) {
  if (!scope) return true;
  const target = scope.replace(/\/+$/, '');
  return chunk.path === target || chunk.path.startsWith(`${target}/`) || chunk.project === target;
}

/** Build a short excerpt around the best-matching part of a chunk. */
export function excerpt(text, query, maxLength = 260) {
  const haystack = normalize(text);
  const terms = normalize(query)
    .split(/\s+/)
    .filter((t) => t.length > 2);

  let position = -1;
  for (const term of terms) {
    const found = haystack.indexOf(term);
    if (found !== -1 && (position === -1 || found < position)) position = found;
  }
  if (position === -1) position = 0;

  const start = Math.max(0, position - Math.floor(maxLength / 3));
  const slice = text.slice(start, start + maxLength).trim();
  return `${start > 0 ? '…' : ''}${slice}${start + maxLength < text.length ? '…' : ''}`;
}

/**
 * Retrieve the most relevant chunks for a query.
 *
 * @param {string} query
 * @param {{ limit?: number, scope?: string|null, semantic?: boolean }} options
 */
export async function retrieve(query, { limit = 8, scope = null, semantic = true } = {}) {
  const index = await getIndex();
  if (!index.chunks.length || !query?.trim()) {
    return { hits: [], semanticUsed: false, totalChunks: index.chunks.length };
  }

  // Ask each retriever for a wide candidate pool; scoping and fusion narrow it.
  const poolSize = Math.max(limit * 6, 40);
  const lexical = searchBm25(index.bm25, query, poolSize);

  const rankedLists = [lexical];
  const weights = [1];
  let semanticUsed = false;

  if (semantic && index.embeddings && getEmbeddingConfig().enabled) {
    try {
      const [queryVector] = (await embedTexts([query], { inputType: 'query' })) || [];
      if (queryVector) {
        const dense = index.embeddings
          .map((vector, i) => ({ index: i, score: cosineSimilarity(queryVector, vector) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, poolSize);
        rankedLists.push(dense);
        weights.push(1.1); // slight tilt toward semantic recall
        semanticUsed = true;
      }
    } catch (error) {
      console.warn('[knowledge] Semantic query failed, using lexical only:', error.message);
    }
  }

  const fused = rrfMerge(rankedLists, weights);

  const hits = [];
  for (const [chunkIndex, score] of fused) {
    const chunk = index.chunks[chunkIndex];
    if (!chunk) continue;
    if (!withinScope(chunk, scope)) continue;

    hits.push({
      id: chunkIndex,
      score,
      path: chunk.path,
      project: chunk.project,
      title: chunk.title,
      heading: chunk.heading,
      text: chunk.text,
      excerpt: excerpt(chunk.text, query),
    });

    if (hits.length >= limit) break;
  }

  return { hits, semanticUsed, totalChunks: index.chunks.length };
}

/**
 * Plain full-text search used by the global search UI. Groups by document so
 * the results read like a file list rather than a pile of fragments.
 */
export async function searchDocuments(query, { limit = 25, scope = null } = {}) {
  const { hits } = await retrieve(query, { limit: limit * 3, scope, semantic: false });

  const byDocument = new Map();
  for (const hit of hits) {
    if (!byDocument.has(hit.path)) {
      byDocument.set(hit.path, {
        path: hit.path,
        project: hit.project,
        title: hit.title,
        score: hit.score,
        matches: [],
      });
    }
    const entry = byDocument.get(hit.path);
    entry.score = Math.max(entry.score, hit.score);
    if (entry.matches.length < 3) {
      entry.matches.push({ heading: hit.heading, excerpt: hit.excerpt });
    }
  }

  return [...byDocument.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
