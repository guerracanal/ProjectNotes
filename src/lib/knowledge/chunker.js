import { isTranscript } from '@/lib/fs-utils';

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

/** Turn raw file content into chunk objects. */
export function chunkDocument(content, { name = '', path: filePath = '' } = {}) {
  const text = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

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
