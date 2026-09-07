# AGENTS.md

Contexto para agentes de IA (y personas nuevas) que trabajen en este repositorio.
Léelo antes de tocar código.

---

## 1. Qué es esto

**ProjectNotes** es un espacio de trabajo personal, de ejecución local, para
proyectos, notas, tareas, reuniones y transcripciones.

La idea central, y la restricción de diseño más importante del proyecto:

> **El sistema de ficheros es la base de datos.**

No hay ORM, ni migraciones, ni servidor de base de datos. Un «proyecto» es una
carpeta dentro de `projects_data/`. Una nota es un `.md`. Una lista de tareas es
un markdown con casillas. Todo lo que la app muestra se puede abrir, editar y
versionar con cualquier editor de texto, y la app debe seguir funcionando
después.

Consecuencias prácticas que **no** debes romper:

- Nunca introduzcas un formato propietario ni un índice que sea la única fuente
  de verdad. El índice de conocimiento (`.projectnotes/`) es una **caché
  reconstruible**; borrarlo no debe perder datos.
- Al escribir ficheros, mantenlos legibles fuera de la app. `links.md` guarda
  enlaces markdown normales; `tasks.md` guarda `- [ ]` estándar.
- Si un fichero cambia por debajo (edición manual, `git pull`, sincronización con
  Drive), la app debe reflejarlo sin pasos manuales.

---

## 2. Stack

| Pieza | Elección | Notas |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | JavaScript, sin TypeScript |
| UI | React 19 + `styled-jsx` | Sin librería de componentes ni Tailwind |
| Estilos | Tokens CSS en `src/app/globals.css` | Tema claro/oscuro/sistema |
| Markdown | `react-markdown` + `remark-gfm` | |
| Asistente | Anthropic, Gemini, Groq, OpenAI, Ollama | Un adaptador por proveedor, streaming SSE |
| Recuperación | BM25 propio, embeddings opcionales | Sin base vectorial |
| Transcripción | Whisper (Python, local) | `scripts/transcribir_video.py` |
| Resumen | Gemini (Python) | `scripts/resumen_transcripcion.py` |
| Sincronización | Google Drive API v3 vía `fetch` | Sin SDK de Google en servidor |

Dependencias de producción: **seis**. Mantenlo así salvo motivo de peso; este
proyecto se ejecuta en el portátil de una persona, no en un clúster.

---

## 3. Mapa del repositorio

```
projects_data/            ← LOS DATOS DEL USUARIO. Nunca lo borres ni reescribas
                            en masa. En este repo solo hay un proyecto de ejemplo.
scripts/
  transcribir_video.py    ← ffmpeg → Whisper → *_transcripcion.txt
  resumen_transcripcion.py← Gemini → *_transcripcion_resumen.txt
  generate-icons.mjs      ← Genera los PNG/ICO de la PWA sin dependencias nativas
src/
  app/
    layout.js             ← Proveedores, metadatos, script inline de tema
    page.js               ← Panel
    project/[...path]/    ← Vista de proyecto (server component; lee del disco)
    api/
      projects/[[...path]]← CRUD de ficheros y streaming de binarios
      projects/all        ← Árbol aplanado
      projects/upload     ← Subida de imágenes
      tree                ← Árbol de carpetas
      tasks/all           ← Tareas pendientes de todos los proyectos
      search              ← Búsqueda de texto completo
      chat                ← Asistente RAG (SSE), sea cual sea el proveedor
      models              ← Proveedores configurados y sus modelos
      knowledge           ← Estado y reconstrucción del índice
      transcribe          ← Lanza Whisper, devuelve un jobId
      summarize           ← Lanza Gemini, devuelve un jobId
      sync/gdrive         ← Sincronización bidireccional
  components/
    AppShell.js           ← Shell + atajos globales
    Sidebar / Topbar / MobileNav / CommandPalette
    chat/                 ← Panel del asistente y lista de fuentes
    project/              ← Una pestaña por fichero
      TranscriptReader.js ← Transcripción navegable sincronizada con el vídeo
    ui/                   ← Icon, Modal, ConfirmDialog, EmptyState, Skeleton
  contexts/               ← Theme, Toast, Settings, Sidebar
  lib/
    fs-utils.js           ← ÚNICA puerta al disco. Todo pasa por getSafePath()
    knowledge/            ← Troceado, BM25, embeddings, recuperación, prompt
      providers.js        ← Un adaptador por proveedor de chat, misma interfaz
    transcript.js         ← Marcas de tiempo: parseo, formato, búsqueda binaria
    task-parser.js        ← Markdown de tareas ↔ objetos
    talks-parser.js       ← talks.md ↔ objetos
    gdrive.js             ← Cliente de Google Drive
    job-store.js          ← Registro en memoria de trabajos largos
    run-script.js         ← Ejecución segura de los scripts de Python
    file-kinds.js         ← Extensiones e iconos (seguro para el cliente)
```

---

## 4. Reglas que importan

### 4.1 Acceso al disco

**Todo** acceso a `projects_data/` pasa por `src/lib/fs-utils.js`, y toda ruta
por `getSafePath()`. Esa función:

- rechaza rutas con bytes NUL,
- quita las barras iniciales para que una ruta absoluta no pueda re-enraizar,
- compara contra `PROJECTS_DIR + path.sep` (no basta `startsWith(PROJECTS_DIR)`:
  una carpeta hermana como `projects_data_backup` comparte el prefijo).

Si añades un endpoint que toca ficheros, úsala. No hagas `path.join` a mano.

### 4.2 Ejecutar procesos

Los scripts de Python se lanzan con `execFile` a través de
`src/lib/run-script.js`, nunca con `exec`. Los nombres de fichero vienen del
usuario y pueden contener comillas, `;` o `$(...)`; con `exec` eso es una shell
injection. No vuelvas a introducir interpolación de cadenas en un comando.

### 4.3 `styled-jsx` y componentes

`styled-jsx` añade su clase de ámbito solo a los elementos DOM escritos en ese
JSX. Un `className` que pasas a un **componente** (`<Link>`, `<Icon>`) llega al
DOM **sin** esa clase, así que la regla no se aplica.

```jsx
// ❌ no se aplica
<Link className="tree-link" />
<style jsx>{` .tree-link { ... } `}</style>

// ✅
<Link className="tree-link" />
<style jsx>{` :global(.tree-link) { ... } `}</style>
```

Elige nombres de clase únicos cuando uses `:global()`: dejan de estar aislados.

### 4.4 Efectos y estado

El proyecto usa el compilador de React con `react-hooks/set-state-in-effect`
como **error**. No pongas `setState` síncrono en el cuerpo de un efecto. Patrones
que sí pasan y que ya se usan aquí:

- **Derivar** en vez de sincronizar: `const open = manualOpen ?? (forceOpen || inPath)`.
- **Escribir en el handler**, no en un efecto: resetear la paginación al filtrar.
- **`useSyncExternalStore`** para leer sistemas externos (tema, `localStorage`,
  `matchMedia`) — ver `contexts/ThemeContext.js`.
- Para cargar datos, IIFE `async` dentro del efecto, con los `setState` **después
  del `await`** y una bandera `cancelled` en la limpieza.

### 4.5 Temas

Todo color sale de un token. Nunca escribas un hex en un componente. La paleta
clara se define en `:root`; el modo oscuro se redefine dos veces (bajo
`@media (prefers-color-scheme: dark)` con guarda `:root:not([data-theme="light"])`
y bajo `:root[data-theme="dark"]`) para que la preferencia del sistema y la
elección explícita ganen en ambos sentidos. Un script inline en `layout.js` pinta
el tema guardado antes de la hidratación para evitar el flash blanco.

### 4.6 Errores hacia el usuario

Nada de `alert()`, `confirm()` ni `prompt()`. Usa `useToast()`, `<Modal>` y
`<ConfirmDialog>`. Nada de `window.location.reload()`: usa `router.refresh()`.

---

## 5. El asistente (RAG)

Flujo completo de una pregunta:

```
pregunta → retrieve() ─┬→ BM25            ─┐
                       └→ embeddings (opc.) ┴→ fusión RRF → top-K fragmentos
                                                                │
        system = [instrucciones (cacheadas), contexto] ─────────┘
                                                                │
                    proveedor elegido (streaming) → SSE → ChatPanel
                                                        + chips de fuente
```

### 5.1 Proveedores

`src/lib/knowledge/providers.js` es el único sitio que sabe de proveedores.
Cada uno expone `listModels()` y `stream()`, así que `/api/chat` no sabe cuál
está respondiendo. Añadir uno es añadir una entrada a ese objeto.

Groq, OpenAI y cualquier pasarela compatible comparten una sola implementación
(`openAiCompatible`): hablan el mismo protocolo y solo cambian la URL base.

Anthropic recibe el `system` partido en dos bloques para poder poner el punto de
caché en las instrucciones; el resto lo recibe como una sola cadena. Es la única
diferencia que `/api/chat` tiene que conocer.

Los catálogos de modelos se consultan en vivo, nunca se escriben en el código:
cambian a menudo y una lista fija acaba ofreciendo modelos retirados.

Dos trampas de Gemini que ya están contempladas, y que conviene no deshacer:

- Su catálogo **incluye modelos que la API luego rechaza** con un 404 para
  cuentas nuevas, nombrando el sustituto en el texto del error. El adaptador lo
  parsea, reintenta una vez y emite un evento `notice`.
- Sus modelos 2.5+ **razonan con cargo a `maxOutputTokens`**. Con un presupuesto
  ajustado devuelven un 200 sin texto. Por eso se pide un mínimo de 8192 y se
  comprueba que haya salido algo antes de dar el turno por bueno.

Un stream que termina sin texto lanza un error explicativo en **todos** los
proveedores. Una burbuja vacía parece una app rota; un mensaje no.

`npm run doctor` prueba los proveedores contra sus APIs reales, que es lo único
que los simuladores de `tests/` no pueden cubrir.

Decisiones y por qué:

- **BM25 es el motor por defecto**, no un plan B. Funciona sin clave, sin red y
  sin descargar modelos; y en un corpus de notas personales los aciertos exactos
  (nombres de proyecto, siglas, nombres propios) son justo lo que un modelo denso
  tiende a perder. Los embeddings, si se configuran, se **suman** por RRF.
- **RRF y no suma ponderada**: las puntuaciones BM25 y las similitudes coseno
  viven en escalas incomparables; lo único que ambos recuperadores comparten es
  el rango.
- **El troceado distingue tres tipos de documento.** El markdown se parte por
  encabezados y cada fragmento arrastra su rastro de títulos. Las transcripciones
  con marcas de tiempo se agrupan por segmentos en bloques de ~1 minuto, que
  guardan su instante para que la cita apunte al momento y no al fichero. El
  texto plano usa una ventana deslizante sobre frases con solapamiento, para que
  un dato partido en la frontera siga siendo recuperable.
- **Cuando hay `_transcripcion.json` se ignora el `.txt` hermano.** Es el mismo
  contenido; indexar los dos duplicaría los resultados y perdería las marcas de
  tiempo.
- **Dos bloques de `system`**: las instrucciones son byte-estables y llevan el
  punto de caché; el contexto recuperado, que cambia en cada turno, va después.
- **El prompt exige citar** con `[n]` y decir «no lo encuentro» antes que
  inventar. Si cambias el prompt, mantén esas dos reglas.
- El índice vive en `.projectnotes/knowledge-index.json` y se invalida al
  escribir por la API. `invalidateIndex()` solo **marca** como obsoleto: la
  reconstrucción la paga la siguiente consulta, y una sola vez.

---

## 6. Ficheros con significado especial

Dentro de la carpeta de un proyecto:

| Fichero | Efecto |
|---|---|
| `description.md` | Se renderiza en la pestaña Resumen |
| `tasks.md` | Alimenta la pestaña Tareas y el panel (`- [ ]` / `- [x]`) |
| `links.md` | Alimenta las pestañas Enlaces y Documentos |
| `talks.md` | Hace aparecer la pestaña Charlas |
| `images/` | Destino de las subidas de imágenes |
| `<nombre>.mp4` (o `.mp3`, `.m4a`…) | Una grabación |
| `<nombre>_transcripcion.txt` | Su transcripción (generada por Whisper) |
| `<nombre>_transcripcion.json` | Los segmentos con marcas de tiempo |
| `<nombre>_transcripcion_resumen.txt` | Su resumen (generado por Gemini) |

La convención de nombres de transcripción es **posicional**: el nombre base debe
coincidir con el del vídeo. Si la cambias, actualiza a la vez
`src/app/project/[...path]/page.js`, `TranscriptModal.js` y los scripts de Python.

---

## 7. Trabajar en el repositorio

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # debe salir limpio: el compilador de React trata varios avisos como error
npm run build      # debe compilar antes de dar nada por terminado
npm run test       # pruebas de la lógica de transcripción (no necesitan Whisper)
npm run icons      # regenera los iconos de la PWA
```

Para las funciones de Python:

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt        # necesita ffmpeg en el PATH
```

Antes de dar por buena una tarea: `npm run lint` **y** `npm run build`. El build
detecta importaciones de Node en componentes de cliente, que es el error más fácil
de cometer aquí (por eso existe `lib/file-kinds.js` en paralelo a `fs-utils.js`).

---

## 8. Trampas conocidas

- **No importes `fs-utils.js` desde un componente de cliente.** Arrastra `fs` al
  bundle del navegador. Usa `lib/file-kinds.js`.
- **Los binarios se transmiten con rangos HTTP.** El vídeo necesita respuestas
  206 para poder buscar; no lo cambies por `readFile`.
- **El service worker nunca cachea `/api/`.** Las notas son la fuente de verdad y
  una respuesta obsoleta es peor que un error honesto. Tampoco cachea vídeo.
- **Los trabajos viven en memoria.** Un reinicio del servidor los pierde; los
  clientes que estén haciendo polling verán un 404. Es aceptable para una app de
  un solo usuario, pero tenlo presente si añades trabajos más largos.
- **`sessionStorage` guarda el token de Drive**, así que se pierde al cerrar la
  pestaña. Es deliberado: es un token OAuth.
- **El idioma de la interfaz es el español.** Los comentarios de código y los
  nombres de identificadores están en inglés. Mantén esa separación.
- **`scrollIntoView` arrastra a todos los contenedores con scroll**, incluida la
  página. En el lector de transcripciones eso metía el panel bajo la barra
  superior; por eso se mueve el `scrollTop` de la lista a mano cuando la lista es
  la que tiene el scroll.
- **Los eventos de `<video>`/`<audio>` no burbujean.** React los engancha
  directamente al elemento, pero un `Escape` en un menú dentro del panel del
  chat sí burbujea: si añades un popover ahí, corta la propagación o cerrarás
  también el panel entero.

---

## 9. Qué queda por hacer

`docs/ROADMAP.md` lleva la lista con prioridad y esfuerzo estimado.
