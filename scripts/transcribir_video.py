#!/usr/bin/env python3
"""
Transcribe un vídeo (o audio) con Whisper y guarda el resultado dos veces:

  <nombre>_transcripcion.txt    texto plano, tal como antes
  <nombre>_transcripcion.json   segmentos con marcas de tiempo

El .txt se mantiene porque es lo que espera todo lo demás y lo que la gente
abre con cualquier editor. El .json es lo que permite que la transcripción sea
clicable en la app y que el asistente cite el minuto exacto.

Uso:
    python transcribir_video.py VIDEO [--model small] [--language es]
                                      [--no-json] [--force]
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile


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

SCHEMA_VERSION = 1

# Whisper suele partir el audio en trozos muy cortos. Agruparlos hasta un
# tamaño legible evita una transcripción que parece una lista de la compra,
# sin perder la precisión: cada grupo conserva el inicio de su primer segmento.
TARGET_CHARS = 320
MAX_GAP_SECONDS = 2.0


# --------------------------------------------------------------------------
# Utilidades puras (sin dependencias: se pueden probar sin Whisper instalado)
# --------------------------------------------------------------------------

def format_timestamp(seconds):
    """Segundos → 'M:SS' o 'H:MM:SS'."""
    seconds = max(0, int(round(seconds or 0)))
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def merge_segments(segments, target_chars=TARGET_CHARS, max_gap=MAX_GAP_SECONDS):
    """
    Agrupa los segmentos de Whisper en bloques legibles.

    Un bloque se cierra cuando alcanza `target_chars`, cuando el texto termina
    en signo de puntuación fuerte y ya tiene cuerpo suficiente, o cuando hay un
    silencio mayor que `max_gap` (que casi siempre marca un cambio de turno).
    """
    merged = []
    current = None

    for segment in segments:
        text = (segment.get("text") or "").strip()
        if not text:
            continue

        start = float(segment.get("start") or 0.0)
        end = float(segment.get("end") or start)

        if current is None:
            current = {"start": start, "end": end, "text": text}
            continue

        gap = start - current["end"]
        long_enough = len(current["text"]) >= target_chars
        sentence_end = current["text"].endswith((".", "!", "?", "…")) and len(current["text"]) >= target_chars // 2

        if long_enough or sentence_end or gap > max_gap:
            merged.append(current)
            current = {"start": start, "end": end, "text": text}
        else:
            current["text"] = f"{current['text']} {text}".strip()
            current["end"] = end

    if current is not None:
        merged.append(current)

    for index, block in enumerate(merged):
        block["id"] = index
        # `speaker` queda reservado para diarización. Hoy siempre es None; la
        # app ya sabe mostrarlo si algún día se rellena.
        block.setdefault("speaker", None)

    return merged


def build_document(result, merged, *, model_name, media_filename):
    """Construye el objeto que se serializa a _transcripcion.json."""
    duration = 0.0
    if merged:
        duration = merged[-1]["end"]

    return {
        "version": SCHEMA_VERSION,
        "media": media_filename,
        "language": result.get("language"),
        "model": model_name,
        "duration": round(duration, 2),
        "segmentCount": len(merged),
        "segments": [
            {
                "id": block["id"],
                "start": round(block["start"], 2),
                "end": round(block["end"], 2),
                "text": block["text"],
                "speaker": block["speaker"],
            }
            for block in merged
        ],
    }


# --------------------------------------------------------------------------
# Trabajo real
# --------------------------------------------------------------------------

def extraer_audio(video_path, audio_path):
    """Extrae el audio en WAV mono a 16 kHz, que es lo que Whisper espera."""
    cmd = [
        "ffmpeg", "-i", video_path,
        "-ac", "1",
        "-ar", "16000",
        "-vn",
        "-f", "wav", audio_path,
        "-y",
        "-loglevel", "error",
    ]
    subprocess.run(cmd, check=True)


def transcribir(video_path, modelo="small", idioma="es", escribir_json=True, forzar=False):
    base = os.path.splitext(video_path)[0]
    salida_txt = f"{base}_transcripcion.txt"
    salida_json = f"{base}_transcripcion.json"

    if not forzar and os.path.exists(salida_txt) and (not escribir_json or os.path.exists(salida_json)):
        print(f"⏭️  Ya existe la transcripción de {os.path.basename(video_path)}. Usa --force para rehacerla.")
        return salida_txt

    # Importar aquí y no arriba: así `--help` y las funciones puras siguen
    # funcionando en un entorno sin Whisper instalado.
    try:
        import whisper
    except ImportError:
        print("❌ Falta el paquete 'openai-whisper'. Instálalo con: pip install -r requirements.txt", file=sys.stderr)
        raise SystemExit(2)

    tmp_audio = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    try:
        print(f"🎧 Extrayendo audio de {os.path.basename(video_path)}…", flush=True)
        extraer_audio(video_path, tmp_audio)

        print(f"🔤 Cargando el modelo Whisper «{modelo}»…", flush=True)
        model = whisper.load_model(modelo)

        print("⏳ Transcribiendo. En vídeos largos esto tarda varios minutos.", flush=True)
        result = model.transcribe(tmp_audio, language=idioma, verbose=False)

        segments = result.get("segments") or []
        merged = merge_segments(segments)

        texto = (result.get("text") or "").strip()
        with open(salida_txt, "w", encoding="utf-8") as handle:
            handle.write(texto)
        print(f"✅ Texto guardado: {os.path.basename(salida_txt)}", flush=True)

        if escribir_json:
            document = build_document(
                result,
                merged,
                model_name=modelo,
                media_filename=os.path.basename(video_path),
            )
            with open(salida_json, "w", encoding="utf-8") as handle:
                json.dump(document, handle, ensure_ascii=False, indent=1)

            print(
                f"✅ Segmentos guardados: {os.path.basename(salida_json)} "
                f"({len(merged)} bloques, {format_timestamp(document['duration'])} de duración)",
                flush=True,
            )

        return salida_txt
    finally:
        if os.path.exists(tmp_audio):
            os.remove(tmp_audio)


def main():
    parser = argparse.ArgumentParser(
        description="Transcribe un vídeo o audio con Whisper, con marcas de tiempo."
    )
    parser.add_argument("media", help="Ruta al fichero de vídeo o audio")
    parser.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "small"),
                        help="Modelo de Whisper: tiny, base, small, medium, large (por defecto: small)")
    parser.add_argument("--language", default=os.environ.get("WHISPER_LANGUAGE", "es"),
                        help="Idioma del audio (por defecto: es)")
    parser.add_argument("--no-json", action="store_true",
                        help="No escribir el fichero de segmentos con marcas de tiempo")
    parser.add_argument("--force", action="store_true",
                        help="Rehacer la transcripción aunque ya exista")

    args = parser.parse_args()

    if not os.path.isfile(args.media):
        print(f"❌ No existe el fichero: {args.media}", file=sys.stderr)
        raise SystemExit(1)

    transcribir(
        args.media,
        modelo=args.model,
        idioma=args.language,
        escribir_json=not args.no_json,
        forzar=args.force,
    )


if __name__ == "__main__":
    main()
