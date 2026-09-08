import google.generativeai as genai
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Cargar variables de entorno desde .env
load_dotenv()

def validar_api_key():
    """Valida que GEMINI_API_KEY esté configurada."""
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("[ERROR] GEMINI_API_KEY no está configurada.")
        print("\nPara configurarla:")
        print("  1. Copia .env.example a .env")
        print("  2. Obtén tu API key en: https://aistudio.google.com/app/apikey")
        print("  3. Agrega la key a tu .env")
        print("\nVer WINDOWS_SETUP.md o LINUX_SETUP.md para más detalles.")
        raise ValueError('GEMINI_API_KEY no está configurada. Ver instrucciones arriba.')
    return api_key

def validar_archivo(ruta_archivo):
    """Valida que el archivo de transcripción existe y es accesible."""
    ruta = Path(ruta_archivo)
    if not ruta.exists():
        raise FileNotFoundError(f'El archivo de transcripción no existe: {ruta_archivo}')
    if not ruta.is_file():
        raise ValueError(f'No es un archivo válido: {ruta_archivo}')
    if not ruta.suffix.lower() == '.txt':
        print(f"[WARN] Advertencia: Se espera archivo .txt pero se proporcionó {ruta.suffix}")
    return str(ruta.absolute())

def leer_transcripcion(ruta_archivo):
    """
    Lee el contenido de un archivo de transcripción.
    
    Args:
        ruta_archivo: Ruta al archivo .txt con la transcripción
        
    Returns:
        str: Contenido del archivo
    """
    try:
        with open(ruta_archivo, 'r', encoding='utf-8') as archivo:
            contenido = archivo.read()
        return contenido
    except FileNotFoundError:
        print(f"Error: No se encontró el archivo en la ruta: {ruta_archivo}")
        return None
    except Exception as e:
        print(f"Error al leer el archivo: {e}")
        return None

def resumir_con_gemini(transcripcion, api_key):
    """
    Resume una transcripción usando Gemini API.
    
    Args:
        transcripcion: Texto de la transcripción
        api_key: API key de Google Gemini
        
    Returns:
        str: Resumen generado
    """
    try:
        # Configurar la API
        genai.configure(api_key=api_key)
        
        # Crear el modelo
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        # Crear el prompt
        prompt = f"""Analiza la siguiente transcripción de una reunión y proporciona:

1. Un resumen muy breve en 2 frases de lo tratado en la reunión
2. Los puntos clave principales discutidos en la reunión (en formato de lista)

Transcripción:
{transcripcion}

Por favor, estructura tu respuesta de la siguiente manera:
RESUMEN BREVE:
[Tu resumen en 2 frases]

PUNTOS CLAVE:
- [Punto 1]
- [Punto 2]
- [Punto 3]
...
"""
        
        # Generar el resumen
        response = model.generate_content(prompt)
        return response.text
        
    except Exception as e:
        print(f"Error al generar el resumen con Gemini: {e}")
        return None

def main():
    print("=== Resumidor de Transcripciones de Reuniones ===\n")
    
    try:
        # Validar API key al inicio
        api_key = validar_api_key()
        
        # Obtener la ruta del archivo desde argumentos de línea de comandos
        if len(sys.argv) > 1:
            ruta_archivo = sys.argv[1]
            modo_automatico = True
        else:
            # Modo interactivo solo si no se pasa argumento
            ruta_archivo = input("Introduce la ruta del archivo .txt con la transcripción: ").strip()
            modo_automatico = False
        
        # Validar archivo
        ruta_archivo = validar_archivo(ruta_archivo)
        print(f"[INFO] Procesando transcripción: {ruta_archivo}\n")
        
        # Leer la transcripción
        print("[INFO] Leyendo transcripción...")
        with open(ruta_archivo, 'r', encoding='utf-8') as archivo:
            transcripcion = archivo.read()
        
        if not transcripcion.strip():
            raise ValueError("El archivo de transcripción está vacío")
        
        print(f"[INFO] Transcripción leída correctamente ({len(transcripcion)} caracteres)\n")
        
        # Generar el resumen
        print("[INFO] Generando resumen con Gemini...\n")
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        prompt = f"""Analiza la siguiente transcripción de una reunión y proporciona:

1. Un resumen muy breve en 2 frases de lo tratado en la reunión
2. Los puntos clave principales discutidos en la reunión (en formato de lista)

Transcripción:
{transcripcion}

Por favor, estructura tu respuesta de la siguiente manera:
RESUMEN BREVE:
[Tu resumen en 2 frases]

PUNTOS CLAVE:
- [Punto 1]
- [Punto 2]
- [Punto 3]
...
"""
        
        response = model.generate_content(prompt)
        resumen = response.text
        
        print("=" * 60)
        print(resumen)
        print("=" * 60)
        
        # Guardar el resumen
        nombre_salida = ruta_archivo.replace('.txt', '_resumen.txt')
        with open(nombre_salida, 'w', encoding='utf-8') as f:
            f.write(resumen)
        
        if modo_automatico:
            print(f"\n[OK] Resumen guardado en: {nombre_salida}")
        else:
            # En modo interactivo, preguntar si guardar
            print(f"\nResumen guardado en: {nombre_salida}")
    
    except FileNotFoundError as e:
        print(f"[ERROR] {e}")
        sys.exit(1)
    except ValueError as e:
        print(f"[ERROR] {e}")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Error inesperado: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()