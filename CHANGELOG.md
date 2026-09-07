# Changelog

Todos los cambios reseñables de ProjectNotes.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el versionado sigue [SemVer](https://semver.org/lang/es/).

---

## [1.1.6] — 2026-09-07

### Corregido

- **El diagnóstico sugería un modelo retirado.** Si un modelo se redirige a su
  sustituto, lo que hay que fijar en la configuración es el que ha contestado,
  no el alias que se pidió: dejar el alias hace pagar una petición fallida en
  cada mensaje.
- **Ese 404 se repetía en cada turno.** El sustituto se recuerda durante la
  vida del proceso, así que el viaje perdido se paga una vez y no siempre.

### Cambiado

- El diagnóstico lista todos los modelos que funcionan, no solo el sugerido, y
  para sugerir prefiere el de más parámetros cuando el nombre lo indica
  (`120b` antes que `7b`) en lugar del primero por orden alfabético.

---

## [1.1.5] — 2026-09-07

### Corregido

- **Ningún modelo de Gemini contestaba.** Gemini separa los eventos de su
  stream con `\r\n\r\n`, y el lector partía por `\n\n`. Esa secuencia no
  existe dentro de `CR LF CR LF`, así que no se separaba jamás un fragmento:
  todo se acumulaba en el búfer y el búfer se descartaba al terminar el stream.
  El resultado era una respuesta vacía sin ningún error, porque técnicamente la
  petición iba bien. Groq y OpenAI usan `\n\n`, y por eso sí funcionaban.
- El último evento de un stream, que suele llegar sin línea en blanco detrás,
  ya no se pierde: al terminar se procesa lo que quede en el búfer. Afectaba
  igual a los proveedores compatibles con OpenAI y a Ollama.
- Un evento con varias líneas `data:` se une antes de interpretarlo, como manda
  la especificación de SSE, en vez de intentar leer cada línea por separado.

---

## [1.1.4] — 2026-09-07

Mejoras salidas de probar el diagnóstico contra catálogos reales de Gemini y
Groq.

### Corregido

- **Los errores de los proveedores no se podían leer.** Se volcaba el cuerpo
  crudo y se cortaba a 90 caracteres, así que de un JSON con sangrado solo se
  veía `{`. Ahora se extrae el mensaje (`error.message`, o `error` a secas en
  Ollama) y se añade una pista para los códigos habituales: 401 revisa la
  clave, 429 límite de uso, 5xx es del proveedor.
- **Los catálogos ofrecían modelos que no son de chat.** Síntesis de voz,
  transcripción, embeddings, moderación, generación de imagen y vídeo, y
  endpoints agénticos (*deep research*, *computer use*) respondían 400 a
  cualquier pregunta. Se filtran por nombre, que es lo único que exponen tanto
  Gemini como los catálogos compatibles con OpenAI.
- **«No devolvió ninguna respuesta» no distinguía dos problemas distintos.**
  Ahora separa el caso en que no llega ni un fragmento —el modelo probablemente
  no admite este endpoint— del caso en que llegan fragmentos sin texto, y en
  ambos indica el comando para ver la respuesta en crudo.
- Un error que Gemini manda **dentro** del stream, en vez de como código HTTP,
  ya no se ignora.

### Añadido

- `npm run doctor -- --raw <proveedor> <modelo>`: vuelca la respuesta tal cual.
  Es lo que hace falta cuando un modelo contesta 200 sin texto y no está claro
  si falla el modelo o el parseo.
- La muestra del diagnóstico se reparte por todo el catálogo en vez de coger
  los cinco primeros por orden alfabético, que suelen ser de la misma familia.
- Cuando ningún modelo de la muestra funciona, se sugiere `--all`; cuando uno
  se queda mudo, se sugiere `--raw`.

---

## [1.1.3] — 2026-09-07

### Corregido

- **`npm run doctor` no veía las claves de un `.env.local` guardado en
  Windows.** Su lector partía el fichero solo por `\n`, dejando un `\r` al
  final de cada línea; como en JavaScript `\r` es un terminador de línea, la
  expresión regular no llegaba a hacer match y descartaba **todas** las
  variables en silencio. Los proveedores aparecían como «sin configurar» aunque
  la aplicación sí funcionase, porque Next usa su propio lector.
- El lector de `.env` pasa a un módulo propio y tolera lo que la gente escribe
  de verdad: CRLF, BOM, comillas, `export` delante, comentarios al final de
  línea y espacios sueltos. Con pruebas.

### Añadido

- **`CHAT_PROVIDER` acepta una lista de preferencias**, no solo un valor:
  `CHAT_PROVIDER=gemini, groq, ollama` usa el primero que esté configurado.
  No distingue mayúsculas y el diagnóstico avisa de las entradas que no
  corresponden a ningún proveedor.
- **Ollama usa un modelo que tengas descargado.** El predeterminado no era más
  que una suposición (`llama3.2`) y devolvía un 404 si no estaba; ahora, si no
  está instalado, se usa el primero disponible y se avisa de cómo descargar el
  que se pedía.
- El diagnóstico muestra de qué fichero salen las variables, cuántas ha
  aplicado y qué proveedor queda por defecto.

---

## [1.1.2] — 2026-09-07

### Corregido

- **`npm run doctor` y los tests no arrancaban en Windows.** Cargan módulos del
  proyecto copiándolos a una carpeta temporal y haciendo `import()` sobre ellos,
  y a ese `import()` se le pasaba la ruta tal cual: en Windows Node lee `C:`
  como si fuera un protocolo y aborta con `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
  Ahora se envuelven con `pathToFileURL(...).href`.
- El diagnóstico ya no muere si el SDK de Anthropic no se puede resolver: se
  sustituye por un stub, porque quien use Gemini, Groq u Ollama no lo necesita.
- Rutas con espacios (habituales en Windows) al resolver ese SDK.
- Los colores ANSI se desactivan si la salida no es un terminal o si está
  definida `NO_COLOR`.

---

## [1.1.1] — 2026-09-07

Arreglos de los fallos que aparecieron al probar el chat con claves reales de
Gemini.

### Corregido

- **Modelos retirados que siguen en el catálogo.** `ListModels` de Gemini
  devuelve modelos que la API rechaza después con un 404 para cuentas nuevas
  («This model … is no longer available to new users»), indicando el sustituto
  en el texto del error. Ahora se lee ese sustituto, se reintenta una vez con él
  y se avisa en el chat del cambio. Los que el catálogo marca como obsoletos en
  su descripción se ocultan del selector.
- **Respuestas vacías sin error.** Gemini 2.5 y posteriores razonan antes de
  responder, y esos tokens salen del mismo `maxOutputTokens` que la respuesta:
  con el presupuesto anterior el modelo podía gastárselo entero pensando y
  devolver un 200 sin una palabra. Se pide un presupuesto holgado (mínimo 8192)
  y, si aun así no llega texto, se explica por qué —`MAX_TOKENS`, bloqueo de
  seguridad u otro `finishReason`— en lugar de quedarse callado.
- Los fragmentos de razonamiento (`thought: true`) ya no pueden colarse como si
  fueran la respuesta.
- El mismo silencio se detecta ahora en todos los proveedores: si el stream
  termina sin texto, se informa en vez de dejar la burbuja vacía.

### Añadido

- `npm run doctor`: prueba contra las APIs reales qué proveedores y modelos
  funcionan, cuánto tardan y qué devuelven, y sugiere las líneas de
  `.env.local` para fijar uno. Prueba siempre el modelo configurado, aunque ya
  no aparezca en el catálogo, que es justo el caso del modelo retirado.
- Los tres fallos anteriores están reproducidos en `tests/mock-providers.mjs` y
  cubiertos por `npm run test`.

---

## [1.1.0] — 2026-09-07

Transcripciones navegables con marcas de tiempo, y un asistente que ya no está
atado a un solo proveedor.

### Añadido

**Transcripciones con marcas de tiempo**
- `transcribir_video.py` guarda además `<nombre>_transcripcion.json` con los
  segmentos de Whisper, que hasta ahora se descartaban. El `.txt` se mantiene.
- Los segmentos se agrupan en bloques legibles: se cierra un bloque al alcanzar
  el tamaño objetivo, al terminar una frase, o ante un silencio de más de dos
  segundos, que casi siempre marca un cambio de turno.
- Flags `--model`, `--language`, `--no-json` y `--force`. El import de Whisper
  es perezoso, así que la lógica de agrupado se puede probar sin instalarlo.
- Pruebas de esa lógica en `scripts/tests/test_transcribir.py` (`npm run test`).

**Lector de transcripciones**
- Vista con la grabación y el texto en paralelo: pulsar cualquier línea salta a
  ese momento, y la línea que suena se resalta y se centra sola.
- El seguimiento automático se desactiva en cuanto el usuario hace scroll a
  mano, y vuelve a activarse al pulsar una línea.
- Búsqueda dentro de la transcripción con plegado de acentos y resaltado de las
  coincidencias, y copia de un fragmento con su marca de tiempo.
- Enlace profundo `?tab=meetings&media=<fichero>&t=<segundos>`.
- Las grabaciones de audio (`.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`) cuentan
  como reuniones.

**Citas al minuto**
- El índice trocea las transcripciones por segmentos, en bloques de alrededor de
  un minuto para que la cita caiga cerca, y arrastra el instante y la grabación.
- Cuando existe el `.json` se deja de indexar el `.txt` hermano: mismo
  contenido, pero con marcas de tiempo.
- El contexto del prompt anuncia el minuto de cada fragmento hablado, y las
  instrucciones piden mencionarlo al citar.
- Las fuentes del chat y los resultados de la paleta enlazan al lector en ese
  segundo, y muestran el nombre de la grabación en vez del sidecar `.json`.

**Varios proveedores de chat**
- Registro de proveedores con una interfaz común: Anthropic, Google Gemini,
  Groq, OpenAI y Ollama en local. `/api/chat` no sabe cuál responde.
- **Opciones gratuitas**: Gemini y Groq tienen plan gratuito; Ollama es local y
  gratis. Groq, OpenAI y cualquier pasarela compatible comparten una sola
  implementación.
- Selector de modelo en el propio chat, con los catálogos consultados en vivo a
  cada proveedor en lugar de escritos en el código.
- Los proveedores sin configurar se listan igualmente, indicando qué falta y con
  un enlace para conseguir la clave.
- `CHAT_PROVIDER` fija el predeterminado; si no, se usa el primero configurado.
- Adaptadores probados contra servidores simulados que hablan cada protocolo.
- Si el navegador cancela la petición, el stream se aborta hacia el proveedor.

### Corregido

- `resumen_transcripcion.py` tenía la clave escrita a fuego como la cadena
  `'API_KEY'`, así que `GEMINI_API_KEY` nunca se usaba y toda llamada fallaba
  con un error de autenticación poco claro.
- Al llegar desde una cita, el lector saltaba al momento correcto pero no
  resaltaba nada: el único `timeupdate` se disparaba antes de que la
  transcripción hubiera cargado, y una grabación en pausa no emite más.
- El resalte automático usaba `scrollIntoView`, que desplaza también a los
  contenedores ancestros: la página entera se metía bajo la barra superior.
  Ahora se mueve solo el scroll de la lista.
- Pulsar `Escape` para cerrar el selector de modelo cerraba además el panel del
  asistente entero.
- El selector de modelo se abría hacia arriba, fuera de la pantalla, estando su
  disparador en la parte superior del panel.
- El selector ignoraba el modelo configurado por entorno y elegía el primero del
  catálogo.
- `google-generativeai` faltaba en `requirements.txt`.

### Cambiado

- El resumen de reuniones produce markdown estructurado (resumen, puntos clave,
  decisiones, próximos pasos) y pide señalar lo que parezca mal transcrito.
- `.env.example` reordenado por proveedor, señalando cuáles son gratuitos.

---

## [1.0.0] — 2026-09-07

Rediseño completo de la interfaz, asistente conversacional sobre el contenido
del usuario y soporte para instalar la app en móvil y tablet.

### Añadido

**Sistema de diseño**
- `globals.css` reescrito como un sistema de tokens: color, tipografía,
  espaciado, radios, elevación y movimiento.
- Tema **claro, oscuro y automático**, con conmutador en la barra lateral. Un
  script inline pinta el tema guardado antes de la hidratación, así que no hay
  destello blanco al cargar en modo oscuro.
- Set de iconos SVG propio (`components/ui/Icon.js`) que sustituye a los emojis
  usados como iconografía de interfaz.
- Primitivas reutilizables: `Modal` accesible (foco atrapado, Escape, scroll
  bloqueado), `ConfirmDialog`, `EmptyState`, `Skeleton` y sistema de *toasts*.
- Soporte de `prefers-reduced-motion` y de las áreas seguras de iOS.

**Navegación**
- Barra superior con migas de pan derivadas de la ruta.
- Barra lateral rediseñada: árbol de proyectos con líneas de guía, expansión
  automática hacia el proyecto abierto, filtro y estado de la base de conocimiento.
- **Paleta de comandos** (`⌘K` / `Ctrl+K`): salta a cualquier proyecto o busca
  dentro del texto de todas las notas y transcripciones.
- **Navegación inferior** en móvil y cajón lateral con velo, pensados para el pulgar.
- Atajos globales: `⌘K` búsqueda, `⌘J` asistente, `⌘S` guardar nota.

**Panel**
- Tarjetas de métricas: proyectos, tareas pendientes, documentos indexados y
  transcripciones.
- Tareas agrupadas por proyecto con barra de progreso.
- Explorador de proyectos con vista de rejilla o de tabla, orden, filtro y
  paginación. La tabla degrada a tarjetas en pantallas pequeñas.

**Vista de proyecto**
- Pestañas con iconos y contadores, desplazables en horizontal en móvil.
- **Notas**: lista y editor en dos paneles (que se alternan en móvil), vista
  previa y edición, barra de markdown, aviso de cambios sin guardar, crear y
  borrar ficheros, enlaces profundos del tipo `?tab=notes&file=x.md`.
- **Tareas**: filtros, casillas propias, barra de progreso y creación de la nota
  asociada a una tarea.
- **Reuniones**: tarjetas con reproductor, estado de transcripción y resumen
  desplegable.
- **Documentos**: ficheros locales con tamaño y fecha, más enlaces externos con
  validación de URL.
- **Imágenes**: zona de arrastre, pegado desde el portapapeles en cualquier punto
  de la pestaña y visor a pantalla completa con teclado y gestos.
- **Charlas**: tarjetas con enlaces por tipo (vídeo, slides, notas, personalizados).

**Asistente y búsqueda**
- Índice de conocimiento sobre `projects_data/`: recorre los ficheros de texto,
  los trocea (por encabezados en markdown, por ventana deslizante en
  transcripciones) y los indexa con BM25 propio, con plegado de acentos, stemming
  ligero y lista de palabras vacías bilingüe.
- Los nombres de fichero se indexan también por partes, para que buscar
  «kickoff» encuentre `reunion_kickoff_transcripcion.txt`.
- **Embeddings opcionales** (Voyage, Gemini u OpenAI) fusionados con los
  resultados léxicos mediante *Reciprocal Rank Fusion*. Sin configurar, la
  búsqueda funciona igual, sin red y sin claves.
- `/api/chat`: respuestas en streaming con Claude que **citan las fuentes**, con
  el prompt estable en un bloque cacheado.
- Panel del asistente: historial persistente en la sesión, sugerencias iniciales,
  ámbito global o limitado al proyecto abierto, y chips de fuente desplegables
  que enlazan al fichero citado.
- `/api/search`: búsqueda de texto completo que alimenta la paleta de comandos.
- `/api/knowledge`: estado del índice y reconstrucción bajo demanda.

**PWA**
- Manifiesto con iconos normales y *maskable*, atajos y colores de tema.
- Service worker: red primero para la navegación con página offline de reserva,
  *stale-while-revalidate* para estáticos, y nunca caché para `/api/` ni vídeo.
- Aviso de instalación, con instrucciones específicas para iOS Safari.
- Iconos generados desde código (`npm run icons`), sin dependencias nativas de
  imagen.
- Configuración de Bubblewrap y workflow de GitHub Actions para producir un
  APK/AAB envolviendo la PWA en una Trusted Web Activity.
- Ruta `/.well-known/assetlinks.json` que solo responde cuando está configurada.

**Otros**
- `DELETE` y renombrado en la API de ficheros.
- `.env.example` documentando toda la configuración.
- `AGENTS.md`, `docs/` y este changelog.

### Cambiado

- La vista de proyecto pasa de un componente de 1.500 líneas a un shell más una
  pestaña por fichero.
- La sincronización con Google Drive reconstruye el índice del asistente cuando
  la pasada trae ficheros nuevos.
- El SDK de Google Identity se carga de forma diferida, solo al abrir el diálogo
  de Drive, en vez de en cada carga de página.
- El estado de conexión con Drive se propaga por eventos en lugar de con un
  `setInterval` cada dos segundos.
- Los ajustes se combinan sobre los valores por defecto al cargarse, de modo que
  una opción nueva existe también para usuarios con datos guardados antiguos.
- Los botones de scroll se reducen a uno solo, «volver arriba», con la lectura
  del scroll agrupada en un `requestAnimationFrame`.
- La API de ficheros devuelve el tipo, tamaño y clasificación de cada entrada.
- Las respuestas 416 se manejan correctamente en las peticiones por rango.

### Corregido

- **Recorrido de rutas**: `getSafePath()` comparaba con
  `startsWith(PROJECTS_DIR)`, así que una carpeta hermana como
  `projects_data_backup` pasaba la comprobación. Ahora se compara contra
  `PROJECTS_DIR + path.sep` y se rechazan los bytes NUL.
- **Inyección de comandos**: `/api/transcribe` y `/api/summarize` interpolaban
  la ruta del fichero en una línea de shell con `exec`. Pasan a usar `execFile`,
  que entrega los argumentos directamente al proceso.
- **Trabajos invisibles**: cada ruta mantenía su propio `Map` de trabajos, así
  que un trabajo iniciado en una no existía para la otra. Ahora comparten
  `lib/job-store.js`, con poda por antigüedad y por número.
- **Estilos que no se aplicaban**: `styled-jsx` no añade su clase de ámbito al
  DOM que renderiza un componente hijo, de modo que varias reglas sobre `<Link>`
  (barra lateral, tarjetas del panel, migas) nunca llegaban a aplicarse.
- **El service worker no se registraba**: se suscribía al evento `load`, que ya
  había ocurrido cuando corría el efecto.
- El listado de directorios devolvía 500 en vez de 404 para carpetas inexistentes.
- El *lightbox* dejaba el `overflow` del `body` en `unset` en lugar de restaurar
  el valor previo.
- `TranscriptModal` seguía haciendo polling después de cerrarse.

### Seguridad

- Toda ruta de fichero pasa por `getSafePath()`.
- Los scripts de Python se invocan sin shell.
- El nombre de fichero se valida en las escrituras (sin barras ni recorridos).
- El service worker nunca almacena respuestas de la API.

---

## [0.1.0] — 2026 (anterior)

Versión inicial: proyectos como carpetas, pestañas de resumen, tareas, notas,
enlaces, reuniones, documentos, charlas e imágenes; transcripción con Whisper,
resumen con Gemini y sincronización bidireccional con Google Drive.
