# Configuración de Transcripción de Video en Linux/Unix

Documentación de configuración y setup para hacer funcionar los scripts de transcripción en Linux/Unix (Ubuntu, Debian, macOS, etc.).

## Ventajas en Linux/Unix

En comparación con Windows, Linux/Unix maneja mejor:
- **Rutas con espacios:** Soportadas nativamente sin problemas
- **Encoding UTF-8:** Es el estándar por defecto
- **FFmpeg:** Disponible en repositorios oficiales
- **Variables de entorno:** Más simples de configurar

## Instalación de Dependencias

### 1. FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**macOS (con Homebrew):**
```bash
brew install ffmpeg
```

**Fedora/RHEL:**
```bash
sudo dnf install ffmpeg
```

**Arch Linux:**
```bash
sudo pacman -S ffmpeg
```

Verificar instalación:
```bash
ffmpeg -version
```

### 2. Python y Virtual Environment

**Ubuntu/Debian:**
```bash
sudo apt-get install python3 python3-pip python3-venv
```

**macOS:**
```bash
# Si no tienes Python instalado
brew install python@3.12
# O usar el Python que viene con macOS
```

### 3. Dependencias del Proyecto

1. Crear virtual environment:
```bash
python3 -m venv .venv
```

2. Activar virtual environment:
```bash
source .venv/bin/activate
```

3. Instalar dependencias Python:
```bash
pip install -r requirements.txt
```

## Configuración de Variables de Entorno (API Keys)

### 1. Google Gemini API Key

El script `scripts/resumen_transcripcion.py` requiere una API key de Google Gemini.

**⚠️ IMPORTANTE - Seguridad:** Nunca incluyas API keys en el código. Siempre usa variables de entorno.

### 2. Google OAuth Client ID (Para Google Drive Sync)

Para Google Drive Sync sin requerir login cada vez, puedes configurar tu Google OAuth Client ID en `.env`.

### Configuración en Linux/Unix

#### Opción 1: Archivo `.env` (Recomendado para desarrollo local)

1. Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```

2. Abre `.env` y agrega tus configuraciones:
```
GEMINI_API_KEY=tu_api_key_aqui
GOOGLE_OAUTH_CLIENT_ID=tu_client_id_aqui
```

3. El script automáticamente cargará estas variables usando `python-dotenv`

#### Opción 2: Variables de entorno del sistema (Para producción o uso permanente)

**Opción A: En el profile del usuario (bash/zsh)**

1. Edita `~/.bashrc` o `~/.zshrc`:
```bash
nano ~/.bashrc
```

2. Agrega las variables al final del archivo:
```bash
export GEMINI_API_KEY="tu_api_key_aqui"
export GOOGLE_OAUTH_CLIENT_ID="tu_client_id_aqui"
```

3. Guarda (Ctrl+O, Enter, Ctrl+X) y recarga el shell:
```bash
source ~/.bashrc
```

**Opción B: En `/etc/environment` (Para todo el sistema, requiere sudo)**

```bash
sudo nano /etc/environment
```

Agrega las variables:
```bash
GEMINI_API_KEY="tu_api_key_aqui"
GOOGLE_OAUTH_CLIENT_ID="tu_client_id_aqui"
```

Guarda y reinicia sesión.

**Opción C: Archivo systemd (Para servicios/aplicaciones en producción)**

Si la app se ejecuta como servicio, crea archivo `.env.systemd`:
```bash
# Archivo de ejemplo para systemd
# Esto se pasaría al servicio con EnvironmentFiles=
GEMINI_API_KEY=tu_api_key_aqui
GOOGLE_OAUTH_CLIENT_ID=tu_client_id_aqui
```

### Obtener tus Keys

#### Google Gemini API Key
1. Ve a: https://aistudio.google.com/app/apikey
2. Haz login con tu cuenta de Google
3. Click en "Create API key"
4. Copia la key generada
5. Pégala en tu `.env` o variables de entorno

#### Google OAuth Client ID
1. Ve a: https://console.cloud.google.com/
2. Crea un nuevo proyecto e introduce el nombre
3. Busca "Google Drive API" y actívala
4. Ve a "Credenciales" → "Crear credenciales" → "ID de cliente de OAuth"
5. Selecciona "Aplicación web"
6. En "Orígenes de JavaScript autorizados" agrega: `http://localhost:3000`
7. Haz clic en "Crear" y copia tu Client ID
8. Pégala en tu `.env` o variables de entorno

### Persistencia de Google Drive Login

Una vez configurado el Google OAuth Client ID en `.env`:

- El Client ID se carga automáticamente en Google Drive Sync
- El login persiste entre sesiones (se guarda en localStorage)
- **Nota**: Los tokens de acceso expiran cada ~1 hora. Si se vencen, deberás hacer login nuevamente.

## Archivos Modificados

- `scripts/transcribir_video.py` - Agregado soporte UTF-8 y reemplazados emojis
- `scripts/resumen_transcripcion.py` - Agregado soporte UTF-8, reemplazados emojis, y API key movida a variables de entorno
- `requirements.txt` - Agregado `google-generativeai` y `python-dotenv`
- `.env.example` - Archivo de ejemplo para configuración de variables de entorno (copiar a `.env`)

## Testing en Linux/Unix

Para verificar que todo funciona:

1. Instalar dependencias (si no lo has hecho):
```bash
sudo apt-get install ffmpeg python3 python3-pip python3-venv
```

2. Crear y activar virtual environment:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. Configurar `.env`:
```bash
cp .env.example .env
nano .env  # Edita y agrega tus keys
```

4. Probar transcripción:
```bash
python scripts/transcribir_video.py "ruta/al/video.mp4"
```

5. Probar resumen:
```bash
python scripts/resumen_transcripcion.py "ruta/al/transcripcion.txt"
```

6. Probar Google Drive Sync:
   - Abre la aplicación en http://localhost:3000
   - Ve a Google Drive Sync
   - Si configuraste `GOOGLE_OAUTH_CLIENT_ID` en `.env`, se cargará automáticamente
   - Si no, ingresa tu Client ID manualmente
   - Haz clic en "Conectar con Google Drive"
   - **Importante**: En la ventana emergente de Google, marca la casilla para permitir acceso a Google Drive
   - Una vez conectado, el login persistirá entre sesiones

## Uso con Docker (Opcional)

Si quieres ejecutar en Docker:

1. Crea `Dockerfile`:
```dockerfile
FROM python:3.12-slim

# Instalar FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Copiar .env al contenedor
COPY .env .

CMD ["python", "scripts/transcribir_video.py"]
```

2. Construye e ejecuta:
```bash
docker build -t project-notes .
docker run --env-file .env -v $(pwd)/projects_data:/app/projects_data project-notes
```

## Notas Importantes

- **FFmpeg:** Esencial para procesar videos. Sin él, el script fallará al intentar extraer audio
- **Encoding UTF-8:** Linux/Unix usa UTF-8 por defecto, compatible con caracteres especiales
- **Rutas con espacios:** Funcionan correctamente en Linux/Unix, pero encapsula entre comillas en scripts para ser seguro
- **Permisos:** Si usas variables de entorno en archivos, asegúrate de que `.env` solo sea legible por ti:
  ```bash
  chmod 600 .env
  ```
- **API Keys:** Nunca commits `.env` al repositorio. Usa `.gitignore` (ya incluido)

## Diferencias con Windows

| Característica | Windows | Linux/Unix |
|---|---|---|
| Activar venv | `.\.venv\Scripts\Activate.ps1` | `source .venv/bin/activate` |
| Instalar FFmpeg | Manual desde sitio web | `apt-get install ffmpeg` |
| Encoding | Requiere config extra (UTF-8) | UTF-8 por defecto |
| Variables de entorno | Panel de control | `~/.bashrc` o `/etc/environment` |
| Path separator | `\` | `/` |
| Comando copia archivo | `copy` | `cp` |

## Próximas Mejoras

- [x] Documentación para Linux/Unix
- [x] Mover API key de Gemini a variables de entorno
- [x] Configurar Google OAuth Client ID en `.env` para persistencia de login
- [x] Agregar validación de FFmpeg al iniciar la aplicación
- [x] Implementar manejo robusto de rutas con espacios
- [x] Considerar usar `subprocess.run()` con lista de argumentos en lugar de strings
- [ ] Implementar refresh token para Google Drive cuando el access token expire
