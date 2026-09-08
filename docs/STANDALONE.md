# Versión standalone

Un paquete autocontenido que arranca con `node server.js`. Sin `npm install`,
sin Next instalado, sin proceso de build en la máquina donde corre.

```bash
npm run build:standalone
cd standalone
node server.js
```

O, desde la raíz del proyecto, `npm run start:standalone`.

La carpeta pesa unos 18 MB y contiene el servidor, los estáticos, `public/`,
las dependencias que el código alcanza de verdad y los scripts de Python.

Al lado queda **`standalone.zip`** (unos 4 MB) con lo mismo dentro, para
copiarlo a otra máquina de una pieza. Descomprimir y `node server.js`.
Con `--no-zip` se salta ese paso si solo vas a usarlo en local.

---

## Para qué sirve

`npm run dev` es para desarrollar: recompila, vigila ficheros y consume
memoria. `npm start` es lo mismo pero en producción, y sigue necesitando el
`node_modules` completo (unos 400 MB) y el proyecto entero.

El paquete standalone es lo que quieres cuando la app deja de ser algo que
estás tocando y pasa a ser algo que usas:

- Arrancarla en un portátil o un mini PC sin instalar dependencias.
- Dejarla corriendo en la red local para entrar desde el móvil o la tablet
  (que es lo que hace falta para instalar la PWA — ver [PWA-Y-APK.md](PWA-Y-APK.md)).
- Copiarla a un servidor o a un NAS con un `scp` de una carpeta.
- Arrancarla al encender el equipo, con un servicio o una tarea programada.

## Cómo se genera

`scripts/build-standalone.mjs` hace cuatro cosas:

1. `next build`, con `output: 'standalone'` en `next.config.mjs`. Next deja en
   `.next/standalone` el servidor y solo las dependencias que el código
   alcanza, rastreadas desde los imports.
2. Copia los estáticos y `public/`. Next **no** los incluye: está documentado
   y es el fallo clásico de la primera build standalone (la app carga sin
   estilos y con los iconos rotos).
3. Copia los scripts de Python, que el servidor lanza como subproceso al
   transcribir o resumir. Sin ellos esas dos acciones fallan.
4. Escribe el `server.js` de entrada, un envoltorio sobre el de Next, y un
   `package.json` mínimo con un solo script (`start`). Es a propósito: Next
   copia el del repo entero, con todos sus scripts, y eso convierte la carpeta
   en una trampa —un `npm run build:standalone` desde dentro ejecutaría el
   script del proyecto con el directorio de trabajo cambiado.
5. Comprime la carpeta en `standalone.zip`, sin depender de que haya `zip` o
   `tar` instalados: el formato lo escribe `scripts/lib/zip.mjs`.

La carpeta se borra y se rehace en cada build, así que **no editar nada dentro**.
El envoltorio vive en `scripts/templates/standalone-server.js`.

`standalone/` está en `.gitignore`: lleva `node_modules` dentro, así que se
genera, no se versiona.

### Por qué hay un envoltorio

El `server.js` que genera Next arranca el servidor y nada más: no lee ficheros
`.env` ni sabe dónde está `projects_data`. El nuestro resuelve las dos cosas y
después le cede el control (queda como `next-server.js`). Al arrancar imprime
lo que ha decidido, para que no haya que adivinarlo:

```
ProjectNotes (standalone)
  datos    /home/jorge/ProjectNotes/projects_data
  índice   /home/jorge/ProjectNotes/.projectnotes
  python   /home/jorge/ProjectNotes/venv/bin/python3
  entorno  .env.local
  http://localhost:3000
```

## Qué usa y de dónde

| Qué | Por defecto | Variable |
| --- | --- | --- |
| Proyectos | `./projects_data`, y si no existe, `../projects_data` | `PROJECTS_DIR` |
| Índice del asistente | `.projectnotes/` junto a los proyectos | `PROJECTNOTES_INDEX_DIR` |
| Claves y ajustes | `.env.local` y `.env` de la carpeta, luego los del padre | — |
| Python | `venv/` o `.venv/` de la carpeta o del padre | `PYTHON_BIN` |
| Puerto | 3000 | `PORT` |

Mirar en la carpeta padre es deliberado, no adivinación: mientras el paquete
viva dentro del repo, `../projects_data` **es** el `projects_data` de siempre.
Así la versión standalone y `npm run dev` trabajan sobre los mismos ficheros,
las mismas claves y el mismo índice, en vez de sobre dos copias que se separan
a la primera edición.

Lo que ya venga del entorno real gana siempre sobre los ficheros `.env`:

```bash
PORT=8080 PROJECTS_DIR=/mnt/nas/notas node server.js
```

## Llevárselo a otra máquina

Copiar la carpeta entera, o llevarse `standalone.zip` y descomprimirlo allí. Necesita Node 20 o superior y nada más. Allí:

1. Un `projects_data/` dentro de la carpeta, o `PROJECTS_DIR` apuntando a él.
   Si no hay ninguno, arranca vacío y lo crea.
2. Un `.env.local` con las claves, si quieres el asistente. **Sin clave la app
   funciona igual**: el chat queda desactivado y la búsqueda global sigue
   operativa, porque el índice léxico no usa la red.
3. Un `venv` con `pip install -r requirements.txt`, solo si vas a transcribir o
   resumir desde esa máquina. Necesita además `ffmpeg` en el PATH.

Como el paquete ya no tiene un directorio padre con datos, las rutas se
resuelven dentro de la propia carpeta.

## Arrancarlo solo

**Linux (systemd)** — `/etc/systemd/system/projectnotes.service`:

```ini
[Unit]
Description=ProjectNotes
After=network.target

[Service]
WorkingDirectory=/opt/projectnotes
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Restart=on-failure
User=jorge

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now projectnotes
```

**Windows** — un `.bat` en la carpeta de Inicio:

```bat
@echo off
cd /d C:\ProjectNotes\standalone
node server.js
```

Para entrar desde el móvil hace falta la IP del equipo en la red local
(`ipconfig` o `ip addr`), y que el firewall deje pasar el puerto. El servidor
ya escucha en `0.0.0.0`.

## Límites conocidos

- **`/.well-known/assetlinks.json` se genera al compilar**, no al arrancar. Si
  configuras `ANDROID_PACKAGE_ID` y `ANDROID_SHA256_FINGERPRINT` después de
  hacer el paquete, hay que rehacerlo para que ese fichero aparezca. Solo
  afecta al APK de Android.
- **El paquete queda atado al Node de la máquina que lo generó** en lo que
  toca a dependencias nativas. Ahora mismo no hay ninguna, así que se puede
  mover entre Linux, macOS y Windows sin más; si algún día se añade una, habrá
  que generarlo en la plataforma destino.
- **No hay HTTPS.** Está pensado para red local. Para exponerlo fuera, un
  proxy inverso delante (Caddy, nginx) y autenticación, porque la app no tiene
  usuarios: quien llega, entra.
