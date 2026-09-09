# Pruebas de navegador

Cubren cosas que solo se rompen en un navegador de verdad: el foco dentro de un
modal, y que un cambio en las tareas llegue al disco. Las dos regresiones que
las motivaron —no poder escribir el nombre de una nota nueva, y tener que
pulsar «Guardar» después de añadir una tarea— pasaban desapercibidas para el
resto de la suite.

No entran en `npm test`: necesitan Playwright y un servidor en marcha, y eso no
se le puede pedir a quien solo quiere correr las pruebas rápidas.

## Cómo se ejecutan

```bash
npm install --no-save playwright
npx playwright install chromium

npm run dev                 # en otra terminal
node tests/browser/modales.test.mjs
node tests/browser/tareas.test.mjs
```

## Variables

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `BASE_URL` | Servidor contra el que se prueba | `http://localhost:3000` |
| `PROJECT_DIR` | Proyecto de ejemplo que se lee y escribe | `projects_data/Proyecto_Ejemplo` |
| `CHROMIUM_PATH` | Usar un Chromium ya instalado | el de Playwright |

## Aviso

`tareas.test.mjs` **escribe en `tasks.md`** del proyecto que se le indique.
Añade una tarea y la marca; no borra nada, pero el fichero queda modificado.
Si no quieres tocar tu proyecto de ejemplo, apunta `PROJECT_DIR` a una copia.

## Reuniones sin grabación

`reuniones.test.mjs` comprueba que una reunión aparece con su transcripción
aunque falte el vídeo, que la portada ocupa el sitio del reproductor y que una
cita del asistente al `.mp4` ausente sigue abriendo el lector. La prueba escribe ella misma
la transcripción de una reunión sin grabación en `PROJECT_DIR` y la borra al
terminar: `projects_data` está en `.gitignore`, así que un fichero de ejemplo
dejado ahí no viajaría con el repositorio.
