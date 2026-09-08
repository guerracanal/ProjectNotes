# Configuración de Transcripción de Video en Windows

Documentación de problemas encontrados y soluciones aplicadas para hacer funcionar los scripts de transcripción en Windows.

## Problemas Encontrados vs Ubuntu

Al migrar los scripts de transcripción desde Ubuntu a Windows se encontraron varios problemas que no existían en el entorno Linux original.

### 1. Localización de archivos en el Virtual Environment

**Problema:**
- En Ubuntu, los scripts podían localizar correctamente los archivos dentro del virtual environment
- En Windows, `sys.argv[1]` puede contener rutas con espacios que no se procesaban correctamente en algunos casos

**Solución:**
- Asegurar que se usa `Path()` de `pathlib` para manipular rutas multiplataforma
- Validar que los paths se pasen correctamente desde la aplicación web
- Encapsular rutas con espacios entre comillas en comandos shell

### 2. FFmpeg no Instalado

**Problema:**
```
FileNotFoundError: 'ffmpeg no encontrado. Instala ffmpeg y añade su carpeta al PATH.'
```

El script requiere FFmpeg para extraer audio de videos MP4, pero Windows no incluye FFmpeg por defecto.

**Solución:**
1. Descargar FFmpeg desde: https://www.gyan.dev/ffmpeg/builds/
2. Usar la versión **full** (recomendado para mejor compatibilidad de codecs)
3. Instalar en una carpeta accesible (ej: `C:\ffmpeg`)
4. Agregar la carpeta `bin` al PATH de Windows:
   - Búsqueda de Windows → "Variables de entorno"
   - Click en "Editar variables de entorno del sistema"
   - Click en "Variables de entorno..."
   - En "Variables del sistema", buscar/editar `Path`
   - Agregar: `C:\ffmpeg\bin`
   - Aplicar y reiniciar terminal/VS Code

Verificar instalación:
```bash
ffmpeg -version
```

### 3. Unicode Encoding Error (UnicodeEncodeError)

**Problema:**
```
UnicodeEncodeError: 'charmap' codec can't encode character '\U0001f3a7' in position 0: 
character maps to <undefined>
```

La terminal de Windows usa por defecto encoding `cp1252` que no soporta emojis Unicode (🎧, 📄, ⏳, ✅).

**Solución Aplicada:**

En `scripts/transcribir_video.py`:

```python
import sys
import io

# Force UTF-8 encoding para compatibilidad con consola Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
```

**Cambios en los mensajes:**
- 🎧 → `[AUDIO]` 
- 🔤 → `[MODEL]`
- ⏳ → `[TRANSCRIBING...]`
- ✅ → `[OK]`

Usar texto ASCII simple en lugar de emojis garantiza compatibilidad total en todas las plataformas.

## Configuración de Variables de Entorno (API Keys)

### 1. Google Gemini API Key

El script `scripts/resumen_transcripcion.py` requiere una API key de Google Gemini para funcionamiento.

**⚠️ IMPORTANTE - Seguridad:** Nunca incluyas API keys en el código. Siempre usa variables de entorno.

### 2. Google OAuth Client ID (Para Google Drive Sync)

Para Google Drive Sync sin requerir login cada vez, puedes configurar tu Google OAuth Client ID en `.env`.

### Configuración en Windows

#### Opción 1: Archivo `.env` (Recomendado para desarrollo local)

1. Copia el archivo `.env.example` a `.env`:
```bash
copy .env.example .env
```

2. Abre `.env` y agrega tus configuraciones:
```
GEMINI_API_KEY=tu_api_key_aqui
GOOGLE_OAUTH_CLIENT_ID=tu_client_id_aqui
```

3. El script automáticamente cargará estas variables usando `python-dotenv`

#### Opción 2: Variables de entorno del sistema (Para producción)

1. Búsqueda de Windows → "Variables de entorno"
2. Click en "Editar variables de entorno del sistema"
3. Click en "Variables de entorno..."
4. Click en "Nueva..." (en Variables del usuario o del sistema)
5. Nombre: `GEMINI_API_KEY` (o `GOOGLE_OAUTH_CLIENT_ID`)
6. Valor: Tu API key o Client ID
7. Click OK y reinicia la terminal

### Obtener tus Keys

#### Google Gemini API Key
1. Ve a: https://aistudio.google.com/app/apikey
2. Haz login con tu cuenta de Google
3. Click en "Create API key"
4. Copia la key generada

#### Google OAuth Client ID
1. Ve a: https://console.cloud.google.com/
2. Crea un nuevo proyecto e introduce el nombre
3. Busca "Google Drive API" y actívala
4. Ve a "Credenciales" → "Crear credenciales" → "ID de cliente de OAuth"
5. Selecciona "Aplicación web"
6. En "Orígenes de JavaScript autorizados" agrega: `http://localhost:3000`
7. Haz clic en "Crear" y copia tu Client ID

### Persistencia de Google Drive Login

Una vez configurado el Google OAuth Client ID en `.env`:

- El Client ID se carga automáticamente en Google Drive Sync
- El login persiste entre sesiones (se guarda en localStorage)
- **Nota**: Los tokens de acceso expiran cada ~1 hora. Si se vencen, deberás hacer login nuevamente.

### Dependencias Python

El archivo `requirements.txt` incluye todas las dependencias necesarias:
- `openai-whisper` - Para transcripción de audio
- `python-dotenv` - Para cargar variables de entorno desde `.env`
- `google-generativeai` - Para usar Gemini API

Instalar todas las dependencias:
```bash
pip install -r requirements.txt
```

## Archivos Modificados

- `scripts/transcribir_video.py` - Agregado soporte UTF-8 y reemplazados emojis
- `scripts/resumen_transcripcion.py` - Agregado soporte UTF-8, reemplazados emojis, y API key movida a variables de entorno
- `requirements.txt` - Agregado `google-generativeai`
- `.env.example` - Archivo de ejemplo para configuración de variables de entorno (copiar a `.env`)

## Testing en Windows

Para verificar que todo funciona:

1. Activar virtual environment:
```bash
.\.venv\Scripts\Activate.ps1
```

2. Probar transcripción:
```bash
python scripts/transcribir_video.py "ruta/al/video.mp4"
```

3. Probar resumen:
```bash
python scripts/resumen_transcripcion.py "ruta/al/transcripcion.txt"
```

4. Probar Google Drive Sync:
   - Abre la aplicación en http://localhost:3000
   - Ve a Google Drive Sync
   - Si configuraste `GOOGLE_OAUTH_CLIENT_ID` en `.env`, se carará automáticamente
   - Si no, ingresa tu Client ID manualmente
   - Haz clic en "Conectar con Google Drive"
   - **Importante**: En la ventana emergente de Google, marca la casilla para permitir acceso a Google Drive
   - Una vez conectado, el login persistirá entre sesiones

## Notas Importantes

- **FFmpeg:** Esencial para procesar videos. Sin él, el script fallará al intentar extraer audio
- **Encoding UTF-8:** Necesario para scripts con caracteres especiales o emojis
- **Rutas con espacios:** Siempre encapsular entre comillas en comandos shell
- **API Key de Gemini:** No incluir en el código. Usar variables de entorno en producción

## Próximas Mejoras

- [x] Mover API key de Gemini a variables de entorno
- [x] Configurar Google OAuth Client ID en `.env` para persistencia de login
- [x] Agregar validación de FFmpeg al iniciar la aplicación
- [x] Implementar manejo robusto de rutas con espacios
- [x] Considerar usar `subprocess.run()` con lista de argumentos en lugar de strings
- [ ] Implementar refresh token para Google Drive cuando el access token expire
