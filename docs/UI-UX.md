# Sistema de diseño y decisiones de interfaz

## Punto de partida

La versión anterior funcionaba, pero arrastraba los problemas típicos de una
interfaz crecida por acumulación:

- Un único tema oscuro fijo, con los colores escritos a mano en cada componente.
- Emojis usados como iconografía (`📘`, `🗃️`, `📝`): se ven distintos en cada
  sistema operativo, no heredan el color del texto y no escalan bien.
- `alert()`, `confirm()` y `prompt()` del navegador para todo el feedback.
- `window.location.reload()` después de cada guardado, perdiendo el scroll y el
  estado de la página.
- Tipografía y espaciados ad hoc en cada fichero, sin escala común.
- Móvil resuelto con un `!important` en un media query.

El rediseño ataca la causa, no los síntomas: primero un sistema de tokens, luego
componentes que solo consumen tokens.

---

## Tokens

Todo vive en `src/app/globals.css`. Ningún componente escribe un color literal.

### Color

La paleta clara se define en `:root`. El modo oscuro se redefine **dos veces**:

```css
:root { /* paleta clara: la definición base */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* oscuro por preferencia del sistema */ }
}

:root[data-theme="dark"] { /* oscuro por elección explícita */ }
```

La guarda `:not([data-theme="light"])` es lo que permite que alguien con el
sistema en oscuro fuerce el tema claro. Sin ella, la media query ganaría.

Los roles son semánticos, no descriptivos: `--surface`, `--text-muted`,
`--border-strong`, `--accent-soft`. Un componente pide «una superficie elevada»,
no «gris 800», así que el cambio de tema no necesita tocar componentes.

### Escalas

- **Tipografía**: nueve pasos de 11px a 36px, con altura de línea por rol.
- **Espaciado**: base de 4px, `--sp-1` a `--sp-16`.
- **Radios**: de 4px a completamente redondeado.
- **Elevación**: cinco sombras, redefinidas en oscuro (donde las sombras suaves
  son invisibles y hacen falta más opacas).
- **Movimiento**: dos curvas y tres duraciones. Todo se anula bajo
  `prefers-reduced-motion`.

---

## Iconografía

`components/ui/Icon.js` es un set SVG de un solo fichero, dibujado sobre una
retícula de 24×24 con `stroke="currentColor"`. Ventajas sobre los emojis:

- Heredan color y tamaño del contenedor, así que participan del sistema de temas.
- Se ven igual en macOS, Windows, Android y Linux.
- Pesan menos que una librería de iconos y no añaden dependencia.

Añadir un icono es añadir una clave a `PATHS`.

---

## Navegación

### Escritorio

Barra lateral fija con el árbol de proyectos, barra superior con migas derivadas
de la ruta, y una zona de contenido de ancho máximo acotado (`--content-max`)
para que el texto no se estire hasta ser incómodo de leer en pantallas anchas.

El árbol expande automáticamente la rama que lleva al proyecto abierto. El estado
de expansión se **deriva**, no se sincroniza:

```js
const open = manualOpen ?? (forceOpen || inPath);
```

`null` significa «sin decisión del usuario», así que la rama sigue a la búsqueda y
a la ruta activa hasta que alguien la abre o cierra a mano. Esto evita el efecto
en el que la búsqueda expande todo y luego no se puede colapsar nada.

### Móvil

Por debajo de 900px la barra lateral pasa a ser un cajón con velo, y aparece una
**barra inferior** con las cuatro acciones que de verdad se usan en un móvil:
panel, proyectos, buscar y asistente. Está abajo porque es donde llega el pulgar.

Todos los objetivos táctiles miden al menos 44px. La barra de pestañas de un
proyecto se desplaza en horizontal con *scroll snap* en lugar de comprimirse.

Las tablas se convierten en tarjetas por debajo de 900px. Una tabla con scroll
horizontal es de las peores cosas que se le pueden dar a un pulgar.

### Paleta de comandos

`⌘K` abre un buscador único sobre dos fuentes: los nombres de proyecto (filtrado
local, instantáneo) y el texto completo de las notas (con *debounce* de 220ms
contra `/api/search`). Navegación con flechas, apertura con Intro.

---

## Feedback

| Antes | Ahora |
|---|---|
| `alert('Saved!')` | Toast con tipo, icono y cierre |
| `confirm('Delete?')` | `<ConfirmDialog>` accesible |
| `prompt('Name:')` | `<Modal>` con formulario |
| `window.location.reload()` | `router.refresh()` |

Los toasts se apilan abajo a la derecha en escritorio y a lo ancho en móvil, por
encima de la barra inferior. Los modales atrapan el foco, cierran con Escape,
bloquean el scroll del fondo y devuelven el foco al elemento que los abrió. En
móvil suben desde abajo como hojas.

---

## Estados

Cada superficie que carga datos tiene tres estados diseñados, no dos:

- **Cargando**: esqueletos con la forma del contenido real, no un *spinner*
  centrado. El usuario ve la maqueta de lo que va a llegar.
- **Vacío**: icono, título y una frase que dice *qué hacer*, no solo que no hay
  nada. «Crea un `description.md` en la carpeta del proyecto» es útil; «Sin
  datos» no lo es.
- **Con datos**.

Y donde puede fallar, un cuarto: error con el mensaje real y una salida.

---

## Accesibilidad

- Contraste AA en ambos temas para texto y bordes.
- `:focus-visible` con anillo propio en todo elemento interactivo.
- `aria-pressed` en los conmutadores, `aria-selected` en las pestañas,
  `role="checkbox"` con `aria-checked` en las casillas propias.
- `aria-live` en la región de toasts.
- Toda la navegación por teclado: flechas en la paleta y el visor de imágenes,
  Escape para cerrar, `⌘S` para guardar.
- La animación se anula con `prefers-reduced-motion`.
- Áreas seguras de iOS respetadas con `env(safe-area-inset-*)`.

---

## Nota sobre `styled-jsx`

`styled-jsx` añade su clase de ámbito solo a los elementos DOM escritos en ese
JSX. Un `className` pasado a un **componente** (`<Link>`, `<Icon>`) llega al DOM
sin esa clase, y la regla no se aplica.

Es un fallo silencioso: no hay error, simplemente el estilo no aparece. En este
repo afectaba a la barra lateral, las tarjetas del panel y las migas. La solución
es envolver esos selectores en `:global()`, eligiendo nombres únicos porque dejan
de estar aislados.

---

## Rendimiento

- El script inline de tema evita el destello blanco antes de la hidratación.
- Las fuentes usan `display: swap`.
- El scroll se lee dentro de un `requestAnimationFrame`, no en cada evento.
- El SDK de Google Identity se carga solo al abrir el diálogo de Drive.
- Las imágenes de galería usan `loading="lazy"`.
- Las pestañas solo piden sus datos cuando se abren.
