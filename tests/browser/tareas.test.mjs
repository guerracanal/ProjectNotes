/**
 * Añadir una tarea debe escribirla en disco sin pulsar nada más.
 *
 * Además del caso feliz, comprueba lo que rompía el diseño anterior: guardar
 * dos veces seguidas. `serializeTasks` añade al final toda tarea sin número de
 * línea, así que si tras guardar no se vuelve a parsear el fichero, la tarea
 * recién creada se escribe otra vez y sale duplicada.
 */
import { chromium } from 'playwright';
import { launchOptions, BASE_URL, PROJECT_DIR } from './helpers.mjs';
import { readFileSync } from 'node:fs';

const TASKS = `${PROJECT_DIR}/tasks.md`;
const disco = () => readFileSync(TASKS, 'utf8');
const cuenta = (texto) => (disco().match(new RegExp(texto, 'g')) || []).length;

const fallos = [];
const check = (label, ok, detalle = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || !detalle ? '' : `  — ${detalle}`}`);
  if (!ok) fallos.push(label);
};

const b = await chromium.launch(launchOptions());
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto(`${BASE_URL}/project/Proyecto_Ejemplo`, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.locator('button.tab', { hasText: /^Tareas/ }).click();
await p.waitForSelector('input[aria-label="Nueva tarea"]');
await p.waitForTimeout(400);

console.log('\nAñadir sin pulsar Guardar');
await p.locator('input[aria-label="Nueva tarea"]').fill('Revisar el zarambeque');
await p.locator('button', { hasText: /^Añadir$/ }).click();
await p.waitForTimeout(1500);

check('la tarea está en tasks.md', disco().includes('Revisar el zarambeque'), 'no aparece en disco');
check('sale una sola vez', cuenta('Revisar el zarambeque') === 1, `${cuenta('Revisar el zarambeque')} veces`);
check('el botón dice Guardado', (await p.locator('button', { hasText: /Guardado|Reintentar|Guardando/ }).first().textContent()).includes('Guardado'));

console.log('\nSegundo cambio: marcarla como hecha');
await p.locator('li', { hasText: 'Revisar el zarambeque' }).locator('input[type="checkbox"], button').first().click();
await p.waitForTimeout(1500);

check('sigue apareciendo una sola vez', cuenta('Revisar el zarambeque') === 1, `${cuenta('Revisar el zarambeque')} veces`);
check('queda marcada en el fichero', /- \[x\] Revisar el zarambeque/.test(disco()), disco().split('\n').filter((l) => l.includes('zarambeque')).join(' | '));

console.log('\nRecargar: lo que se ve viene del disco');
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.locator('button.tab', { hasText: /^Tareas/ }).click();
await p.waitForTimeout(600);
check('la tarea sobrevive a la recarga', await p.locator('text=Revisar el zarambeque').first().isVisible());

await b.close();
console.log('\n' + (fallos.length ? `✗ ${fallos.length} fallo(s): ${fallos.join(', ')}` : '✓ se guarda solo'));
process.exit(fallos.length ? 1 : 0);
