/**
 * Mock servers speaking each provider's wire protocol, so the adapters can be
 * exercised without real API keys. Verifies request shape and stream parsing —
 * the two places these adapters can be wrong.
 */
import http from 'node:http';

export const received = [];

function body(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

function sse(res, frames) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const frame of frames) res.write(`data: ${JSON.stringify(frame)}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

export function startMock(port) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const raw = req.method === 'POST' ? await body(req) : null;
    received.push({
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      auth: req.headers.authorization || null,
      body: raw ? JSON.parse(raw) : null,
    });

    // --- error path (checked first: /boom/chat/completions also ends with
    // /chat/completions, so the generic route below would swallow it) ---
    if (url.pathname === '/boom/chat/completions') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
      return;
    }

    // --- OpenAI-compatible (Groq, OpenAI) ---
    if (url.pathname.endsWith('/models') && req.method === 'GET' && !url.searchParams.get('key')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'a-model' }] }));
      return;
    }
    if (url.pathname.endsWith('/chat/completions')) {
      // Deliberately split a word across frames: the reader must not lose it.
      sse(res, [
        { choices: [{ delta: { content: 'Según ' } }] },
        { choices: [{ delta: { content: 'tus notas' } }] },
        { choices: [{ delta: { content: ' [1].' } }] },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 120, completion_tokens: 8 } },
      ]);
      return;
    }

    // --- Gemini ---
    if (url.pathname.endsWith('/models') && url.searchParams.get('key')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        models: [
          { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', displayName: 'Embeddings', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-pro-vision', displayName: 'Vision', supportedGenerationMethods: ['generateContent'] },
          {
            name: 'models/gemini-1.0-pro-legacy',
            displayName: 'Legacy Pro',
            description: 'Deprecated: use a newer model instead.',
            supportedGenerationMethods: ['generateContent'],
          },
        ],
      }));
      return;
    }

    // Retired model: Google answers 404 and names its replacement in prose.
    if (url.pathname.includes('gemini-retired:streamGenerateContent')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: {
          code: 404,
          message:
            'This model models/gemini-retired is no longer available to new users. ' +
            'Please update your code to use models/gemini-replacement for the latest features and improvements.',
          status: 'NOT_FOUND',
        },
      }));
      return;
    }

    // The replacement answers normally.
    if (url.pathname.includes('gemini-replacement:streamGenerateContent')) {
      sse(res, [
        { candidates: [{ content: { parts: [{ text: 'Respuesta del sustituto.' }] } }] },
      ]);
      return;
    }

    // A thinking model that spent the whole output budget reasoning: HTTP 200,
    // no text at all, and finishReason MAX_TOKENS. This is the "no error but
    // no answer" case.
    if (url.pathname.includes('gemini-thinker:streamGenerateContent')) {
      sse(res, [
        {
          candidates: [{ content: { parts: [{ thought: true, text: 'razonando…' }] }, finishReason: 'MAX_TOKENS' }],
          usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 0, thoughtsTokenCount: 4000 },
        },
      ]);
      return;
    }

    // 200 with an entirely empty stream: no frames at all.
    if (url.pathname.includes('gemini-silent:streamGenerateContent')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end();
      return;
    }

    // An error delivered inside the stream rather than as an HTTP status.
    if (url.pathname.includes('gemini-inline-error:streamGenerateContent')) {
      sse(res, [{ error: { code: 400, message: 'Modelo no admitido en este endpoint' } }]);
      return;
    }

    // Prompt refused by the safety filters: 200, no candidates at all.
    if (url.pathname.includes('gemini-blocked:streamGenerateContent')) {
      sse(res, [{ promptFeedback: { blockReason: 'SAFETY' } }]);
      return;
    }
    if (url.pathname.includes(':streamGenerateContent')) {
      sse(res, [
        { candidates: [{ content: { parts: [{ text: 'Hola ' }] } }] },
        { candidates: [{ content: { parts: [{ text: 'desde Gemini' }] } }] },
        { candidates: [{ content: { parts: [{ text: ' [2].' }] } }], usageMetadata: { promptTokenCount: 90, candidatesTokenCount: 6 } },
      ]);
      return;
    }

    // --- Ollama (newline-delimited JSON) ---
    if (url.pathname === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }));
      return;
    }
    if (url.pathname === '/api/chat') {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.write(JSON.stringify({ message: { content: 'Respuesta ' } }) + '\n');
      res.write(JSON.stringify({ message: { content: 'local' } }) + '\n');
      res.write(JSON.stringify({ message: { content: ' [3].' }, done: true, prompt_eval_count: 50, eval_count: 4 }) + '\n');
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
