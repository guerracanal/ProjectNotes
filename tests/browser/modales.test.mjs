/**
 * Los modales con campos de texto: ¿se puede escribir en ellos?
 *
 * Modal.js es compartido, así que el fallo del foco afectaba a todos por igual.
 * Aquí se recorren los que tienen entrada de texto y se comprueba lo mismo en
 * cada uno: el foco arranca en el campo, se queda ahí al teclear, y el texto
 * llega entero. Se comprueba también que Escape sigue cerrando.
 */
import { chromium } from 'playwright';
import { launchOptions, BASE_URL, PROJECT_DIR } from './helpers.mjs';

const BASE = BASE_URL;
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const fallos = [];
const check = (label, ok, detalle = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detalle ? '' : `  — ${detalle}`}`);
  if (!ok) fallos.push(label);
};
const foco = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return 'ninguno';
    const etiqueta = el.getAttribute('aria-label');
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${etiqueta ? `[${etiqueta}]` : ''}`;
  });

/** Abre un modal, teclea en su primer campo y comprueba dónde acabó el foco. */
async function probar(nombre, abrir, selectorCampo, texto) {
  console.log(`\n${nombre}`);
  await abrir();
  await page.waitForSelector(selectorCampo, { timeout: 8000 });
  await page.waitForTimeout(350);

  const inicial = await foco();
  check('el foco arranca en el campo', inicial.startsWith('input') || inicial.startsWith('textarea'), inicial);

  await page.locator(selectorCampo).first().click();
  for (const c of texto) await page.keyboard.type(c, { delay: 45 });

  const final = await foco();
  const valor = await page.locator(selectorCampo).first().inputValue();
  check('el foco no se escapa al teclear', final === inicial || final.startsWith('input'), final);
  check('el texto llega entero', valor.endsWith(texto), JSON.stringify(valor));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape cierra el modal', (await page.locator(selectorCampo).count()) === 0);
}

await page.goto(`${BASE_URL}/project/Proyecto_Ejemplo`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

await probar(
  'Nueva nota',
  async () => {
    await page.locator('button.tab', { hasText: /^Notas/ }).click();
    await page.waitForTimeout(500);
    await page.locator('button', { hasText: /^Nueva( nota)?$/ }).first().click();
  },
  '#new-note-name',
  'ideas'
);

await probar(
  'Nuevo proyecto',
  async () => {
    await page.locator('button', { hasText: /^Nuevo proyecto$/ }).first().click();
  },
  '.modal-body input[type="text"], .modal-body input:not([type])',
  'Prueba'
);

await probar(
  'Tu perfil',
  async () => {
    await page.locator('button', { hasText: /^Tu perfil$/ }).first().click();
  },
  '.modal-body input[type="text"], .modal-body input:not([type])',
  'Jorge'
);

// El caso que de verdad separa los dos fallos: un modal con DOS campos.
// Enfocar bien el primero no basta — si el efecto se reejecuta en cada tecla,
// el foco vuelve al campo uno en cuanto se escribe en el dos.
console.log('\nTu perfil — segundo campo');
await page.locator('button', { hasText: /^Tu perfil$/ }).first().click();
await page.waitForSelector('#profile-aliases', { timeout: 8000 });
await page.waitForTimeout(350);

await page.locator('#profile-aliases').click();
for (const c of 'Guerra') await page.keyboard.type(c, { delay: 45 });

const focoAlias = await foco();
const valorAlias = await page.locator('#profile-aliases').inputValue();
const valorNombre = await page.locator('#profile-name').inputValue();

check('el foco se queda en el segundo campo', focoAlias === 'input#profile-aliases', focoAlias);
check('el texto entra en el segundo campo', valorAlias.endsWith('Guerra'), JSON.stringify(valorAlias));
check('no se ha colado en el primero', !valorNombre.includes('Guerra'), JSON.stringify(valorNombre));

await page.keyboard.press('Escape');
await page.waitForTimeout(300);

await browser.close();
console.log(fallos.length ? `\n✗ ${fallos.length} fallo(s): ${fallos.join(', ')}` : '\n✓ todos los modales dejan escribir');
process.exit(fallos.length ? 1 : 0);
