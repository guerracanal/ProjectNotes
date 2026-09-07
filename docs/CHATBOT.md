# El asistente

Un chatbot que conoce el contenido de todos tus ficheros y transcripciones,
responde citando la fuente —incluido el minuto exacto de una reunión— y puede
funcionar con proveedores gratuitos.

---

## Elegir modelo

El asistente no está atado a un proveedor. Configura el que quieras en
`.env.local` y elige el modelo desde el propio chat, con el selector que hay
junto al ámbito de búsqueda.

| Proveedor | Coste | Variable | Dónde conseguirla |
|---|---|---|---|
| **Google Gemini** | Plan gratuito | `GEMINI_API_KEY` | <https://aistudio.google.com/apikey> |
| **Groq** | Plan gratuito | `GROQ_API_KEY` | <https://console.groq.com/keys> |
| **Ollama** | Gratis, local | *(ninguna)* | <https://ollama.com/> |
| **Anthropic (Claude)** | De pago | `ANTHROPIC_API_KEY` | <https://console.anthropic.com/> |
| **OpenAI** | De pago | `OPENAI_API_KEY` | <https://platform.openai.com/api-keys> |

Puedes definir varias a la vez. `CHAT_PROVIDER` decide cuál se usa por defecto y
admite una lista de preferencias, no solo un valor:

```bash
CHAT_PROVIDER=gemini, groq, ollama
```

Se usa el primero que esté configurado. Si no lo indicas, el primero que lo
esté. `npm run doctor` avisa si alguna entrada no corresponde a un proveedor.

Los modelos de cada proveedor **se consultan en vivo**, no están escritos en el
código: estos catálogos cambian con frecuencia y una lista fija acaba ofreciendo
modelos que ya no existen. El selector muestra también los proveedores que no
están configurados, con lo que falta para activarlos, porque «por qué no puedo
elegir Groq» es una pregunta que debería responder la interfaz y no la
documentación.

### Cómo se añade un proveedor

Todos viven en `src/lib/knowledge/providers.js` y exponen lo mismo:

```js
listModels({ apiKey, baseUrl })     // → [{ id, label }]
stream({ system, messages, ... })   // → generador asíncrono de trozos de texto
```

`/api/chat` no sabe cuál está respondiendo. Añadir uno nuevo es añadir una
entrada a ese objeto y nada más. Groq, OpenAI y la mayoría de pasarelas
autoalojadas hablan exactamente el mismo protocolo, así que comparten una única
implementación y solo cambian la URL base y la clave.

Los adaptadores están probados contra servidores simulados que hablan cada
protocolo (SSE de OpenAI, SSE de Gemini, JSON por líneas de Ollama), que es
donde se concentran los fallos de este tipo de código.

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

Una grabación transcrita deja dos ficheros con las mismas palabras:
`_transcripcion.txt` y `_transcripcion.json`. Cuando existe el JSON se indexa
solo ese y se ignora el `.txt` hermano: mismo contenido, pero con las marcas de
tiempo que permiten que una cita apunte a un momento en vez de a un fichero.

**Troceado** (`chunker.js`). El troceado distingue dos tipos de documento porque
tienen estructuras opuestas:

- **Markdown**: se parte por encabezados. Cada fragmento conserva el rastro de
  títulos del que cuelga (`Reunión kickoff › Decisiones › Presupuesto`), que sirve
  a la vez para dar contexto al modelo y para etiquetar la cita en la interfaz.
  Una sección demasiado larga se subdivide.
- **Transcripciones con marcas de tiempo**: se agrupan segmentos consecutivos en
  bloques de unos 650 caracteres, y cada bloque guarda el inicio de su primer
  segmento y el final del último. Los bloques son más pequeños que en prosa a
  propósito: todo el sentido de indexar por segmentos es que la cita caiga en el
  momento correcto, y un bloque que abarca dos minutos de conversación deja al
  lector otra vez adivinando.
- **Texto plano sin estructura**: ventana deslizante sobre frases, de unos 1.400
  caracteres, con 200 de solapamiento. El solapamiento es lo que hace que un dato
  partido justo en la frontera siga siendo recuperable desde cualquiera de los
  dos lados.

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

Las instrucciones fijan cinco comportamientos:

- **Citar siempre** con `[n]`, justo después de la frase que sustenta la cita.
- **Decir que no lo sabe** cuando el contexto no lo contiene, en vez de rellenar.
- **Mencionar el minuto** cuando cita algo dicho en una reunión. Los fragmentos
  de transcripción llegan al modelo anunciando su instante, así:

  ```
  [3] Portal / grabación «kickoff.mp4» (min. 12:34)
  Lo dejamos fuera de la primera fase…
  ```

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
| `sources` | Primero, antes del texto | fragmentos recuperados, con `media` y `start` en los hablados |
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

## Citas al minuto

Cuando un fragmento recuperado viene de una transcripción con marcas de tiempo,
la cita deja de apuntar al fichero y apunta al segundo exacto:

- El chip de la fuente muestra el minuto y el nombre de la grabación.
- Pulsarlo abre el lector de transcripciones con la reproducción ya colocada
  ahí, mediante `?tab=meetings&media=<fichero>&t=<segundos>`.
- La paleta de búsqueda (⌘K) hace lo mismo con los resultados hablados.

Verificar una afirmación pasa así de leer una transcripción entera a un clic.

---

## Coste

- Con un proveedor gratuito (Gemini, Groq u Ollama) el coste es cero.
- En Anthropic, `effort: medium` — preguntas y respuestas sobre documentos no
  necesitan el máximo — y las instrucciones van con punto de caché.
- El historial se recorta a los últimos 12 turnos.
- Se recuperan 8 fragmentos por defecto, ajustable entre 1 y 20.
- Si el navegador cancela la petición, el stream se aborta hacia el proveedor:
  no se siguen pagando tokens de una respuesta que ya nadie va a leer.

---

## Comprobar qué modelos funcionan

```bash
npm run doctor              # todos los proveedores configurados
npm run doctor -- gemini    # solo uno
npm run doctor -- gemini --all   # todo su catálogo, no una muestra
```

Para cada proveedor lista su catálogo, manda una pregunta mínima a una muestra
repartida de modelos y dice cuáles responden, con cuánto tardan y qué
devuelven. Al final sugiere las líneas de `.env.local` para fijar uno.

Cuando un modelo acepta la petición pero no devuelve texto, el volcado en crudo
dice si el problema está en el modelo o en cómo se lee su respuesta:

```bash
npm run doctor -- --raw gemini <modelo>
```

Los valores `*_MODEL` de `.env.example` son solo una pista: los catálogos
cambian, se retiran modelos y se renombran otros. El diagnóstico es lo que dice
qué funciona hoy.

Es la forma rápida de saber qué sirve de verdad sin ir probando modelos uno a
uno desde la interfaz. Las claves se leen de `.env.local` y nunca se imprimen.

---

## Peculiaridades de Gemini

Dos comportamientos suyos causaban fallos poco evidentes, y ambos están
contemplados en el adaptador:

**Modelos retirados que siguen en el catálogo.** `ListModels` devuelve modelos
que la API luego rechaza con un 404 para cuentas nuevas, indicando el sustituto
en el texto del error. El adaptador lo lee, reintenta una vez con el modelo que
Google nombra, y avisa en el chat de que ha cambiado. Los que el catálogo marca
como obsoletos en su descripción se ocultan directamente del selector.

**Respuestas vacías sin error.** Gemini 2.5 y posteriores razonan antes de
responder, y esos tokens de razonamiento salen del mismo `maxOutputTokens` que
la respuesta. Con un presupuesto ajustado el modelo puede gastárselo entero
pensando y devolver un 200 sin una sola palabra: parecía que la app estaba rota.
El adaptador pide ahora un presupuesto holgado (mínimo 8192) y, si aun así no
llega texto, dice por qué en lugar de quedarse callado — sea por
`MAX_TOKENS`, por un bloqueo de seguridad o por cualquier otro `finishReason`.

Los fragmentos de razonamiento (`thought: true`) nunca se muestran como si
fueran la respuesta.

Un silencio sin explicación es el peor resultado posible, así que el resto de
proveedores hacen lo mismo: si el stream termina sin texto, se informa.

---

## Si algo no funciona

**«No hay ningún proveedor configurado»** — el chat está desactivado, pero la
búsqueda no. Copia `.env.example` a `.env.local` y añade una clave: Gemini y
Groq tienen plan gratuito.

**Ollama aparece pero no se puede elegir** — el selector dirá si no consigue
contactar con él. Comprueba que está en marcha y que has descargado algún modelo
(`ollama pull llama3.2`).

**«Ya no está disponible para cuentas nuevas»** — es un modelo retirado que sigue
apareciendo en el catálogo de Gemini. El adaptador reintenta solo con el
sustituto y te avisa; si quieres dejar de verlo, elige otro en el selector.

**Un modelo responde vacío** — puede ser que razone mucho y agote el presupuesto
de salida, o que no admita este endpoint. El mensaje distingue ambos casos: si
no llegó ni un fragmento, el problema es el modelo; si llegaron fragmentos sin
texto, el volcado en crudo (`--raw`) lo aclara.

**Errores 400 en modelos raros** — los catálogos incluyen modelos que no son de
chat: síntesis de voz, transcripción, moderación, generación de imagen, y
endpoints agénticos como *deep research* o *computer use*. Se filtran del
selector por el nombre, que es lo único que exponen los catálogos. Si alguno se
cuela, el error dirá con claridad qué pasa.

**No sé qué modelos me sirven** — `npm run doctor` los prueba todos y te lo dice.

**El doctor dice «sin configurar» pero la app sí funciona** — mira que la
variable esté en `.env.local` y no solo en el entorno de tu terminal. El
diagnóstico imprime de qué fichero ha leído y cuántas variables ha aplicado; si
dice 0, el fichero está donde no toca o tiene otro nombre.

**Ollama responde con un modelo distinto al que pedí** — el predeterminado es
solo una suposición. Si no lo tienes descargado se usa el primero disponible y
se avisa. Para tener el que quieres: `ollama pull <modelo>`.

**El asistente no ve un fichero nuevo** — reconstruye el índice desde el botón de
la barra lateral, o `POST /api/knowledge`. La huella debería detectarlo sola;
si no, revisa que el fichero tenga una extensión de texto y menos de 2 MB.

**Respuestas pobres** — mira los chips de fuente. Si los fragmentos citados no son
los correctos, es un problema de recuperación (prueba a activar embeddings, o usa
encabezados más descriptivos en tus notas). Si son correctos pero la respuesta no,
es un problema de prompt.
