import google.generativeai as genai
import os
from pathlib import Path

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
    import sys
    
    print("=== Resumidor de Transcripciones de Reuniones ===\n")
    
    # Obtener la ruta del archivo desde argumentos de línea de comandos
    if len(sys.argv) > 1:
        ruta_archivo = sys.argv[1]
        modo_automatico = True
    else:
        # Modo interactivo solo si no se pasa argumento
        ruta_archivo = input("Introduce la ruta del archivo .txt con la transcripción: ").strip()
        modo_automatico = False
    
    # Verificar que el archivo existe
    if not Path(ruta_archivo).exists():
        print("Error: El archivo no existe.")
        return
    
    # Leer la transcripción
    print("\nLeyendo transcripción...")
    transcripcion = leer_transcripcion(ruta_archivo)
    
    if transcripcion is None:
        return
    
    print(f"Transcripción leída correctamente ({len(transcripcion)} caracteres)\n")
    
    # Obtener API key (puedes configurarla como variable de entorno)
    api_key = 'API_KEY'
    
    if not api_key:
        api_key = input("Introduce tu API key de Google Gemini: ").strip()
    
    # Generar el resumen
    print("Generando resumen con Gemini...\n")
    resumen = resumir_con_gemini(transcripcion, api_key)
    
    if resumen:
        print("=" * 60)
        print(resumen)
        print("=" * 60)
        
        # Guardar automáticamente en modo automático
        if modo_automatico:
            nombre_salida = ruta_archivo.replace('.txt', '_resumen.txt')
            with open(nombre_salida, 'w', encoding='utf-8') as f:
                f.write(resumen)
            print(f"\n✅ Resumen guardado automáticamente en: {nombre_salida}")
        else:
            # Solo preguntar en modo interactivo
            guardar = input("\n¿Deseas guardar el resumen en un archivo? (s/n): ").strip().lower()
            if guardar == 's':
                nombre_salida = ruta_archivo.replace('.txt', '_resumen.txt')
                with open(nombre_salida, 'w', encoding='utf-8') as f:
                    f.write(resumen)
                print(f"Resumen guardado en: {nombre_salida}")
    else:
        print("No se pudo generar el resumen.")

if __name__ == "__main__":
    main()