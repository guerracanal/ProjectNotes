/**
 * Helpers for timestamped transcripts.
 *
 * Kept free of Node built-ins so both the server routes and the client
 * components can import it.
 *
 * The on-disk shape is what `scripts/transcribir_video.py` writes:
 *
 *   {
 *     version: 1,
 *     media: "reunion.mp4",
 *     language: "es",
 *     model: "small",
 *     duration: 1834.2,
 *     segmentCount: 96,
 *     segments: [{ id, start, end, text, speaker }]
 *   }
 */

export const TRANSCRIPT_SCHEMA_VERSION = 1;

/** Seconds → "M:SS" or "H:MM:SS". Mirrors format_timestamp in the Python side. */
export function formatTime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/** "1:02:05" | "5:30" | "347" → seconds. Returns null when unparseable. */
export function parseTime(value) {
  if (value === null || value === undefined || value === '') return null;

  const raw = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);

  const parts = raw.split(':').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return null;

  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/**
 * Validate and normalise a parsed transcript document.
 * Returns null for anything that is not a usable transcript, so callers can
 * fall back to the plain-text view instead of rendering a broken reader.
 */
export function normalizeTranscript(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.segments)) return null;

  const segments = raw.segments
    .map((segment, index) => {
      const text = typeof segment?.text === 'string' ? segment.text.trim() : '';
      if (!text) return null;

      const start = Number(segment.start);
      const end = Number(segment.end);

      return {
        id: Number.isFinite(segment.id) ? segment.id : index,
        start: Number.isFinite(start) ? start : 0,
        end: Number.isFinite(end) ? end : Number.isFinite(start) ? start : 0,
        text,
        speaker: segment.speaker || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  if (segments.length === 0) return null;

  return {
    version: raw.version ?? TRANSCRIPT_SCHEMA_VERSION,
    media: typeof raw.media === 'string' ? raw.media : null,
    language: raw.language ?? null,
    model: raw.model ?? null,
    duration: Number.isFinite(Number(raw.duration))
      ? Number(raw.duration)
      : segments[segments.length - 1].end,
    segments,
    hasSpeakers: segments.some((s) => s.speaker),
  };
}

export function parseTranscript(json) {
  if (!json) return null;
  try {
    return normalizeTranscript(typeof json === 'string' ? JSON.parse(json) : json);
  } catch {
    return null;
  }
}

/**
 * Index of the segment playing at `time`.
 *
 * Binary search rather than a linear scan: this runs on every `timeupdate`,
 * which fires about four times a second, against transcripts that can hold
 * a couple of thousand segments.
 */
export function findSegmentAt(segments, time) {
  if (!segments?.length) return -1;

  let low = 0;
  let high = segments.length - 1;
  let best = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].start <= time) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Past the end of the last segment nothing is playing.
  if (best >= 0 && time > segments[best].end + 0.75 && best === segments.length - 1) {
    return -1;
  }
  return best;
}

/** The `_transcripcion.json` that belongs to a media file, by convention. */
export function transcriptJsonNameFor(mediaName) {
  const dot = mediaName.lastIndexOf('.');
  const base = dot === -1 ? mediaName : mediaName.slice(0, dot);
  return `${base}_transcripcion.json`;
}

export function transcriptTextNameFor(mediaName) {
  const dot = mediaName.lastIndexOf('.');
  const base = dot === -1 ? mediaName : mediaName.slice(0, dot);
  return `${base}_transcripcion.txt`;
}

/** True for the JSON sidecar written by the transcription script. */
export function isTranscriptJsonName(name) {
  return /_transcripcion\.json$/i.test(name);
}
