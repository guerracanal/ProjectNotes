# Reuniones y transcripciones

Cómo pasa una grabación de ser un fichero de vídeo a ser algo por lo que puedes
navegar, buscar y que el asistente puede citar al segundo.

---

## El recorrido completo

```
kickoff.mp4
    │
    │  scripts/transcribir_video.py   (ffmpeg → Whisper, en local)
    ▼
kickoff_transcripcion.txt      texto plano, legible en cualquier editor
kickoff_transcripcion.json     segmentos con inicio y fin
    │
    ├─→ Lector de transcripciones   pulsar una línea salta a ese momento
    │
    ├─→ Índice de conocimiento      un bloque por ~1 minuto, con su instante
    │       └─→ El asistente cita «(min. 12:34) [3]» y enlaza ahí
    │
    └─→ scripts/resumen_transcripcion.py   (Gemini)
            ▼
        kickoff_transcripcion_resumen.txt
```

Los tres ficheros se llaman igual que la grabación más un sufijo. Esa convención
es lo que los relaciona: si la cambias, hay que tocar a la vez
`src/app/project/[...path]/page.js`, `TranscriptModal.js` y los dos scripts.

---

## Transcribir

Desde la app: pestaña **Reuniones → Transcribir**. Por debajo lanza el script de
Python y va mostrando su salida mientras trabaja.

Desde la terminal:

```bash
source venv/bin/activate
python scripts/transcribir_video.py projects_data/Portal/kickoff.mp4
python scripts/transcribir_video.py grabacion.mp4 --model medium --language es
python scripts/transcribir_video.py grabacion.mp4 --force   # rehacer
```

Requisitos: `ffmpeg` en el `PATH` y `pip install -r requirements.txt`.
Todo corre en tu máquina; no se envía nada a ningún servicio.

### Por qué dos ficheros

El `.txt` se mantiene porque es lo que espera el resto de la app, lo que se
puede leer sin la app, y lo que ya tenían las transcripciones anteriores. El
`.json` es lo que añade las marcas de tiempo. Ninguno de los dos es «el bueno»:
el texto es para las personas y el JSON para la máquina.

### El formato del JSON

```json
{
  "version": 1,
  "media": "kickoff.mp4",
  "language": "es",
  "model": "small",
  "duration": 1834.2,
  "segmentCount": 96,
  "segments": [
    { "id": 0, "start": 0.0, "end": 14.4, "text": "Buenos días…", "speaker": null }
  ]
}
```

`speaker` está siempre a `null` hoy. El hueco existe porque la interfaz ya sabe
mostrarlo, y es donde encajaría la diarización (saber quién habla) si algún día
se añade con `pyannote.audio`.

### Cómo se agrupan los segmentos

Whisper devuelve trozos muy cortos, a menudo de una frase suelta. Mostrarlos tal
cual daría una transcripción con aspecto de lista de la compra, así que se
agrupan en bloques legibles. Un bloque se cierra cuando:

- alcanza el tamaño objetivo (~320 caracteres),
- termina en punto y ya tiene cuerpo suficiente, o
- hay un silencio de más de dos segundos, que casi siempre marca un cambio de
  turno.

Cada bloque conserva el inicio de su primer segmento, así que la precisión al
saltar no se pierde por agrupar.

---

## Leer

**Reuniones → Leer y navegar** abre el lector: la grabación a un lado y la
transcripción al otro.

| Qué | Cómo |
|---|---|
| Saltar a un momento | Pulsar cualquier línea o su marca de tiempo |
| Seguir la reproducción | La línea que suena se resalta y se centra sola |
| Dejar de seguir | Basta con hacer scroll a mano; el botón vuelve a activarlo |
| Buscar dentro | El buscador del panel, con plegado de acentos |
| Copiar una cita | El icono de copiar añade `[12:34]` delante |
| Entrar por un enlace | `?tab=meetings&media=kickoff.mp4&t=847` |

El seguimiento automático se apaga en cuanto haces scroll por tu cuenta. Es
deliberado: pelearse con la página por el control del scroll molesta más de lo
que ayuda el resalte.

### Transcripciones antiguas

Las que se hicieron antes de que existieran las marcas de tiempo siguen
funcionando: se muestran como texto plano, con un aviso y un botón para
**añadir marcas de tiempo**, que vuelve a transcribir la grabación.

---

## Resumir

**Reuniones → Generar resumen** manda la transcripción a Gemini y guarda un
`_transcripcion_resumen.txt` con resumen, puntos clave, decisiones y próximos
pasos. Necesita `GEMINI_API_KEY` en `.env.local`.

El prompt le pide explícitamente que no invente y que señale entre paréntesis lo
que parezca mal transcrito, en lugar de darlo por bueno.

---

## Audio

Las notas de voz cuentan como reuniones. Los ficheros `.mp3`, `.m4a`, `.wav`,
`.ogg` y `.flac` aparecen en la misma pestaña y siguen el mismo recorrido:
Whisper los acepta directamente, sin pasar por el vídeo.

---

## Qué falta

- **Diarización** (quién dice qué). El esquema y la interfaz ya lo contemplan;
  falta enchufar `pyannote.audio`, que necesita un token de Hugging Face.
- **Cola de trabajos persistente**. Ahora viven en memoria: un reinicio del
  servidor los pierde, aunque el fichero resultante no se pierde.
- **Progreso real**. Whisper puede informar del porcentaje; hoy solo se muestra
  su salida de consola.
