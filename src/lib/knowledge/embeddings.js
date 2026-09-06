/**
 * Optional dense-embedding providers.
 *
 * The app works without any of these — BM25 alone answers most questions about
 * a personal notes corpus. Configure one to add semantic recall (finding "what
 * did we decide about pricing" when the note says "tarifas acordadas").
 *
 *   EMBEDDINGS_PROVIDER = voyage | gemini | openai | none   (default: none)
 *   VOYAGE_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY
 */

const PROVIDERS = {
  voyage: {
    env: 'VOYAGE_API_KEY',
    model: 'voyage-3.5-lite',
    dimensions: 1024,
    async embed(texts, { apiKey, model, inputType }) {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: texts, model, input_type: inputType }),
      });
      if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
      const data = await res.json();
      return data.data.map((d) => d.embedding);
    },
  },

  gemini: {
    env: 'GEMINI_API_KEY',
    model: 'gemini-embedding-001',
    dimensions: 768,
    async embed(texts, { apiKey, model, inputType }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType: inputType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
            outputDimensionality: 768,
          })),
        }),
      });
      if (!res.ok) throw new Error(`Gemini embeddings failed: ${res.status} ${await res.text()}`);
      const data = await res.json();
      return data.embeddings.map((e) => e.values);
    },
  },

  openai: {
    env: 'OPENAI_API_KEY',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    async embed(texts, { apiKey, model }) {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: texts, model }),
      });
      if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text()}`);
      const data = await res.json();
      return data.data.map((d) => d.embedding);
    },
  },
};

export function getEmbeddingConfig() {
  const name = (process.env.EMBEDDINGS_PROVIDER || 'none').toLowerCase();
  if (name === 'none' || !PROVIDERS[name]) return { enabled: false, provider: 'none' };

  const provider = PROVIDERS[name];
  const apiKey = process.env[provider.env];
  if (!apiKey) return { enabled: false, provider: name, reason: `${provider.env} is not set` };

  return {
    enabled: true,
    provider: name,
    apiKey,
    model: process.env.EMBEDDINGS_MODEL || provider.model,
    dimensions: provider.dimensions,
  };
}

/** Embed a batch of texts. Returns null when no provider is configured. */
export async function embedTexts(texts, { inputType = 'document', batchSize = 64 } = {}) {
  const config = getEmbeddingConfig();
  if (!config.enabled) return null;

  const provider = PROVIDERS[config.provider];
  const vectors = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embedded = await provider.embed(batch, {
      apiKey: config.apiKey,
      model: config.model,
      inputType,
    });
    vectors.push(...embedded);
  }

  return vectors;
}

export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export const EMBEDDING_PROVIDERS = Object.keys(PROVIDERS);
