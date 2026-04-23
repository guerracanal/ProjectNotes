import os
import subprocess
import whisper
import tempfile

def extraer_audio(video_path, audio_path):
    """Extrae el audio del video en formato WAV."""
    cmd = [
        "ffmpeg", "-i", video_path,
        "-ac", "1",              # mono
        "-ar", "16000",          # 16 kHz
        "-vn",                   # sin video
        "-f", "wav", audio_path,
        "-y"
    ]
    subprocess.run(cmd, check=True)

def transcribir(video_path, modelo="small", idioma="es"):
    """Transcribe un video largo usando Whisper."""
    tmp_audio = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    extraer_audio(video_path, tmp_audio)

    print(f"🎧 Audio extraído: {tmp_audio}")
    print(f"🔤 Cargando modelo Whisper: {modelo}")
    model = whisper.load_model(modelo)

    print("⏳ Transcribiendo...")
    result = model.transcribe(tmp_audio, language=idioma, verbose=True)

    texto = result["text"].strip()
    salida_txt = os.path.splitext(video_path)[0] + "_transcripcion.txt"
    with open(salida_txt, "w", encoding="utf-8") as f:
        f.write(texto)

    print(f"✅ Transcripción completada: {salida_txt}")
    os.remove(tmp_audio)

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python transcribir_video.py <video_path>")
        sys.exit(1)
    
    ruta_video = sys.argv[1]
    transcribir(ruta_video, modelo="small", idioma="es")
