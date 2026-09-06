# Arquitectura

## Principio rector

El sistema de ficheros es la base de datos. Todo lo que ves en la app existe como
un fichero que puedes abrir con cualquier editor, versionar con git y sincronizar
con cualquier herramienta. La app es una **vista** sobre esos ficheros, nunca su
dueña.

Esto descarta de entrada varias soluciones que serían cómodas — una base de datos
con el estado de las tareas, un formato binario para las notas, un índice que sea
la única fuente de verdad — y a cambio garantiza que tus datos te sobreviven a la
app.

## Vista general

```
┌──────────────────────────────────────────────────────────────┐
│  Navegador                                                   │
│                                                              │
│  AppShell ── Sidebar · Topbar · MobileNav · CommandPalette   │
│      │                                                       │
│      ├── Panel ────── métricas · tareas · explorador         │
│      ├── Proyecto ─── pestañas (notas, tareas, reuniones…)   │
│      └── ChatPanel ── SSE + chips de fuente                  │
└───────────────────────────┬──────────────────────────────────┘
                            │ fetch
┌───────────────────────────┴──────────────────────────────────┐
│  Next.js (App Router, Node)                                  │
│                                                              │
│  Server components  →  lectura directa del disco              │
│  Route handlers     →  /api/projects · /api/search            │
│                        /api/chat · /api/knowledge             │
│                        /api/transcribe · /api/summarize       │
│                        /api/sync/gdrive                       │
│                                                              │
│  lib/fs-utils.js  ← única puerta al disco (getSafePath)       │
│  lib/knowledge/   ← troceado · BM25 · embeddings · prompt     │
│  lib/run-script.js← execFile hacia los scripts de Python      │
└───────────────────────────┬──────────────────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
  projects_data/     .projectnotes/        Servicios externos
  (fuente de         (caché del índice,    (Anthropic, Gemini,
   verdad)            reconstruible)        Google Drive)
```

## Flujo de datos

### Leer un proyecto

`/project/[...path]` es un **server component**. Lee el directorio, cruza los
vídeos con sus transcripciones y resúmenes por convención de nombres, y pasa todo
a `ProjectView` como props. No hay fetch en el cliente para el primer render.

Las pestañas que necesitan datos que no vienen en el primer render (imágenes,
charlas) los piden a la API cuando se abren, no antes.

### Escribir

Toda escritura va a `/api/projects/...` y desemboca en `saveFile()` /
`createFolder()` / `deleteEntry()` en `fs-utils.js`. Después, el cliente llama a
`router.refresh()`, que vuelve a ejecutar el server component y recompone la
página con el estado real del disco. No hay estado duplicado entre cliente y
fichero.

Cada escritura marca el índice de conocimiento como obsoleto.

### Trabajos largos

Transcribir un vídeo tarda minutos. El flujo es:

1. `POST /api/transcribe` valida la ruta, crea un trabajo y devuelve un `jobId`
   inmediatamente.
2. El proceso de Python corre en segundo plano y escribe su resultado en disco.
3. El cliente hace polling de `GET /api/transcribe?jobId=…` cada 2 segundos y va
   mostrando `stdout`/`stderr`.

Se usa polling y no SSE a propósito: el trabajo puede sobrevivir a que el usuario
cierre el diálogo, y así el servidor no mantiene una conexión por cliente.

Los trabajos viven **en memoria** (`lib/job-store.js`), con poda por antigüedad y
por número. Un reinicio del servidor los pierde; el fichero resultante, no.

## Seguridad

La app ejecuta procesos y toca el disco, así que las dos superficies de ataque
obvias son el recorrido de rutas y la inyección de comandos.

### Recorrido de rutas

Todas las rutas pasan por `getSafePath()`:

```js
const resolved = path.resolve(PROJECTS_DIR, normalized);
if (resolved !== PROJECTS_DIR && !resolved.startsWith(PROJECTS_DIR + path.sep)) {
  throw new Error('Invalid path: outside of projects directory');
}
```

Tres detalles que importan:

- Comparar contra `PROJECTS_DIR + path.sep` y no contra `PROJECTS_DIR` a secas.
  Con lo segundo, una carpeta hermana llamada `projects_data_backup` comparte el
  prefijo y pasa la comprobación. Era el comportamiento anterior.
- Quitar las barras iniciales antes de resolver, para que una entrada con pinta
  de ruta absoluta no pueda re-enraizar.
- Rechazar bytes NUL, que truncan la cadena en la llamada al sistema.

Además, los nombres de fichero en las escrituras se rechazan si contienen barras.

### Inyección de comandos

Los scripts de Python se lanzan con `execFile`, que entrega los argumentos
directamente al proceso, sin shell intermedia. Con `exec` — el comportamiento
anterior — un vídeo llamado `a; rm -rf ~.mp4` ejecutaría ese `rm`.

### Lo que la app *no* hace

No hay autenticación ni autorización. Está pensada para `localhost`. Si la
expones, ponla detrás de un proxy con autenticación; cualquiera que llegue al
puerto puede leer y escribir en `projects_data/` y lanzar transcripciones.

## Decisiones y sus motivos

**Sin TypeScript.** El proyecto venía en JavaScript y migrarlo no era lo que se
pedía. Los límites de datos son estrechos y están documentados. Si algún día se
migra, `lib/` es el sitio por donde empezar.

**Sin librería de componentes.** Seis dependencias de producción es una de las
mejores propiedades de este proyecto. Un sistema de tokens más `styled-jsx` cubre
todo lo que hace falta, y los componentes están coubicados con sus estilos.

**Sin base de datos vectorial.** Un corpus de notas personales son miles de
fragmentos, no millones. Un escaneo lineal con similitud coseno tarda
milisegundos y evita un servicio más que mantener.

**Server components para leer, API para escribir.** La lectura se beneficia de
estar junto al disco; la escritura necesita ser explícita y validable en un solo
sitio.

**El índice es una caché.** Se guarda en `.projectnotes/`, que está en
`.gitignore`. Borrarlo no pierde nada; se reconstruye en la siguiente consulta.
La huella se calcula sobre rutas, tamaños y fechas, así que un cambio hecho fuera
de la app también invalida el índice.
