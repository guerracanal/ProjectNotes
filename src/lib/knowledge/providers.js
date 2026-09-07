import Anthropic from '@anthropic-ai/sdk';

/**
 * Chat providers.
 *
 * Every provider exposes the same two things:
 *
 *   listModels({ apiKey, baseUrl })  → [{ id, label }]
 *   stream({ system, messages, ... }) → async generator of text deltas
 *
 * so `/api/chat` never has to care which one is answering. Adding a provider
 * means adding an entry here and nothing else.
 *
 * `messages` is always `[{ role: 'user' | 'assistant', content: string }]` and
 * `system` is a single string; each adapter maps that onto its own wire format.
 */

/** Read an SSE body and yield each `data:` payload, skipping the [DONE] marker. */
async function* readSse(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          yield JSON.parse(payload);
        } catch {
          /* a partial or non-JSON frame — the next read will carry the rest */
        }
      }
    }
  }
}

/** Read a newline-delimited JSON body (Ollama's streaming format). */
async function* readNdjson(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed);
      } catch {
        /* ignore a malformed line rather than abort the stream */
      }
    }
  }
}

async function assertOk(response, providerLabel) {
  if (response.ok) return;
  const body = await response.text().catch(() => '');
  const detail = body.slice(0, 400);
  throw new Error(`${providerLabel} respondió ${response.status}${detail ? `: ${detail}` : ''}`);
}

/**
 * Shared adapter for every OpenAI-compatible chat API.
 *
 * Groq, OpenAI and most self-hosted gateways speak this exact protocol, so one
 * implementation covers them all — only the base URL and the key differ.
 */
function openAiCompatible({ id, label, envKey, baseUrl, defaultModel, free, docsUrl, notes }) {
  return {
    id,
    label,
    envKey,
    free,
    docsUrl,
    notes,
    defaultModel,
    baseUrl: (config = {}) => config.baseUrl || baseUrl,

    async listModels({ apiKey, baseUrl: override }) {
      const root = override || baseUrl;
      const res = await fetch(`${root}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      await assertOk(res, label);
      const data = await res.json();
      return (data.data || [])
        .map((model) => ({ id: model.id, label: model.id }))
        .sort((a, b) => a.id.localeCompare(b.id));
    },

    async *stream({ system, messages, model, apiKey, baseUrl: override, maxTokens, signal }) {
      const root = override || baseUrl;
      const res = await fetch(`${root}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: true,
          max_tokens: maxTokens,
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      });
      await assertOk(res, label);

      let usage = null;
      for await (const event of readSse(res)) {
        const text = event.choices?.[0]?.delta?.content;
        if (text) yield { type: 'delta', text };
        if (event.usage) usage = event.usage;
      }

      yield {
        type: 'done',
        usage: usage
          ? { input: usage.prompt_tokens ?? null, output: usage.completion_tokens ?? null }
          : null,
      };
    },
  };
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const PROVIDERS = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    envKey: 'ANTHROPIC_API_KEY',
    free: false,
    docsUrl: 'https://console.anthropic.com/',
    notes: 'De pago. La mejor calidad de las opciones disponibles aquí.',
    defaultModel: 'claude-opus-5',

    async listModels({ apiKey }) {
      const client = new Anthropic({ apiKey });
      const models = [];
      for await (const model of client.models.list()) {
        models.push({ id: model.id, label: model.display_name || model.id });
      }
      return models;
    },

    async *stream({ system, messages, model, apiKey, maxTokens, signal }) {
      const client = new Anthropic({ apiKey });

      const anthropicStream = client.messages.stream(
        {
          model,
          max_tokens: maxTokens,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          // Two blocks so the frozen instructions can carry the cache
          // breakpoint while the retrieved context varies per turn.
          system: [
            { type: 'text', text: system.instructions, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: system.context },
          ],
          messages,
        },
        { signal }
      );

      for await (const event of anthropicStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'delta', text: event.delta.text };
        }
      }

      const final = await anthropicStream.finalMessage();
      yield {
        type: 'done',
        stopReason: final.stop_reason,
        model: final.model,
        usage: {
          input: final.usage?.input_tokens ?? null,
          output: final.usage?.output_tokens ?? null,
          cacheRead: final.usage?.cache_read_input_tokens ?? null,
        },
      };
    },
  },

  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    free: true,
    docsUrl: 'https://aistudio.google.com/apikey',
    notes: 'Tiene un plan gratuito con límites de uso generosos.',
    defaultModel: 'gemini-2.5-flash',

    async listModels({ apiKey, baseUrl }) {
      const root = baseUrl || GEMINI_BASE_URL;
      const res = await fetch(
        `${root}/models?key=${encodeURIComponent(apiKey)}&pageSize=200`
      );
      await assertOk(res, 'Gemini');
      const data = await res.json();

      return (data.models || [])
        .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
        .map((model) => ({
          id: model.name.replace(/^models\//, ''),
          label: model.displayName || model.name.replace(/^models\//, ''),
        }))
        // Embedding and legacy vision models only add noise to the picker.
        .filter((model) => !/embedding|aqa|imagen|veo/i.test(model.id))
        .sort((a, b) => a.id.localeCompare(b.id));
    },

    async *stream({ system, messages, model, apiKey, baseUrl, maxTokens, signal }) {
      const root = baseUrl || GEMINI_BASE_URL;
      const url =
        `${root}/models/${encodeURIComponent(model)}` +
        `:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          // Gemini calls the assistant role "model".
          contents: messages.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }],
          })),
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      });
      await assertOk(res, 'Gemini');

      let usage = null;
      for await (const event of readSse(res)) {
        const parts = event.candidates?.[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.text) yield { type: 'delta', text: part.text };
          }
        }
        if (event.usageMetadata) usage = event.usageMetadata;
      }

      yield {
        type: 'done',
        usage: usage
          ? {
              input: usage.promptTokenCount ?? null,
              output: usage.candidatesTokenCount ?? null,
            }
          : null,
      };
    },
  },

  groq: openAiCompatible({
    id: 'groq',
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    free: true,
    docsUrl: 'https://console.groq.com/keys',
    notes: 'Plan gratuito y respuestas muy rápidas. Modelos abiertos (Llama, Qwen, GPT-OSS).',
  }),

  openai: openAiCompatible({
    id: 'openai',
    label: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    free: false,
    docsUrl: 'https://platform.openai.com/api-keys',
    notes: 'De pago.',
  }),

  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    envKey: null, // runs on your machine; no key involved
    free: true,
    docsUrl: 'https://ollama.com/',
    notes: 'Totalmente local y gratuito. Requiere tener Ollama en marcha y un modelo descargado.',
    defaultModel: 'llama3.2',

    async listModels({ baseUrl }) {
      const root = baseUrl || 'http://127.0.0.1:11434';
      let res;
      try {
        res = await fetch(`${root}/api/tags`);
      } catch {
        // "fetch failed" tells the user nothing; the actual problem is almost
        // always that Ollama is not running.
        throw new Error(`No se pudo contactar con Ollama en ${root}. ¿Está en marcha?`);
      }
      await assertOk(res, 'Ollama');
      const data = await res.json();
      return (data.models || []).map((model) => ({ id: model.name, label: model.name }));
    },

    async *stream({ system, messages, model, baseUrl, signal }) {
      const root = baseUrl || 'http://127.0.0.1:11434';
      const res = await fetch(`${root}/api/chat`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [{ role: 'system', content: system }, ...messages],
        }),
      });
      await assertOk(res, 'Ollama');

      let usage = null;
      for await (const event of readNdjson(res)) {
        const text = event.message?.content;
        if (text) yield { type: 'delta', text };
        if (event.done) {
          usage = {
            input: event.prompt_eval_count ?? null,
            output: event.eval_count ?? null,
          };
        }
      }

      yield { type: 'done', usage };
    },
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

/** Per-provider settings pulled from the environment. */
export function providerConfig(id) {
  const provider = PROVIDERS[id];
  if (!provider) return null;

  const upper = id.toUpperCase();
  const apiKey = provider.envKey ? process.env[provider.envKey] : null;

  return {
    apiKey,
    baseUrl: process.env[`${upper}_BASE_URL`] || null,
    model: process.env[`${upper}_MODEL`] || provider.defaultModel,
  };
}

/** True when the provider has everything it needs to answer. */
export function isConfigured(id) {
  const provider = PROVIDERS[id];
  if (!provider) return false;

  // Ollama needs no key — whether it is actually running is discovered when
  // its models are listed.
  if (!provider.envKey) return true;
  return Boolean(process.env[provider.envKey]);
}

/**
 * The provider to use when the request does not name one.
 * An explicit CHAT_PROVIDER wins; otherwise the first configured one, in the
 * order they are declared above.
 */
export function defaultProviderId() {
  const preferred = (process.env.CHAT_PROVIDER || '').toLowerCase();
  if (preferred && isConfigured(preferred)) return preferred;
  return PROVIDER_IDS.find((id) => id !== 'ollama' && isConfigured(id)) || null;
}

/** Everything the UI needs to render the model picker. */
export function describeProviders() {
  return PROVIDER_IDS.map((id) => {
    const provider = PROVIDERS[id];
    const config = providerConfig(id);
    return {
      id,
      label: provider.label,
      free: provider.free,
      notes: provider.notes,
      docsUrl: provider.docsUrl,
      envKey: provider.envKey,
      configured: isConfigured(id),
      defaultModel: config.model,
      needsKey: Boolean(provider.envKey),
    };
  });
}
