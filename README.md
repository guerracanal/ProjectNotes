This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Python Scripts - Transcripción y Resumen

Este proyecto incluye scripts Python para transcribir videos y resumir transcripciones:

- `scripts/transcribir_video.py` - Extrae audio de videos y transcribe usando Whisper
- `scripts/resumen_transcripcion.py` - Resume transcripciones usando Gemini API

### Instalación de Dependencias

```bash
pip install -r requirements.txt
```

### Configuración Requerida

#### 1. API Key de Google Gemini

El script de resumen requiere una API key de Google Gemini:

1. Copia `.env.example` a `.env`
2. Obtén tu API key en: https://aistudio.google.com/app/apikey
3. Agrega tu key al archivo `.env`:
   ```
   GEMINI_API_KEY=tu_api_key_aqui
   ```

#### 2. Google OAuth Client ID (Opcional pero Recomendado)

Para Google Drive Sync sin pedir login cada vez:

1. Obtén tu Client ID en: https://console.cloud.google.com/
   - Crea un proyecto nuevo
   - Activa Google Drive API
   - Crea credenciales OAuth 2.0 (Web application)
   - Agrega `http://localhost:3000` a JavaScript origins
   
2. Agrega al `.env`:
   ```
   GOOGLE_OAUTH_CLIENT_ID=tu_client_id_aqui
   ```

3. El Client ID se cargará automáticamente en Google Drive Sync y el login persistirá entre sesiones

**Nota de seguridad:** Nunca commits `.env` al repositorio. Usa `.env.example` como referencia.

### Configuración en Windows y Linux/Unix

⚠️ **Importante:** Consulta la guía específica para tu sistema operativo:

- **Windows**: [WINDOWS_SETUP.md](WINDOWS_SETUP.md)
- **Linux/Unix (Ubuntu, Debian, macOS, etc.)**: [LINUX_SETUP.md](LINUX_SETUP.md)

Estas guías incluyen:
- Instalación de FFmpeg
- Configuración de virtual environment
- Solución de problemas comunes
- Configuración de variables de entorno para API keys

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
