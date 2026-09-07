import { startMock, received } from './mock-providers.mjs';

const PORT = 4701;
const ROOT = `http://127.0.0.1:${PORT}`;
await startMock(PORT);

// Load providers.js with its `@/` import rewritten, and the Anthropic SDK
// stubbed out (it is not the adapter under test here).
const { readFileSync, writeFileSync, mkdtempSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const { pathToFileURL } = await import('node:url');

const dir = mkdtempSync(join(tmpdir(), 'prov-'));
let src = readFileSync(new URL('../src/lib/knowledge/providers.js', import.meta.url), 'utf8');
src = src.replace("import Anthropic from '@anthropic-ai/sdk';", 'const Anthropic = class {};');
writeFileSync(join(dir, 'providers.mjs'), src);
// import() dinámico necesita una URL file://: en Windows una ruta como C:\...
// se interpreta como el protocolo "c:" y falla.
const { getProvider, defaultProviderId, preferredProviderIds, unknownPreferredProviders } =
  await import(pathToFileURL(join(dir, 'providers.mjs')).href);

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

async function collect(iterator) {
  let text = '';
  let done = null;
  for await (const event of iterator) {
    if (event.type === 'delta') text += event.text;
    if (event.type === 'done') done = event;
  }
  return { text, done };
}

const messages = [{ role: 'user', content: '¿Qué acordamos?' }];
const system = 'Eres el asistente de ProjectNotes.';

// ---------------------------------------------------------------- Groq
console.log('\nGroq / OpenAI-compatible');
{
  const groq = getProvider('groq');
  const models = await groq.listModels({ apiKey: 'k', baseUrl: ROOT });
  check('lists models', models.length === 2 && models[0].id === 'a-model', JSON.stringify(models));

  const { text, done } = await collect(
    groq.stream({ system, messages, model: 'llama-3.3-70b-versatile', apiKey: 'k', baseUrl: ROOT, maxTokens: 100 })
  );
  check('streams the full answer', text === 'Según tus notas [1].', JSON.stringify(text));
  check('reports usage', done.usage?.input === 120 && done.usage?.output === 8, JSON.stringify(done.usage));

  const call = received.find((r) => r.path.endsWith('/chat/completions'));
  check('sends a bearer token', call.auth === 'Bearer k', call.auth);
  check('prepends the system message', call.body.messages[0].role === 'system');
  check('keeps the user turn', call.body.messages[1].content === '¿Qué acordamos?');
  check('requests streaming', call.body.stream === true);
}

// ---------------------------------------------------------------- Gemini
console.log('\nGemini');
{
  const gemini = getProvider('gemini');
  const models = await gemini.listModels({ apiKey: 'gk', baseUrl: ROOT });
  check('drops embedding models, keeps conversational ones',
    models.length === 2 && models.some((m) => m.id === 'gemini-2.5-flash') &&
      !models.some((m) => m.id.includes('embedding')),
    JSON.stringify(models));

  const { text, done } = await collect(
    gemini.stream({
      system,
      messages: [...messages, { role: 'assistant', content: 'Antes dije esto.' }],
      model: 'gemini-2.5-flash',
      apiKey: 'gk',
      baseUrl: ROOT,
      maxTokens: 100,
    })
  );
  check('streams the full answer', text === 'Hola desde Gemini [2].', JSON.stringify(text));
  check('reports usage', done.usage?.input === 90 && done.usage?.output === 6, JSON.stringify(done.usage));

  const call = received.find((r) => r.path.includes(':streamGenerateContent'));
  check('passes the key as a query param', call.query.key === 'gk');
  check('asks for SSE framing', call.query.alt === 'sse');
  check('sends the system instruction', call.body.systemInstruction.parts[0].text === system);
  check('maps assistant → model role',
    call.body.contents[1].role === 'model', JSON.stringify(call.body.contents.map((c) => c.role)));
  check('leaves room for thinking on top of the answer',
    call.body.generationConfig.maxOutputTokens >= 8192,
    String(call.body.generationConfig.maxOutputTokens));
}

// --------------------------------------------- Gemini: the reported failures
console.log('\nGemini — fallos que reportó el usuario');
{
  const gemini = getProvider('gemini');

  // 1. The catalogue lists models that 404 for new accounts, naming the
  //    replacement in the error prose.
  const events = [];
  let text = '';
  for await (const event of gemini.stream({
    system, messages, model: 'gemini-retired', apiKey: 'gk', baseUrl: ROOT, maxTokens: 100,
  })) {
    events.push(event);
    if (event.type === 'delta') text += event.text;
  }

  const notice = events.find((e) => e.type === 'notice');
  check('a retired model does not just fail', text === 'Respuesta del sustituto.', JSON.stringify(text));
  check('it retries with the replacement Google names',
    notice?.text.includes('gemini-replacement'), notice?.text);
  check('it says which model actually answered',
    events.find((e) => e.type === 'done')?.model === 'gemini-replacement');

  // 2. A thinking model that spends the whole budget reasoning returns 200
  //    with no text. Silence looks like a broken app; it must say why.
  let thinkerError = '';
  try {
    for await (const _ of gemini.stream({
      system, messages, model: 'gemini-thinker', apiKey: 'gk', baseUrl: ROOT, maxTokens: 100,
    })) { /* drain */ }
  } catch (e) {
    thinkerError = e.message;
  }
  check('an empty answer explains itself instead of staying silent',
    /razonando|presupuesto/.test(thinkerError), thinkerError);
  check('and reports the thinking tokens that ate the budget',
    thinkerError.includes('4000'), thinkerError);

  // 3. Reasoning must never be presented as the answer.
  check('thinking parts are not shown as the answer', !thinkerError.includes('razonando…'));

  // 4. A safety block also returns 200 with nothing.
  let blockedError = '';
  try {
    for await (const _ of gemini.stream({
      system, messages, model: 'gemini-blocked', apiKey: 'gk', baseUrl: ROOT, maxTokens: 100,
    })) { /* drain */ }
  } catch (e) {
    blockedError = e.message;
  }
  check('a blocked prompt says so', /bloqueó|SAFETY/.test(blockedError), blockedError);

  // 5. Deprecated entries should not reach the picker at all.
  const models = await gemini.listModels({ apiKey: 'gk', baseUrl: ROOT });
  check('the picker hides models flagged deprecated',
    !models.some((m) => m.id.includes('legacy')), JSON.stringify(models.map((m) => m.id)));
}

// ---------------------------------------------------------------- Ollama
console.log('\nOllama');
{
  const ollama = getProvider('ollama');
  const models = await ollama.listModels({ baseUrl: ROOT });
  check('lists local models', models[0]?.id === 'llama3.2:latest', JSON.stringify(models));

  const { text, done } = await collect(
    ollama.stream({ system, messages, model: 'llama3.2', baseUrl: ROOT })
  );
  check('parses newline-delimited JSON', text === 'Respuesta local [3].', JSON.stringify(text));
  check('reports usage', done.usage?.input === 50 && done.usage?.output === 4, JSON.stringify(done.usage));

  let message = '';
  try {
    await ollama.listModels({ baseUrl: 'http://127.0.0.1:9' });
  } catch (e) {
    message = e.message;
  }
  check('explains a down Ollama in plain language', /Ollama|marcha/.test(message), message);
}

// ---------------------------------------------------------------- errors
console.log('\nError handling');
{
  const groq = getProvider('groq');
  let message = '';
  try {
    await collect(groq.stream({ system, messages, model: 'x', apiKey: 'bad', baseUrl: `${ROOT}/boom`, maxTokens: 10 }));
  } catch (e) {
    message = e.message;
  }
  check('surfaces the provider status and body',
    message.includes('401') && message.includes('Invalid API key'), message);
}

// ---------------------------------------------------------------- abort
console.log('\nCancellation');
{
  const groq = getProvider('groq');
  const controller = new AbortController();
  controller.abort();
  let name = '';
  try {
    await collect(groq.stream({ system, messages, model: 'x', apiKey: 'k', baseUrl: ROOT, maxTokens: 10, signal: controller.signal }));
  } catch (e) {
    name = e.name;
  }
  check('an aborted request rejects with AbortError', name === 'AbortError', name);
}

// ------------------------------------------------- CHAT_PROVIDER
console.log('\nCHAT_PROVIDER');
{
  const original = { ...process.env };
  const reset = () => {
    for (const key of ['CHAT_PROVIDER', 'GEMINI_API_KEY', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY']) {
      delete process.env[key];
    }
  };

  reset();
  process.env.CHAT_PROVIDER = 'groq';
  process.env.GROQ_API_KEY = 'k';
  check('un solo proveedor', defaultProviderId() === 'groq');

  // Lo que escribió el usuario: una lista, con mayúscula y espacios.
  reset();
  process.env.CHAT_PROVIDER = 'Gemini, groq, ollama';
  process.env.GEMINI_API_KEY = 'k';
  check('acepta una lista de preferencias', defaultProviderId() === 'gemini');
  check('no distingue mayúsculas',
    preferredProviderIds()[0] === 'gemini', JSON.stringify(preferredProviderIds()));

  // Si el primero de la lista no está configurado, pasa al siguiente.
  reset();
  process.env.CHAT_PROVIDER = 'Gemini, groq';
  process.env.GROQ_API_KEY = 'k';
  check('salta al siguiente si el primero no está configurado',
    defaultProviderId() === 'groq', defaultProviderId());

  reset();
  process.env.CHAT_PROVIDER = 'inventado, groq';
  process.env.GROQ_API_KEY = 'k';
  check('ignora entradas desconocidas', defaultProviderId() === 'groq');
  check('pero las reporta para poder avisar',
    unknownPreferredProviders().includes('inventado'),
    JSON.stringify(unknownPreferredProviders()));

  reset();
  process.env.GEMINI_API_KEY = 'k';
  check('sin CHAT_PROVIDER usa el primero configurado', defaultProviderId() === 'gemini');

  reset();
  check('sin nada configurado devuelve null', defaultProviderId() === null);

  reset();
  Object.assign(process.env, original);
}

console.log();
if (failures.length) {
  console.log(`❌ ${failures.length} fallo(s): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('✅ Todos los adaptadores se comportan como deben.');
process.exit(0);
