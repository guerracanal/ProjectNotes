# Ideas de mejora

Propuestas ordenadas por relación valor/esfuerzo. Nada de esto está implementado;
es material para decidir qué viene después.

**Esfuerzo**: 🟢 horas · 🟡 un día · 🔴 varios días

---

## 1. Lo que más rentabiliza el trabajo ya hecho

### 1.1 Acciones del asistente sobre los ficheros 🔴

Hoy el asistente lee. El salto grande es que **escriba**, con confirmación.

Con *tool use* de Claude podría:

- «Crea una tarea en Portal para revisar los textos con legal» → añade la línea a
  `tasks.md`.
- «Convierte los acuerdos de la última reunión en tareas» → lee la transcripción,
  propone N tareas, tú aceptas o descartas una a una.
- «Redacta el acta del kickoff» → crea `acta_kickoff.md`.
- «Marca como hecha la tarea de los textos».

Clave de diseño: **nunca escribir sin confirmación explícita**. El asistente
propone un diff, la interfaz lo muestra, la persona acepta. Es lo que separa un
asistente útil de uno en el que no se puede confiar.

### 1.2 Tareas con fecha, prioridad y etiquetas 🟡

`tasks.md` ya guarda una fecha de creación. Extender la sintaxis manteniendo la
compatibilidad con markdown:

```markdown
- [ ] Revisar textos con legal @2026-09-15 !alta #legal #portal
```

Habilita: vista «vence esta semana», ordenar por prioridad, filtrar por etiqueta
y avisos de vencimiento. El parser vive en un solo sitio (`task-parser.js`) y
cualquier otra herramienta sigue leyendo el fichero como una lista normal.

### 1.3 Panel con línea temporal 🟡

Una vista de «qué ha pasado» que cruce fechas de modificación de ficheros,
transcripciones nuevas y tareas completadas. Toda la información ya está en el
índice; falta la vista.

### 1.4 Enlaces entre notas 🟡

Soportar `[[wikilinks]]` y una lista de retroenlaces al pie de cada nota. Es lo
que convierte una carpeta de notas en un cuerpo de conocimiento conectado, y el
índice de conocimiento ya recorre todos los ficheros: extraer los enlaces es una
pasada más.

### 1.5 Vista de grafo 🔴

La consecuencia visual de lo anterior: proyectos y notas como nodos, enlaces y
menciones como aristas. Útil de verdad cuando hay más de cincuenta notas.

---

## 2. Reuniones y transcripciones

### 2.1 Transcripción con marcas de tiempo y hablantes 🔴

Whisper devuelve segmentos con `start`/`end` que hoy se descartan. Guardándolos en
JSON junto al `.txt` se consigue:

- Transcripción **clicable**: pulsar un párrafo salta a ese momento del vídeo.
- El texto se resalta conforme avanza la reproducción.
- Con `pyannote.audio`, además, diarización: quién dijo qué.

Es la mejora que más cambia la experiencia de una reunión grabada.

### 2.2 El asistente cita el minuto exacto 🟡

Con lo anterior, una cita puede llevar a `kickoff.mp4#t=847` en lugar de solo al
fichero. Verificar una afirmación pasa de leer una transcripción entera a un clic.

### 2.3 Cola de transcripción 🟡

Hoy los trabajos viven en memoria y se pierden al reiniciar. Persistirlos en
`.projectnotes/jobs.json` con una cola permite: encolar varios vídeos, ver el
progreso real (Whisper reporta porcentaje), reanudar tras un reinicio y recibir un
aviso al terminar.

### 2.4 Audio además de vídeo 🟢

Whisper acepta `.mp3`, `.m4a` y `.wav` directamente. Es ampliar la detección de
extensiones y añadir un `<audio>`. Notas de voz como fuente de primera clase.

### 2.5 Resumen con proveedor configurable 🟢

`resumen_transcripcion.py` está atado a Gemini. Ya existe la infraestructura para
hablar con Claude; unificarlo evita necesitar dos claves.

---

## 3. Búsqueda y navegación

### 3.1 Búsqueda avanzada 🟡

Operadores en la paleta: `proyecto:portal`, `tipo:transcripcion`, `desde:2026-01`,
`"frase exacta"`, `-excluida`. El índice ya guarda los metadatos.

### 3.2 Búsquedas guardadas y vistas 🟡

Guardar una consulta como vista fija en la barra lateral: «todo lo etiquetado
#legal», «reuniones de este trimestre».

### 3.3 Historial de navegación 🟢

`Ctrl+↑`/`Ctrl+↓` para moverse por los ficheros visitados recientemente, como en
un IDE.

### 3.4 Búsqueda dentro de la nota abierta 🟢

`Ctrl+F` propio, con resaltado, sin depender del buscador del navegador.

---

## 4. Editar

### 4.1 Autoguardado con historial local 🟡

Guardar con *debounce* y mantener las últimas N versiones en
`.projectnotes/history/`. Elimina el «¿guardé?» y da una red de seguridad sin
obligar a usar git.

### 4.2 Editor de markdown con vista dividida 🔴

Editor y previsualización en paralelo con scroll sincronizado. Sustituir el
`<textarea>` por CodeMirror 6 daría además resaltado de sintaxis, plegado y
autocompletado de `[[enlaces]]`.

### 4.3 Plantillas 🟢

`.projectnotes/templates/` con plantillas para acta de reunión, nota de decisión,
retrospectiva. Un desplegable al crear una nota.

### 4.4 Pegar imágenes dentro del editor 🟢

Hoy el pegado de imágenes funciona en la pestaña Imágenes. Hacerlo dentro del
editor de notas, insertando la referencia markdown en el punto del cursor, es el
gesto que la gente espera.

---

## 5. Datos y sincronización

### 5.1 Git como historial 🟡

Si `projects_data/` es un repositorio git, ofrecer commit automático y una vista
de historial por fichero. Versionado completo sin inventar nada.

### 5.2 Sincronización incremental con Drive 🟡

La pasada actual lista todos los ficheros cada vez. La API de Drive expone
`changes.list` con un *page token*, que reduce una sincronización sin cambios a
una sola petición.

### 5.3 Resolución de conflictos 🟡

Hoy gana el más reciente. Cuando ambos lados cambian, conservar las dos versiones
y mostrar un diff en lugar de perder una en silencio.

### 5.4 Exportar 🟢

Un proyecto a PDF, a un ZIP de markdown, o a HTML estático para compartir.

---

## 6. Producto

### 6.1 Vista de kanban 🔴

Las tareas de un proyecto como tablero, con el estado en el propio markdown. Para
quien piensa en columnas y no en listas.

### 6.2 Widgets configurables en el panel 🟡

Elegir y ordenar qué aparece: tareas, actividad reciente, próximas reuniones,
notas fijadas.

### 6.3 Favoritos y recientes 🟢

Fijar proyectos arriba en la barra lateral y una sección de «visitados
recientemente». Con más de treinta proyectos, el árbol solo no basta.

### 6.4 Modo enfoque 🟢

Ocultar toda la interfaz salvo el editor. Un atajo.

---

## 7. Robustez

### 7.1 Tests 🔴

El proyecto no tiene ninguno. Por orden de valor:

1. `getSafePath()` — es el control de seguridad principal.
2. `task-parser` y `talks-parser` — cambian y se rompen fácil.
3. El troceado y BM25 — un fallo silencioso aquí degrada el asistente sin avisar.
4. Un test end-to-end del ciclo crear → editar → guardar → buscar.

### 7.2 Vigilar el sistema de ficheros 🟡

Con `chokidar` sobre `projects_data/`, los cambios externos se reflejarían al
instante y el índice se actualizaría solo, en vez de esperar a la siguiente
consulta.

### 7.3 Índice incremental 🟡

Hoy un cambio en un fichero reconstruye todo el índice. Con miles de ficheros eso
empieza a notarse; reindexar solo lo que cambió es directo con la huella actual.

### 7.4 Autenticación opcional 🟡

Un modo con contraseña, para quien quiera exponer la app en su red local. Hoy la
recomendación es no exponerla.

### 7.5 TypeScript 🔴

Con los límites de datos ya documentados, migrar `lib/` primero daría la mayor
parte del beneficio con la menor parte del trabajo.

---

## 8. Ideas más especulativas

- **Resúmenes automáticos por proyecto**: un `_resumen.md` regenerado cuando el
  proyecto cambia mucho, para tener el estado de un vistazo.
- **Detección de duplicados**: avisar de notas que dicen casi lo mismo.
- **Preguntas sugeridas**: a partir del contenido reciente, proponer qué preguntar.
- **Repaso semanal**: un resumen de lo hecho, lo pendiente y lo estancado.
- **Modo dictado**: grabar una nota de voz desde el navegador y transcribirla.
- **OCR de imágenes**: indexar el texto de las capturas para que aparezcan en la
  búsqueda.
- **Compartir de solo lectura**: publicar un proyecto como HTML estático con un
  enlace.

---

## Sugerencia de orden

Si hubiera que elegir, este es el orden que más valor da por unidad de trabajo:

1. **Transcripción con marcas de tiempo** (2.1 + 2.2) — es lo que transforma la
   parte de reuniones, que hoy es lo más flojo del producto.
2. **Acciones del asistente** (1.1) — convierte el chat de consulta en herramienta.
3. **Tareas con fecha y prioridad** (1.2) — poco esfuerzo, uso diario.
4. **Tests de `getSafePath` y los parsers** (7.1) — barato, y protege lo que ya
   funciona.
5. **Enlaces entre notas** (1.4) — el efecto compuesto crece con el tiempo, así
   que cuanto antes empiece, mejor.
