import os
import sys
import io
import shutil
import subprocess
from pathlib import Path
import whisper
import tempfile

# Force UTF-8 encoding for Windows console compatibility
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def validar_ffmpeg():
    """Valida que FFmpeg esté instalado y accesible."""
    ffmpeg_cmd = shutil.which('ffmpeg')
    if not ffmpeg_cmd:
        print("[ERROR] FFmpeg no encontrado.")
        print("\nPara instalar FFmpeg:")
        if sys.platform == "win32":
            print("  Windows: Descarga desde https://www.gyan.dev/ffmpeg/builds/")
            print("  Agrega la carpeta bin al PATH de Windows")
        elif sys.platform == "darwin":
            print("  macOS: brew install ffmpeg")
        else:
            print("  Linux: sudo apt-get install ffmpeg (Ubuntu/Debian)")
            print("         sudo dnf install ffmpeg (Fedora)")
            print("         sudo pacman -S ffmpeg (Arch)")
        raise FileNotFoundError('ffmpeg no encontrado. Instala ffmpeg y añade su carpeta al PATH.')
    return ffmpeg_cmd

def validar_archivo(ruta_archivo):
    """Valida que el archivo de video existe y es accesible."""
    ruta = Path(ruta_archivo)
    if not ruta.exists():
        raise FileNotFoundError(f'El archivo de video no existe: {ruta_archivo}')
    if not ruta.is_file():
        raise ValueError(f'No es un archivo válido: {ruta_archivo}')
    return str(ruta.absolute())

def extraer_audio(video_path, audio_path, ffmpeg_cmd):
    """Extrae el audio del video en formato WAV.
    
    Args:
        video_path: Ruta al archivo de video
        audio_path: Ruta donde guardar el audio WAV
        ffmpeg_cmd: Comando de FFmpeg validado
    """
    # Usar lista de argumentos (maneja rutas con espacios correctamente)
    cmd = [
        ffmpeg_cmd,
        "-i", video_path,
        "-ac", "1",              # mono
        "-ar", "16000",          # 16 kHz
        "-vn",                   # sin video
        "-f", "wav",
        audio_path,
        "-y"                      # sobrescribir sin preguntar
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f'Error al extraer audio con FFmpeg: {e.stderr}')

def transcribir(video_path, modelo="small", idioma="es"):
    """Transcribe un video largo usando Whisper.
    
    Args:
        video_path: Ruta al archivo de video
        modelo: Modelo de Whisper a usar (tiny, base, small, medium, large)
        idioma: Código de idioma ISO-639-1 (ej: 'es', 'en', 'fr')
    """
    # Validar FFmpeg
    ffmpeg_cmd = validar_ffmpeg()
    
    # Validar archivo de entrada
    video_path = validar_archivo(video_path)
    
    print(f"[INFO] Procesando video: {video_path}")
    
    tmp_audio = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    try:
        extraer_audio(video_path, tmp_audio, ffmpeg_cmd)
        print(f"[AUDIO] Extraído: {tmp_audio}")
        
        print(f"[MODEL] Cargando Whisper: {modelo}")
        model = whisper.load_model(modelo)

        print("[TRANSCRIBING...]")
        result = model.transcribe(tmp_audio, language=idioma, verbose=True)

        texto = result["text"].strip()
        salida_txt = os.path.splitext(video_path)[0] + "_transcripcion.txt"
        with open(salida_txt, "w", encoding="utf-8") as f:
            f.write(texto)

        print(f"[OK] Transcripción completada: {salida_txt}")
    finally:
        # Limpiar archivo temporal
        if os.path.exists(tmp_audio):
            os.remove(tmp_audio)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("[ERROR] Uso: python transcribir_video.py <ruta_video>")
        print("\nEjemplo:")
        print("  python transcribir_video.py /ruta/a/video.mp4")
        print("  python transcribir_video.py 'C:\\\\Ruta con espacios\\\\video.mp4'")
        sys.exit(1)
    
    try:
        ruta_video = sys.argv[1]
        transcribir(ruta_video, modelo="small", idioma="es")
    except FileNotFoundError as e:
        print(f"[ERROR] {e}")
        sys.exit(1)
    except ValueError as e:
        print(f"[ERROR] {e}")
        sys.exit(1)
    except RuntimeError as e:
        print(f"[ERROR] {e}")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Error inesperado: {e}")
        sys.exit(1)
