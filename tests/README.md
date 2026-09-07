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
| `providers.test.mjs` | Los cinco adaptadores de chat: forma de la petición, parseo del stream, errores y cancelación | Node |
| `prompt.test.mjs` | Que el contexto lleve al modelo el minuto de cada fragmento hablado | Node |
| `mock-providers.mjs` | Servidores simulados que hablan cada protocolo (SSE de OpenAI, SSE de Gemini, JSON por líneas de Ollama) | — |

Los adaptadores se prueban contra los simuladores y no contra las APIs reales:
no hacen falta claves, no hay coste, y lo que puede romperse de verdad —el
parseo del stream y la forma de la petición— queda cubierto igual.

## Lo que no está cubierto

La interfaz. Durante el desarrollo se comprueba con Playwright (lector de
transcripciones, selector de modelo, paleta de búsqueda), pero esos scripts
necesitan un servidor en marcha y un navegador, así que no se ejecutan aquí.
