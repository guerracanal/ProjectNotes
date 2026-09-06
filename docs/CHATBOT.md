# El asistente

Un chatbot que conoce el contenido de todos tus ficheros y transcripciones,
responde citando la fuente y funciona en local.

---

## Cómo funciona, de un vistazo

```
pregunta
   │
   ├─ retrieve() ──┬─ BM25 sobre el índice léxico        ─┐
   │               └─ embeddings (si están configurados)  ┴─ fusión RRF
   │                                                          │
   │                                              top-K fragmentos
   │                                                          │
   ├─ system = [ instrucciones (bloque cacheado) ,  contexto ]│
   │                                                          │
   └─ Claude, streaming ──→ SSE ──→ ChatPanel
                                    ├─ texto token a token
                                    └─ chips de fuente [1] [2] …
```

---

## Indexado

`src/lib/knowledge/store.js` recorre `projects_data/` y construye el índice.

**Qué entra**: todos los ficheros de texto (`.md`, `.txt`, `.markdown`, `.csv`,
`.json`, `.log`) de menos de 2 MB. Eso incluye las notas, los `tasks.md`, los
`links.md` y — lo importante — las transcripciones de reuniones y sus resúmenes.

**Troceado** (`chunker.js`). El troceado distingue dos tipos de documento porque
tienen estructuras opuestas:

- **Markdown**: se parte por encabezados. Cada fragmento conserva el rastro de
  títulos del que cuelga (`Reunión kickoff › Decisiones › Presupuesto`), que sirve
  a la vez para dar contexto al modelo y para etiquetar la cita en la interfaz.
  Una sección demasiado larga se subdivide.
- **Transcripciones y texto plano**: no hay estructura que respetar, así que se
  usa una ventana deslizante sobre frases, de unos 1.400 caracteres, con 200 de
  solapamiento. El solapamiento es lo que hace que un dato partido justo en la
  frontera siga siendo recuperable desde cualquiera de los dos lados.

**Persistencia**. El índice se guarda en `.projectnotes/knowledge-index.json`,
que está en `.gitignore`. Se identifica con una huella calculada sobre rutas,
tamaños y fechas de modificación, así que un cambio hecho fuera de la app —una
edición manual, un `git pull`, una pasada de Drive— también lo invalida.

`invalidateIndex()` solo **marca** el índice como obsoleto: la reconstrucción la
paga la siguiente consulta, y una sola vez. Guardar diez notas seguidas no
dispara diez reconstrucciones.

---

## Recuperación

### Por qué BM25 es el motor por defecto

Podría parecer que en 2026 la respuesta obvia es «embeddings y ya». Aquí no:

1. **Funciona sin nada.** Sin clave, sin red, sin descargar un modelo. Es lo
   único compatible con la promesa de que la app sirve en local.
2. **Acierta donde lo denso falla.** En un corpus de notas personales, buena parte
   de las consultas son nombres propios, siglas, nombres de proyecto y de
   personas. Un modelo denso los difumina; BM25 los clava.
3. **Es explicable.** Cuando un resultado no aparece, se puede razonar por qué.

Los embeddings, cuando se configuran, **se suman**; no sustituyen.

### El tokenizador

`tokenizer.js` está afinado para la mezcla español/inglés en la que están escritas
estas notas:

- **Plegado de acentos**, para que «reunión» y «reunion» sean el mismo término.
- **Stemming ligero**, deliberadamente conservador: recorta un puñado de
  terminaciones (`-ciones`, `-mente`, `-ando`, `-ing`, `-s`…). Un stemmer agresivo
  daña más la precisión de lo que gana en cobertura.
- **Palabras vacías bilingües**.
- **Descomposición de nombres de fichero**: `reunion_kickoff_transcripcion.txt` se
  indexa entero y también por partes, porque nadie busca el slug completo pero
  mucha gente busca «kickoff».

Los encabezados se indexan por duplicado: el título de una sección es una señal
de relevancia fuerte que si no quedaría ahogada por el cuerpo del texto.

### Embeddings opcionales

```bash
EMBEDDINGS_PROVIDER=voyage    # o gemini, openai
VOYAGE_API_KEY=…
```

| Proveedor | Modelo por defecto | Dimensiones |
|---|---|---|
| `voyage` | `voyage-3.5-lite` | 1024 |
| `gemini` | `gemini-embedding-001` | 768 |
| `openai` | `text-embedding-3-small` | 1536 |

Si la pasada de embeddings falla durante la construcción del índice, se registra
un aviso y se sigue solo con BM25. Una caída del proveedor degrada la calidad de
la búsqueda; no la rompe.

### Fusión

Los dos rankings se combinan con **Reciprocal Rank Fusion**:

```
score(d) = Σ  peso_lista / (60 + rango(d, lista))
```

Se usa RRF y no una suma ponderada de puntuaciones porque las puntuaciones BM25 y
las similitudes coseno viven en escalas incomparables y sin cota común: cualquier
peso que eligieras sería arbitrario y frágil. El rango es lo único que ambos
recuperadores comparten.

---

## El prompt

`src/lib/knowledge/prompt.js`. El `system` se envía en **dos bloques**:

1. `ASSISTANT_INSTRUCTIONS`, byte-estable entre peticiones, con el punto de caché
   (`cache_control: ephemeral`).
2. El contexto recuperado, que cambia en cada turno, después del punto de caché.

Ese orden importa: la caché de prompts funciona por prefijo, así que cualquier
cosa volátil colocada antes invalidaría todo lo que viene detrás.

Las instrucciones fijan cuatro comportamientos:

- **Citar siempre** con `[n]`, justo después de la frase que sustenta la cita.
- **Decir que no lo sabe** cuando el contexto no lo contiene, en vez de rellenar.
- **Distinguir transcripción de nota**: una transcripción automática puede tener
  errores de reconocimiento de voz, y el modelo debe señalarlos en lugar de darlos
  por buenos.
- **Responder en el idioma de la pregunta**, español por defecto.

Si tocas el prompt, conserva las dos primeras.

---

## Streaming

`/api/chat` devuelve SSE. La recuperación se hace **antes** de abrir el stream,
para que un fallo de recuperación sea un error HTTP limpio y no una desconexión a
mitad de respuesta.

Eventos:

| Evento | Cuándo | Payload |
|---|---|---|
| `sources` | Primero, antes del texto | fragmentos recuperados |
| `delta` | Por cada trozo de texto | `{ text }` |
| `error` | Ante un fallo o una negativa | `{ message }` |
| `done` | Al terminar | uso de tokens, modelo, `stop_reason` |

Enviar `sources` primero es deliberado: las citas aparecen en pantalla mientras la
respuesta todavía se está generando, así que el usuario puede empezar a leer las
fuentes de inmediato.

El cliente parsea el SSE a mano porque `EventSource` no puede hacer POST.

---

## Ámbito

El asistente busca en todo por defecto. Estando dentro de un proyecto se puede
limitar a él con un clic; el filtro se aplica después de la fusión, sobre los
fragmentos recuperados.

---

## Coste

- El modelo por defecto es `claude-opus-5` (configurable con `ANTHROPIC_MODEL`).
- `effort: medium` — preguntas y respuestas sobre documentos no necesitan el
  máximo.
- Las instrucciones van cacheadas; el historial se recorta a los últimos 12 turnos.
- Se recuperan 8 fragmentos por defecto, ajustable entre 1 y 20.

---

## Si algo no funciona

**«Falta ANTHROPIC_API_KEY»** — el chat está desactivado, pero la búsqueda no.
Copia `.env.example` a `.env.local` y añade la clave.

**El asistente no ve un fichero nuevo** — reconstruye el índice desde el botón de
la barra lateral, o `POST /api/knowledge`. La huella debería detectarlo sola;
si no, revisa que el fichero tenga una extensión de texto y menos de 2 MB.

**Respuestas pobres** — mira los chips de fuente. Si los fragmentos citados no son
los correctos, es un problema de recuperación (prueba a activar embeddings, o usa
encabezados más descriptivos en tus notas). Si son correctos pero la respuesta no,
es un problema de prompt.
