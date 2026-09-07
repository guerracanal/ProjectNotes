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

import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// --- carga de .env ---------------------------------------------------------

for (const file of ['.env.local', '.env']) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }
}

// --- carga del registro de proveedores sin pasar por Next ------------------

// El registro usa el alias `@/` de Next y vive fuera de node_modules una vez
// copiado, así que se reescribe el import del SDK a su ruta ya resuelta.
const dir = mkdtempSync(join(tmpdir(), 'doctor-'));
const anthropicUrl = await import.meta.resolve('@anthropic-ai/sdk');
const source = readFileSync(join(ROOT, 'src/lib/knowledge/providers.js'), 'utf8').replace(
  "from '@anthropic-ai/sdk'",
  `from '${anthropicUrl}'`
);
writeFileSync(join(dir, 'providers.mjs'), source);
const { PROVIDER_IDS, getProvider, isConfigured, providerConfig } = await import(
  join(dir, 'providers.mjs')
);

// --- utilidades ------------------------------------------------------------

const args = process.argv.slice(2);
const testAll = args.includes('--all');
const only = args.filter((a) => !a.startsWith('--'));

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

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

// --- ejecución -------------------------------------------------------------

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
  const sample = testAll
    ? [...models, ...(models.some((m) => m.id === config.model) ? [] : [configured])]
    : [configured, ...models.filter((m) => m.id !== config.model).slice(0, 5)];

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
      console.log(`${RED}✗${RESET} ${result.error.split('\n')[0].slice(0, 90)}`);
    }

    for (const notice of result.notices) console.log(`      ${YELLOW}↪ ${notice}${RESET}`);
  }

  console.log(`\n  ${GREEN}${working.length} funcionan${RESET} · ${RED}${broken.length} fallan${RESET}`);

  if (working.length) {
    console.log(`\n  Para fijar uno como predeterminado, en .env.local:`);
    console.log(`    ${id.toUpperCase()}_MODEL=${working[0]}`);
    console.log(`    CHAT_PROVIDER=${id}`);
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
