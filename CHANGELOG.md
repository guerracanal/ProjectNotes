# Changelog

Todos los cambios reseñables de ProjectNotes.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y el versionado sigue [SemVer](https://semver.org/lang/es/).

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
