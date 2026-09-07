#!/usr/bin/env node
/**
 * Comprueba, contra las APIs reales, qué proveedores de chat funcionan.
 *
 * Para cada uno configurado: lista sus modelos, manda una pregunta mínima y
 * cuenta lo que devuelve. Sirve para saber qué modelos sirven de verdad, sin
 * tener que ir probándolos uno a uno desde la interfaz.
 *
 *   npm run doctor              # todos los proveedores configurados
 *   npm run doctor -- gemini    # solo uno
 *   npm run doctor -- gemini --all   # prueba TODOS sus modelos, no una muestra
 *
 * Las claves se leen de .env.local (o .env). Nunca se imprimen.
 */

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEnvFiles } from './lib/load-env.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const envFiles = loadEnvFiles(ROOT);

// --- carga del registro de proveedores sin pasar por Next ------------------

// El registro vive fuera de node_modules una vez copiado, así que hay que
// reescribir el import del SDK a su ruta ya resuelta. Si no se puede resolver
// (dependencias sin instalar), se sustituye por un stub: quien use Gemini,
// Groq u Ollama no lo necesita, y el diagnóstico debe seguir siendo útil.
const dir = mkdtempSync(join(tmpdir(), 'doctor-'));

let anthropicImport = 'const Anthropic = class {};';
try {
  // JSON.stringify y no comillas simples: una ruta puede llevar caracteres
  // que rompan el literal (en Windows es fácil que tenga espacios).
  anthropicImport = `import Anthropic from ${JSON.stringify(await import.meta.resolve('@anthropic-ai/sdk'))};`;
} catch {
  /* sin SDK: Anthropic quedará como no disponible, el resto funciona */
}

const source = readFileSync(join(ROOT, 'src/lib/knowledge/providers.js'), 'utf8').replace(
  "import Anthropic from '@anthropic-ai/sdk';",
  anthropicImport
);
writeFileSync(join(dir, 'providers.mjs'), source);
// import() dinámico necesita una URL file://: en Windows una ruta como
// C:\... se interpreta como el protocolo "c:" y falla.
const {
  PROVIDER_IDS,
  getProvider,
  isConfigured,
  providerConfig,
  defaultProviderId,
  unknownPreferredProviders,
} = await import(pathToFileURL(join(dir, 'providers.mjs')).href);

// --- utilidades ------------------------------------------------------------

const args = process.argv.slice(2);
const testAll = args.includes('--all');

// --raw <proveedor> <modelo>: manda una petición y vuelca la respuesta tal cual.
// Es lo que hace falta cuando un modelo devuelve 200 sin texto y no se sabe por
// qué: el volcado dice si el problema es el parseo o el propio modelo.
const rawIndex = args.indexOf('--raw');
const rawMode = rawIndex !== -1;
const positional = args.filter((a) => !a.startsWith('--'));
const only = rawMode ? positional.slice(0, 1) : positional;

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const GREEN = color ? '\x1b[32m' : '';
const RED = color ? '\x1b[31m' : '';
const YELLOW = color ? '\x1b[33m' : '';
const DIM = color ? '\x1b[2m' : '';
const RESET = color ? '\x1b[0m' : '';

const PROMPT = 'Responde únicamente con la palabra: listo';
const TIMEOUT_MS = 45_000;

async function tryModel(provider, config, modelId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();

  let text = '';
  const notices = [];

  try {
    for await (const event of provider.stream({
      system: 'Eres un asistente de prueba. Sé extremadamente breve.',
      messages: [{ role: 'user', content: PROMPT }],
      model: modelId,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      maxTokens: 256,
      signal: controller.signal,
    })) {
      if (event.type === 'delta') text += event.text;
      if (event.type === 'notice') notices.push(event.text);
    }
    return { ok: true, ms: Date.now() - started, text: text.trim(), notices };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: error.message, notices };
  } finally {
    clearTimeout(timer);
  }
}

// --- volcado en crudo ------------------------------------------------------

if (rawMode) {
  const [providerId, modelId] = positional;

  if (!providerId || !modelId) {
    console.log('Uso: npm run doctor -- --raw <proveedor> <modelo>');
    process.exit(1);
  }
  if (!isConfigured(providerId)) {
    console.log(`${RED}${providerId} no está configurado.${RESET}`);
    process.exit(1);
  }

  const config = providerConfig(providerId);
  console.log(`Volcando la respuesta cruda de ${providerId} / ${modelId}…\n`);

  if (providerId === 'gemini') {
    const root = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const res = await fetch(
      `${root}/models/${encodeURIComponent(modelId)}:streamGenerateContent` +
        `?alt=sse&key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'Sé breve.' }] },
          contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
          generationConfig: { maxOutputTokens: 8192 },
        }),
      }
    );

    console.log(`HTTP ${res.status} ${res.statusText}`);
    console.log(`content-type: ${res.headers.get('content-type')}\n`);
    console.log(await res.text());
  } else {
    const provider = getProvider(providerId);
    if (!provider) {
      console.log(`${RED}Proveedor desconocido: ${providerId}${RESET}`);
      process.exit(1);
    }
    for await (const event of provider.stream({
      system: 'Sé breve.',
      messages: [{ role: 'user', content: PROMPT }],
      model: modelId,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      maxTokens: 256,
    })) {
      console.log(JSON.stringify(event));
    }
  }

  console.log(`\n${DIM}Pega esta salida (sin la clave, no aparece) para diagnosticar.${RESET}`);
  process.exit(0);
}

// --- ejecución -------------------------------------------------------------

if (envFiles.length) {
  for (const { file, keys, applied } of envFiles) {
    console.log(`${DIM}${file}: ${keys.length} variables, ${applied} aplicadas${RESET}`);
  }
} else {
  console.log(`${YELLOW}No se encontró ningún .env.local ni .env en ${ROOT}${RESET}`);
}

const unknown = unknownPreferredProviders();
if (unknown.length) {
  console.log(
    `${YELLOW}CHAT_PROVIDER menciona ${unknown.map((u) => `«${u}»`).join(', ')}, ` +
      `que no corresponde a ningún proveedor. Válidos: ${PROVIDER_IDS.join(', ')}.${RESET}`
  );
}

const active = defaultProviderId();
console.log(`${DIM}Proveedor por defecto: ${active || 'ninguno'}${RESET}`);

const targets = PROVIDER_IDS.filter((id) => (only.length ? only.includes(id) : true));
let anyConfigured = false;

for (const id of targets) {
  const provider = getProvider(id);

  if (!isConfigured(id)) {
    console.log(`\n${DIM}○ ${provider.label} — sin configurar (${provider.envKey})${RESET}`);
    continue;
  }

  anyConfigured = true;
  console.log(`\n${'─'.repeat(64)}\n${provider.label}\n${'─'.repeat(64)}`);

  const config = providerConfig(id);

  let models;
  try {
    models = await provider.listModels({ apiKey: config.apiKey, baseUrl: config.baseUrl });
  } catch (error) {
    console.log(`${RED}✗ No se pudo listar los modelos:${RESET} ${error.message}`);
    continue;
  }

  console.log(`${models.length} modelos en el catálogo. Por defecto: ${config.model}`);

  // Sin --all se prueba una muestra: el configurado por defecto y unos pocos
  // más, para no gastar cuota comprobando catálogos de cincuenta modelos.
  //
  // El configurado se prueba siempre, aunque no esté en el catálogo: si lo han
  // retirado, esa es justo la comprobación que hace falta.
  const configured = models.find((m) => m.id === config.model) || { id: config.model };
  const rest = models.filter((m) => m.id !== config.model);

  // Repartir la muestra por todo el catálogo en vez de coger los cinco
  // primeros: alfabéticamente suelen ser vecinos de la misma familia, y no
  // dicen nada del resto.
  const spread = [];
  const step = Math.max(1, Math.floor(rest.length / 5));
  for (let i = 0; i < rest.length && spread.length < 5; i += step) spread.push(rest[i]);

  const sample = testAll
    ? [...models, ...(models.some((m) => m.id === config.model) ? [] : [configured])]
    : [configured, ...spread];

  console.log(`Probando ${sample.length}${testAll ? '' : ' (usa --all para todos)'}…\n`);

  const working = [];
  const broken = [];

  for (const model of sample) {
    process.stdout.write(`  ${model.id.padEnd(42)} `);
    const result = await tryModel(provider, config, model.id);

    if (result.ok) {
      working.push(model.id);
      const preview = result.text.replace(/\s+/g, ' ').slice(0, 40) || '(vacío)';
      console.log(`${GREEN}✓${RESET} ${result.ms}ms  ${DIM}«${preview}»${RESET}`);
    } else {
      broken.push({ id: model.id, error: result.error });
      console.log(`${RED}✗${RESET} ${result.error.replace(/\s+/g, ' ').slice(0, 150)}`);
    }

    for (const notice of result.notices) console.log(`      ${YELLOW}↪ ${notice}${RESET}`);
  }

  console.log(`\n  ${GREEN}${working.length} funcionan${RESET} · ${RED}${broken.length} fallan${RESET}`);

  if (working.length) {
    console.log(`\n  Para fijar uno como predeterminado, en .env.local:`);
    console.log(`    ${id.toUpperCase()}_MODEL=${working[0]}`);
    console.log(`    CHAT_PROVIDER=${id}`);
  } else if (!testAll && models.length > sample.length) {
    console.log(
      `\n  ${YELLOW}Ninguno de la muestra funciona.${RESET} Prueba el catálogo entero:\n` +
        `    npm run doctor -- ${id} --all`
    );
  }

  const mute = broken.find((b) => /sin texto|no envió nada/.test(b.error));
  if (mute) {
    console.log(
      `\n  Para ver en crudo qué devuelve «${mute.id}»:\n` +
        `    npm run doctor -- --raw ${id} ${mute.id}`
    );
  }
}

if (!anyConfigured) {
  console.log(
    `\n${YELLOW}Ningún proveedor configurado.${RESET} Copia .env.example a .env.local y añade una clave.\n` +
      'Gemini y Groq tienen plan gratuito.'
  );
  process.exit(1);
}

console.log();
