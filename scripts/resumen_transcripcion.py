#!/usr/bin/env python3
"""
Resume una transcripción de reunión con Gemini.

Escribe <nombre>_transcripcion_resumen.txt junto al fichero de entrada, que es
donde la aplicación lo busca.

Uso:
    python resumen_transcripcion.py TRANSCRIPCION.txt [--model gemini-2.5-flash]

La clave se lee de GEMINI_API_KEY (o GOOGLE_API_KEY). En modo interactivo, si
falta, se pide por consola.
"""

import argparse
import os
import sys
from pathlib import Path


def _force_utf8_output():
    """
    Que la salida no dependa de la consola de quien lanza el script.

    En Windows, un proceso hijo hereda una stdout en cp1252, que no sabe
    codificar los emoji de los mensajes de progreso. El resultado no es un
    carácter feo: es un UnicodeEncodeError que aborta la transcripción entera
    en la primera línea, antes de tocar el vídeo. Node lee esta salida como
    UTF-8, así que forzarlo aquí es además lo correcto.
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, ValueError):
            # Ya sustituido (tests) o sin soporte: mejor seguir que reventar.
            pass


_force_utf8_output()

PROMPT = """Analiza la siguiente transcripción de una reunión y devuelve un resumen en español, en markdown.

Estructura tu respuesta exactamente así:

## Resumen
Dos frases como máximo con lo esencial de la reunión.

## Puntos clave
- Un punto por línea, concretos y con nombres propios cuando aparezcan.

## Decisiones
- Solo las decisiones que se hayan tomado de forma explícita. Si no hay ninguna, escribe "No se tomaron decisiones explícitas."

## Próximos pasos
- Tareas o compromisos, indicando quién los asume si se dice. Si no hay, escribe "No se acordaron próximos pasos."

Reglas:
- No inventes nada que no esté en la transcripción.
- Es una transcripción automática y puede tener errores de reconocimiento de voz. Si algo parece mal transcrito, señálalo entre paréntesis en vez de darlo por bueno.

Transcripción:
{transcripcion}
"""


def leer_transcripcion(ruta_archivo):
    """Lee el fichero de transcripción; devuelve None si no se puede."""
    try:
        with open(ruta_archivo, "r", encoding="utf-8") as archivo:
            return archivo.read()
    except FileNotFoundError:
        print(f"❌ No se encontró el archivo: {ruta_archivo}", file=sys.stderr)
    except OSError as error:
        print(f"❌ Error al leer el archivo: {error}", file=sys.stderr)
    return None


def resolver_api_key(interactivo):
    """
    Busca la clave en el entorno.

    Antes estaba escrita a fuego como la cadena 'API_KEY', así que la variable
    de entorno nunca se llegaba a usar y toda llamada fallaba con un error de
    autenticación poco claro.
    """
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if api_key:
        return api_key

    if interactivo:
        return input("Introduce tu API key de Google Gemini: ").strip()

    print(
        "❌ Falta GEMINI_API_KEY. Añádela a .env.local o expórtala en el entorno.",
        file=sys.stderr,
    )
    return None


def resumir_con_gemini(transcripcion, api_key, modelo):
    try:
        import google.generativeai as genai
    except ImportError:
        print(
            "❌ Falta el paquete 'google-generativeai'. Instálalo con: pip install -r requirements.txt",
            file=sys.stderr,
        )
        return None

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(modelo)
        response = model.generate_content(PROMPT.format(transcripcion=transcripcion))
        return response.text
    except Exception as error:  # la SDK lanza muchos tipos distintos
        print(f"❌ Error al generar el resumen con Gemini: {error}", file=sys.stderr)
        return None


def ruta_de_salida(ruta_entrada):
    """foo_transcripcion.txt → foo_transcripcion_resumen.txt"""
    path = Path(ruta_entrada)
    return str(path.with_name(f"{path.stem}_resumen{path.suffix or '.txt'}"))


def main():
    parser = argparse.ArgumentParser(description="Resume una transcripción de reunión con Gemini.")
    parser.add_argument("transcripcion", nargs="?", help="Ruta al .txt de la transcripción")
    parser.add_argument(
        "--model",
        default=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        help="Modelo de Gemini (por defecto: gemini-2.5-flash)",
    )
    args = parser.parse_args()

    interactivo = args.transcripcion is None
    ruta_archivo = args.transcripcion or input(
        "Introduce la ruta del archivo .txt con la transcripción: "
    ).strip()

    if not Path(ruta_archivo).is_file():
        print(f"❌ El archivo no existe: {ruta_archivo}", file=sys.stderr)
        raise SystemExit(1)

    transcripcion = leer_transcripcion(ruta_archivo)
    if not transcripcion or not transcripcion.strip():
        print("❌ La transcripción está vacía.", file=sys.stderr)
        raise SystemExit(1)

    print(f"📄 Transcripción leída ({len(transcripcion)} caracteres).", flush=True)

    api_key = resolver_api_key(interactivo)
    if not api_key:
        raise SystemExit(2)

    print(f"✨ Generando el resumen con {args.model}…", flush=True)
    resumen = resumir_con_gemini(transcripcion, api_key, args.model)

    if not resumen:
        raise SystemExit(3)

    salida = ruta_de_salida(ruta_archivo)
    with open(salida, "w", encoding="utf-8") as handle:
        handle.write(resumen)

    print(f"✅ Resumen guardado: {os.path.basename(salida)}", flush=True)


if __name__ == "__main__":
    main()
