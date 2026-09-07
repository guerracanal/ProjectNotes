import { isTranscript } from '@/lib/fs-utils';
import { formatTime, parseTranscript } from '@/lib/transcript';

/**
 * Split a document into retrieval-sized chunks.
 *
 * Markdown is split on headings first so a chunk keeps its section intact;
 * transcripts have no structure at all, so they fall back to a sliding window
 * over sentences. Every chunk carries the heading trail it came from, which
 * gives the model (and the citation UI) something meaningful to show.
 */

const TARGET_CHARS = 1400;
const OVERLAP_CHARS = 200;
const MIN_CHARS = 120;

// Transcripts get smaller chunks than prose. The point of indexing them by
// segment is that a citation lands on the right moment, and a chunk spanning
// two minutes of speech puts the reader back to guessing.
const TRANSCRIPT_TARGET_CHARS = 650;
const TRANSCRIPT_OVERLAP_CHARS = 120;

function splitLongText(text, heading) {
  // Break on sentence boundaries, then greedily pack up to TARGET_CHARS.
  const sentences = text.match(/[^.!?\n]+[.!?]*[\n]*/g) || [text];
  const chunks = [];
  let buffer = '';

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed.length >= MIN_CHARS) chunks.push({ heading, text: trimmed });
    else if (trimmed && chunks.length) chunks[chunks.length - 1].text += `\n${trimmed}`;
    else if (trimmed) chunks.push({ heading, text: trimmed });
  };

  for (const sentence of sentences) {
    if (buffer.length + sentence.length > TARGET_CHARS && buffer.length > 0) {
      flush();
      // Carry a tail of the previous chunk so a fact split across the boundary
      // is still retrievable from either side.
      buffer = buffer.slice(-OVERLAP_CHARS);
    }
    buffer += sentence;
  }
  flush();

  return chunks;
}

/**
 * Chunk a timestamped transcript by grouping consecutive segments.
 *
 * Each chunk keeps the start of its first segment and the end of its last, so
 * a citation can point at the exact moment in the recording rather than at the
 * file as a whole. Returns null when the content is not a transcript document,
 * which lets the caller fall back to the text path.
 */
export function chunkTranscript(content, { path: filePath = '' } = {}) {
  const transcript = parseTranscript(content);
  if (!transcript) return null;

  const chunks = [];
  let buffer = null;

  const flush = () => {
    if (!buffer) return;
    chunks.push({
      heading: `${formatTime(buffer.start)} – ${formatTime(buffer.end)}`,
      text: buffer.text.trim(),
      start: buffer.start,
      end: buffer.end,
      media: transcript.media,
      source: filePath,
    });
    buffer = null;
  };

  for (const segment of transcript.segments) {
    if (!buffer) {
      buffer = { start: segment.start, end: segment.end, text: segment.text };
      continue;
    }

    if (buffer.text.length + segment.text.length > TRANSCRIPT_TARGET_CHARS) {
      const tail = buffer;
      flush();
      // Carry a tail of the previous chunk as overlap, so a point made across
      // a chunk boundary stays retrievable from either side.
      buffer = {
        start: segment.start,
        end: segment.end,
        text: `${tail.text.slice(-TRANSCRIPT_OVERLAP_CHARS)} ${segment.text}`.trim(),
      };
    } else {
      buffer.text = `${buffer.text} ${segment.text}`.trim();
      buffer.end = segment.end;
    }
  }
  flush();

  return chunks.map((chunk, i) => ({ ...chunk, order: i }));
}

/** Turn raw file content into chunk objects. */
export function chunkDocument(content, { name = '', path: filePath = '' } = {}) {
  const text = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  // A transcript sidecar carries its own structure: segments with times.
  if (/_transcripcion\.json$/i.test(name)) {
    const transcriptChunks = chunkTranscript(text, { path: filePath });
    if (transcriptChunks) return transcriptChunks;
  }

  const isMarkdownLike = /\.(md|markdown)$/i.test(name) && !isTranscript(name);

  if (!isMarkdownLike) {
    return splitLongText(text, '').map((c, i) => ({ ...c, order: i }));
  }

  // Walk the markdown, tracking the current heading trail.
  const lines = text.split('\n');
  const sections = [];
  let trail = [];
  let buffer = [];

  const pushSection = () => {
    const body = buffer.join('\n').trim();
    if (body) sections.push({ heading: trail.join(' › '), text: body });
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      pushSection();
      const level = headingMatch[1].length;
      trail = trail.slice(0, level - 1);
      trail[level - 1] = headingMatch[2].replace(/[*_`]/g, '').trim();
      trail = trail.filter(Boolean);
    } else {
      buffer.push(line);
    }
  }
  pushSection();

  if (sections.length === 0) {
    return splitLongText(text, '').map((c, i) => ({ ...c, order: i }));
  }

  const chunks = [];
  for (const section of sections) {
    if (section.text.length <= TARGET_CHARS) {
      chunks.push({ heading: section.heading, text: section.text });
    } else {
      chunks.push(...splitLongText(section.text, section.heading));
    }
  }

  return chunks
    .filter((c) => c.text.trim().length > 0)
    .map((c, i) => ({ ...c, order: i, source: filePath }));
}
