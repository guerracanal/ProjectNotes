# PWA e instalación en Android

ProjectNotes es una aplicación web instalable. En móvil y tablet se abre a
pantalla completa, con su icono y su splash, indistinguible de una app nativa.

---

## Qué incluye

| Pieza | Fichero |
|---|---|
| Manifiesto | `public/manifest.webmanifest` |
| Service worker | `public/sw.js` |
| Página offline | `public/offline.html` |
| Iconos | `public/icons/` (generados con `npm run icons`) |
| Registro | `src/components/ServiceWorkerRegistrar.js` |
| Aviso de instalación | `src/components/InstallPrompt.js` |
| Metadatos | `src/app/layout.js` |

---

## Instalar

La PWA necesita **HTTPS** o `localhost`. Con la app servida:

**Android / Chrome**
Aparece el aviso de instalación en la propia app, o *Menú ⋮ → Instalar aplicación*.

**iOS / iPadOS / Safari**
*Compartir → Añadir a pantalla de inicio*. iOS no expone `beforeinstallprompt`,
así que la app detecta Safari en iOS y muestra esas instrucciones en su lugar.

**Escritorio (Chrome, Edge)**
Icono de instalación en la barra de direcciones.

> Para probarlo en local hace falta `npm run build && npm run start`: el service
> worker está deshabilitado en desarrollo a propósito, porque cachearía los
> chunks de Turbopack y servirías código antiguo después de cada edición.

---

## Estrategia de caché

Es deliberadamente conservadora. Tus notas son la fuente de verdad, y una
respuesta obsoleta es peor que un error honesto.

| Tipo de petición | Estrategia | Por qué |
|---|---|---|
| Navegación | Red primero, `offline.html` de reserva | Contenido siempre fresco, sin pantalla de error del navegador |
| Estáticos (`/_next/static/`, iconos, fuentes) | *Stale-while-revalidate* | Arranque instantáneo, se actualiza solo |
| `/api/*` | **Nunca se cachea** | Las notas cambian; servir una versión vieja engaña |
| Vídeo | **Nunca se cachea** | Un vídeo de reunión llenaría el almacenamiento |

Las cachés llevan versión (`projectnotes-shell-v2`). Al activarse una versión
nueva se borran las anteriores y el worker toma el control de inmediato, así que
un despliegue nuevo no deja media app antigua en pantalla.

### Regenerar los iconos

```bash
npm run icons
```

`scripts/generate-icons.mjs` dibuja la marca en un búfer RGBA y la codifica como
PNG a mano con `zlib`, además de generar el `favicon.ico`. Se hace así para no
añadir `sharp` ni `canvas` —una dependencia nativa entera— por cinco ficheros
estáticos. Para cambiar la marca, edita `drawIcon()`.

---

## Empaquetar un APK de Android

Un APK «real» se consigue envolviendo la PWA en una **Trusted Web Activity**: una
app Android que abre tu sitio a pantalla completa, sin barra de direcciones, con
su entrada en el cajón de aplicaciones. Es lo que hacen Twitter Lite o Starbucks.

**Requisito previo**: la app debe estar accesible en un dominio HTTPS público. Una
TWA carga el sitio en vivo; no empaqueta el código.

### Opción A — PWABuilder (sin instalar nada)

1. Despliega ProjectNotes en un dominio HTTPS.
2. Ve a <https://www.pwabuilder.com> y pega la URL.
3. *Package for stores → Android*.
4. Descarga el `.zip`: trae el APK firmado, el AAB para Google Play y el fichero
   `assetlinks.json`.
5. Publica ese `assetlinks.json` (ver más abajo).

### Opción B — Bubblewrap en local

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://TU-DOMINIO/manifest.webmanifest
bubblewrap build
```

Genera `app-release-signed.apk` y `app-release-bundle.aab`.

El repositorio incluye `android/twa-manifest.json` con los colores, iconos y
atajos ya configurados. Sustituye `REPLACE_WITH_YOUR_DOMAIN` por tu dominio.

### Opción C — GitHub Actions

`.github/workflows/android-apk.yml` hace la compilación en CI. Ejecútalo a mano
desde la pestaña Actions indicando tu dominio.

Secretos necesarios:

| Secreto | Contenido |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Tu `.keystore` en base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Contraseña del almacén |
| `ANDROID_KEY_PASSWORD` | Contraseña de la clave |

Crear un keystore:

```bash
keytool -genkey -v -keystore android.keystore \
  -alias projectnotes -keyalg RSA -keysize 2048 -validity 10000

base64 -w 0 android.keystore   # pega el resultado en el secreto
```

> Guarda ese keystore. Sin él no puedes publicar actualizaciones de la app en
> Google Play, nunca.

---

## Digital Asset Links

Sin este paso, Android muestra la barra de direcciones dentro de la app y se
nota que es una web. Con él, pantalla completa de verdad.

ProjectNotes sirve el fichero desde `src/app/.well-known/assetlinks.json/route.js`,
condicionado a dos variables de entorno:

```bash
ANDROID_PACKAGE_ID=com.projectnotes.twa
ANDROID_SHA256_FINGERPRINT=AB:CD:EF:...
```

La huella la imprime Bubblewrap al compilar; también se saca así:

```bash
keytool -list -v -keystore android.keystore -alias projectnotes
```

Sin configurar, la ruta devuelve 404. Es deliberado: un fichero de ejemplo con
valores falsos haría fallar la verificación en silencio, que es peor que no
tenerlo.

Verifica el resultado en
<https://developers.google.com/digital-asset-links/tools/generator>.

---

## Tablet

El diseño ya es responsive de 320px hacia arriba. En tablets (768–1024px):

- La barra lateral se mantiene visible en horizontal y pasa a cajón en vertical.
- Las rejillas se reajustan por espacio disponible, no por punto de ruptura.
- Todos los objetivos táctiles miden 44px o más.
- `viewport-fit=cover` y `env(safe-area-inset-*)` para pantallas con muesca.

Con `display: standalone` en el manifiesto, una tablet Android instala la misma
PWA sin nada extra. Para iPad, *Añadir a pantalla de inicio*.

---

## Comprobaciones

```bash
npm run build && npm run start
```

Con Chrome DevTools:

- **Application → Manifest**: sin errores, iconos cargados.
- **Application → Service Workers**: activo y en ejecución.
- **Network → Offline** y recarga: debe aparecer la página offline.
- **Lighthouse → PWA**: instalable.

Lo que este proyecto verifica en cada revisión: el service worker se registra y
activa, cachea el shell, y una navegación sin red devuelve `offline.html` en vez
del error del navegador.
