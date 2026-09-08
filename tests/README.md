# Pruebas

Sin framework: son scripts de Node y Python que se ejecutan directamente. El
proyecto tiene seis dependencias de producción y no parecía sensato añadir un
runner entero para esto.

```bash
npm run test          # todo lo que no necesita un navegador
```

| Fichero | Qué cubre | Necesita |
|---|---|---|
| `../scripts/tests/test_transcribir.py` | Agrupado de segmentos de Whisper y formato de tiempos | Python |
| `env.test.mjs` | Lectura de `.env`: CRLF, BOM, comillas, `export`, comentarios | Node |
| `providers.test.mjs` | Los cinco adaptadores de chat: forma de la petición, parseo del stream, errores y cancelación | Node |
| `prompt.test.mjs` | Que el contexto lleve al modelo el minuto de cada fragmento hablado | Node |
| `mock-providers.mjs` | Servidores simulados que hablan cada protocolo (SSE de OpenAI, SSE de Gemini, JSON por líneas de Ollama) | — |

Los adaptadores se prueban contra los simuladores y no contra las APIs reales:
no hacen falta claves, no hay coste, y lo que puede romperse de verdad —el
parseo del stream y la forma de la petición— queda cubierto igual.

## Windows

Los tests y `npm run doctor` cargan módulos del proyecto copiándolos a una
carpeta temporal y haciendo `import()` sobre ellos. Ese `import()` necesita una
**URL `file://`**: si se le pasa una ruta de Windows tal cual, Node lee `C:` como
si fuera un protocolo y falla con `ERR_UNSUPPORTED_ESM_URL_SCHEME`.

Por eso siempre se envuelve con `pathToFileURL(...).href`. Si añades otro
`import()` dinámico construido a partir de una ruta, haz lo mismo.

## Lo que no está cubierto

La interfaz. Durante el desarrollo se comprueba con Playwright (lector de
transcripciones, selector de modelo, paleta de búsqueda), pero esos scripts
necesitan un servidor en marcha y un navegador, así que no se ejecutan aquí.

Windows. El código está escrito para funcionar en él —rutas con `path.join`,
URLs `file://` en los `import()` dinámicos, separadores comprobados con
`path.sep`— pero la suite solo se ejecuta en Linux, así que los fallos
específicos de Windows aparecen al usarlo, no al probarlo.

El comportamiento real de cada modelo de cada proveedor. Los simuladores cubren
el protocolo; para saber qué modelos responden de verdad está `npm run doctor`.

## Ficheros grandes en la sincronización con Drive

`gdrive.test.mjs` comprueba, contra un Drive de mentira, que subir y bajar no
carga el fichero en memoria. Por defecto usa 300 MB, que basta para detectar un
regreso a `readFile`. Para probar el caso que dio el fallo original —el tope
duro de 2 GiB de `fs.readFile`:

```bash
TEST_LARGE_FILES=1 node tests/gdrive.test.mjs
```

No es lo predeterminado porque un fichero disperso de 2,5 GiB es gratis en
Linux, pero en NTFS puede acabar ocupando el disco de verdad.
