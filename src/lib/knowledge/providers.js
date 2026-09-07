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
      let produced = false;
      let finishReason = null;

      for await (const event of readSse(res)) {
        const text = event.choices?.[0]?.delta?.content;
        if (text) {
          produced = true;
          yield { type: 'delta', text };
        }
        if (event.choices?.[0]?.finish_reason) finishReason = event.choices[0].finish_reason;
        if (event.usage) usage = event.usage;
      }

      // An empty answer with no error looks like a broken app; say what happened.
      if (!produced) {
        throw new Error(
          finishReason === 'length'
            ? `«${model}» se quedó sin presupuesto de salida antes de escribir nada.`
            : `«${model}» no devolvió ninguna respuesta${finishReason ? ` (${finishReason})` : ''}. Prueba con otro modelo.`
        );
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

// Floor for Gemini's output budget. Thinking tokens are drawn from the same
// allowance as the answer, so a budget sized only for the answer can be spent
// entirely on reasoning, leaving nothing to return.
const GEMINI_MIN_OUTPUT_TOKENS = 8192;

/** Explain, in the user's terms, why Gemini returned no text. */
function geminiEmptyAnswerReason({ finishReason, blockReason, usage, model }) {
  if (blockReason) {
    return `Gemini bloqueó la petición (${blockReason}). Reformula la pregunta.`;
  }

  if (finishReason === 'MAX_TOKENS') {
    const thinking = usage?.thoughtsTokenCount;
    return (
      `«${model}» agotó su presupuesto de salida razonando` +
      (thinking ? ` (${thinking} tokens de razonamiento)` : '') +
      ' y no llegó a escribir la respuesta. Prueba con un modelo «flash» o reduce el número de fragmentos recuperados.'
    );
  }

  if (finishReason && finishReason !== 'STOP') {
    return `Gemini terminó sin respuesta (${finishReason}).`;
  }

  return `«${model}» no devolvió ninguna respuesta. Prueba con otro modelo.`;
}

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
        // The catalogue still lists retired models; when the description says
        // so, keep them out of the picker. The ones it does not flag are
        // caught at call time, where Google names the replacement.
        .filter((model) => !/deprecat|discontinued|retired/i.test(model.description || ''))
        .map((model) => ({
          id: model.name.replace(/^models\//, ''),
          label: model.displayName || model.name.replace(/^models\//, ''),
        }))
        // Embedding and media-generation models cannot hold a conversation.
        .filter((model) => !/embedding|aqa|imagen|veo/i.test(model.id))
        .sort((a, b) => a.id.localeCompare(b.id));
    },

    async *stream({ system, messages, model, apiKey, baseUrl, maxTokens, signal }) {
      const root = baseUrl || GEMINI_BASE_URL;

      const request = {
        systemInstruction: { parts: [{ text: system }] },
        // Gemini calls the assistant role "model".
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        generationConfig: {
          // Gemini 2.5 and later think before answering, and those thinking
          // tokens come out of maxOutputTokens. With a tight budget the model
          // can spend the lot reasoning and return no text at all — an empty
          // answer with no error. Give it room for both.
          maxOutputTokens: Math.max(maxTokens * 2, GEMINI_MIN_OUTPUT_TOKENS),
        },
      };

      const call = (modelId) =>
        fetch(
          `${root}/models/${encodeURIComponent(modelId)}` +
            `:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
          }
        );

      let effectiveModel = model;
      let res = await call(effectiveModel);

      // Google keeps retired models in the catalogue but refuses them for new
      // accounts, naming the replacement in the error prose. Take it up.
      if (res.status === 404) {
        const detail = await res.text().catch(() => '');
        const replacement = detail.match(/models\/([\w.-]+)\s+for the latest/)?.[1];

        if (replacement && replacement !== effectiveModel) {
          yield {
            type: 'notice',
            text: `El modelo «${effectiveModel}» ya no está disponible para cuentas nuevas. Se ha usado «${replacement}» en su lugar.`,
          };
          effectiveModel = replacement;
          res = await call(effectiveModel);
        } else {
          throw new Error(`Gemini respondió 404${detail ? `: ${detail.slice(0, 400)}` : ''}`);
        }
      }

      await assertOk(res, 'Gemini');

      let usage = null;
      let finishReason = null;
      let blockReason = null;
      let produced = false;

      for await (const event of readSse(res)) {
        const candidate = event.candidates?.[0];

        for (const part of candidate?.content?.parts || []) {
          // Reasoning parts are not the answer; never show them as one.
          if (part.thought) continue;
          if (part.text) {
            produced = true;
            yield { type: 'delta', text: part.text };
          }
        }

        if (candidate?.finishReason) finishReason = candidate.finishReason;
        if (event.promptFeedback?.blockReason) blockReason = event.promptFeedback.blockReason;
        if (event.usageMetadata) usage = event.usageMetadata;
      }

      // A silent empty answer is the worst outcome: it looks like the app is
      // broken. Say what actually happened.
      if (!produced) {
        throw new Error(geminiEmptyAnswerReason({ finishReason, blockReason, usage, model: effectiveModel }));
      }

      yield {
        type: 'done',
        model: effectiveModel,
        usage: usage
          ? {
              input: usage.promptTokenCount ?? null,
              output: usage.candidatesTokenCount ?? null,
              thinking: usage.thoughtsTokenCount ?? null,
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
      let produced = false;

      for await (const event of readNdjson(res)) {
        const text = event.message?.content;
        if (text) {
          produced = true;
          yield { type: 'delta', text };
        }
        if (event.done) {
          usage = {
            input: event.prompt_eval_count ?? null,
            output: event.eval_count ?? null,
          };
        }
      }

      if (!produced) {
        throw new Error(`«${model}» no devolvió ninguna respuesta. ¿Está descargado el modelo?`);
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
