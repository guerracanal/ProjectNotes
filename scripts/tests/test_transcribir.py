#!/usr/bin/env python3
"""
Pruebas de las funciones puras de transcribir_video.py.

No requieren Whisper ni ffmpeg: el script importa whisper de forma perezosa
justo por esto, para que la lógica de agrupado se pueda verificar en cualquier
entorno.

Ejecutar:  python scripts/tests/test_transcribir.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from transcribir_video import build_document, format_timestamp, merge_segments  # noqa: E402

failures = []


def check(label, actual, expected):
    if actual == expected:
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label}\n      esperado: {expected!r}\n      obtenido: {actual!r}")
        failures.append(label)


def check_true(label, condition, detail=""):
    if condition:
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label} {detail}")
        failures.append(label)


print("format_timestamp")
check("cero", format_timestamp(0), "0:00")
check("segundos", format_timestamp(7), "0:07")
check("minutos", format_timestamp(95), "1:35")
check("horas", format_timestamp(3725), "1:02:05")
check("redondea", format_timestamp(59.6), "1:00")
check("None se trata como cero", format_timestamp(None), "0:00")
check("negativo se acota a cero", format_timestamp(-5), "0:00")

print("\nmerge_segments")

check("lista vacía", merge_segments([]), [])

check(
    "descarta segmentos sin texto",
    merge_segments([{"start": 0, "end": 1, "text": "   "}]),
    [],
)

# Trozos cortos y seguidos deben acabar en un solo bloque.
cortos = [
    {"start": i, "end": i + 1, "text": f"palabra{i}"} for i in range(5)
]
merged = merge_segments(cortos)
check("agrupa trozos cortos contiguos", len(merged), 1)
check("conserva el inicio del primero", merged[0]["start"], 0.0)
check("conserva el final del último", merged[0]["end"], 5.0)
check_true(
    "une el texto con espacios",
    merged[0]["text"] == "palabra0 palabra1 palabra2 palabra3 palabra4",
    merged[0]["text"],
)

# Un silencio largo debe partir el bloque: casi siempre es un cambio de turno.
con_silencio = [
    {"start": 0, "end": 2, "text": "primera parte"},
    {"start": 30, "end": 32, "text": "segunda parte"},
]
merged = merge_segments(con_silencio)
check("un silencio largo separa bloques", len(merged), 2)
check("el segundo bloque empieza tras el silencio", merged[1]["start"], 30.0)

# Un bloque largo se cierra al alcanzar el objetivo de caracteres.
largos = [
    {"start": i * 2, "end": i * 2 + 2, "text": "texto de relleno " * 5}
    for i in range(6)
]
merged = merge_segments(largos)
check_true("parte los bloques largos", len(merged) > 1, f"obtuvo {len(merged)}")
check_true(
    "ningún bloque se dispara de tamaño",
    all(len(b["text"]) < 1200 for b in merged),
    [len(b["text"]) for b in merged],
)

# Los identificadores deben ser correlativos y el hueco de speaker debe existir.
merged = merge_segments(cortos + con_silencio)
check("los ids son correlativos", [b["id"] for b in merged], list(range(len(merged))))
check_true("speaker existe y es None", all(b["speaker"] is None for b in merged))

# Los bloques nunca deben solaparse ni retroceder en el tiempo.
tiempos_ok = all(
    merged[i]["end"] <= merged[i + 1]["start"] + 1e-9 for i in range(len(merged) - 1)
)
check_true("los bloques van en orden y no se solapan", tiempos_ok)

print("\nbuild_document")
doc = build_document(
    {"language": "es"},
    merge_segments(con_silencio),
    model_name="small",
    media_filename="reunion.mp4",
)
check("versión del esquema", doc["version"], 1)
check("guarda el fichero de origen", doc["media"], "reunion.mp4")
check("guarda el idioma", doc["language"], "es")
check("guarda el modelo", doc["model"], "small")
check("la duración es el final del último bloque", doc["duration"], 32.0)
check("cuenta los segmentos", doc["segmentCount"], 2)
check_true(
    "cada segmento trae las claves esperadas",
    all(set(s) == {"id", "start", "end", "text", "speaker"} for s in doc["segments"]),
)

doc_vacio = build_document({"language": None}, [], model_name="tiny", media_filename="x.mp4")
check("duración cero sin segmentos", doc_vacio["duration"], 0.0)
check("sin segmentos, lista vacía", doc_vacio["segments"], [])

print()
if failures:
    print(f"❌ {len(failures)} prueba(s) fallida(s): {', '.join(failures)}")
    sys.exit(1)
print("✅ Todas las pruebas pasan.")
