import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import {
  PROJECTS_DIR,
  getFileContent,
  isTranscript,
  walkFiles,
} from '@/lib/fs-utils';
import { chunkDocument } from './chunker';
import { buildBm25Index, deserializeBm25, serializeBm25 } from './bm25';
import { embedTexts, getEmbeddingConfig } from './embeddings';

/**
 * The knowledge index: every text file under projects_data, chunked, scored by
 * BM25 and (optionally) embedded.
 *
 * It lives in memory for the life of the server process and is mirrored to disk
 * so a restart does not force a full rebuild. Writes through the API call
 * `invalidateIndex()`, which marks the cache stale rather than rebuilding
 * eagerly — the next query pays the cost, and only once.
 */

const INDEX_DIR = path.join(process.cwd(), '.projectnotes');
const INDEX_FILE = path.join(INDEX_DIR, 'knowledge-index.json');
const INDEX_VERSION = 2;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // skip anything implausibly large for notes

const globalKey = Symbol.for('projectnotes.knowledge');
if (!globalThis[globalKey]) {
  globalThis[globalKey] = { index: null, stale: true, building: null };
}
const cache = globalThis[globalKey];

export function invalidateIndex() {
  cache.stale = true;
}

function fingerprint(files) {
  const hash = createHash('sha1');
  for (const file of files) {
    hash.update(`${file.path}:${file.size}:${new Date(file.mtime).getTime()}\n`);
  }
  return hash.digest('hex');
}

function projectOf(filePath) {
  const parts = filePath.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '(raíz)';
}

/** A short human label for a document, used in citations. */
function documentLabel(file) {
  return `${projectOf(file.path)} / ${file.name}`;
}

async function collectChunks() {
  const all = (await walkFiles('')).filter(
    (f) => f.kind === 'text' && f.size > 0 && f.size <= MAX_FILE_BYTES
  );

  // A transcribed recording leaves two files with the same words in them:
  // `_transcripcion.txt` and `_transcripcion.json`. Index only the JSON when
  // it exists — same content, but with the timestamps that let a citation
  // point at a moment instead of at a file.
  const supersededText = new Set(
    all
      .filter((f) => /_transcripcion\.json$/i.test(f.name))
      .map((f) => f.path.replace(/\.json$/i, '.txt'))
  );

  const files = all.filter((f) => !supersededText.has(f.path));

  files.sort((a, b) => a.path.localeCompare(b.path));

  const chunks = [];
  const documents = [];

  for (const file of files) {
    const content = await getFileContent(file.path);
    if (!content || !content.trim()) continue;

    const docIndex = documents.length;
    documents.push({
      path: file.path,
      name: file.name,
      project: projectOf(file.path),
      label: documentLabel(file),
      kind: isTranscript(file.name) ? 'transcript' : 'note',
      size: file.size,
      mtime: file.mtime,
    });

    for (const chunk of chunkDocument(content, file)) {
      chunks.push({
        doc: docIndex,
        path: file.path,
        project: projectOf(file.path),
        title: file.name,
        heading: chunk.heading || '',
        order: chunk.order,
        text: chunk.text,
        // Present only for transcript chunks: the moment in the recording
        // this text was spoken, and which file to play.
        ...(chunk.start !== undefined
          ? { start: chunk.start, end: chunk.end, media: chunk.media || null }
          : {}),
      });
    }
  }

  return { files, chunks, documents };
}

async function persist(index) {
  try {
    await fs.mkdir(INDEX_DIR, { recursive: true });
    await fs.writeFile(
      INDEX_FILE,
      JSON.stringify({
        version: INDEX_VERSION,
        fingerprint: index.fingerprint,
        builtAt: index.builtAt,
        documents: index.documents,
        chunks: index.chunks,
        bm25: serializeBm25(index.bm25),
        embeddings: index.embeddings,
        embeddingProvider: index.embeddingProvider,
      }),
      'utf-8'
    );
  } catch (error) {
    // A read-only or full disk should degrade to "rebuild each boot", not crash.
    console.warn('[knowledge] Could not persist index:', error.message);
  }
}

async function loadPersisted(expectedFingerprint) {
  try {
    const raw = JSON.parse(await fs.readFile(INDEX_FILE, 'utf-8'));
    if (raw.version !== INDEX_VERSION) return null;
    if (raw.fingerprint !== expectedFingerprint) return null;
    return {
      fingerprint: raw.fingerprint,
      builtAt: raw.builtAt,
      documents: raw.documents,
      chunks: raw.chunks,
      bm25: deserializeBm25(raw.bm25),
      embeddings: raw.embeddings || null,
      embeddingProvider: raw.embeddingProvider || 'none',
    };
  } catch {
    return null;
  }
}

async function build({ withEmbeddings = true } = {}) {
  const started = Date.now();
  const { files, chunks, documents } = await collectChunks();
  const fp = fingerprint(files);

  const persisted = await loadPersisted(fp);
  if (persisted) {
    cache.index = persisted;
    cache.stale = false;
    return persisted;
  }

  const bm25 = buildBm25Index(chunks);

  let embeddings = null;
  let embeddingProvider = 'none';
  const embedConfig = getEmbeddingConfig();

  if (withEmbeddings && embedConfig.enabled && chunks.length > 0) {
    try {
      const vectors = await embedTexts(
        chunks.map((c) => (c.heading ? `${c.heading}\n${c.text}` : c.text)),
        { inputType: 'document' }
      );
      if (vectors) {
        embeddings = vectors;
        embeddingProvider = embedConfig.provider;
      }
    } catch (error) {
      // Retrieval still works on BM25 alone, so an embedding outage is a
      // degradation, not a failure.
      console.warn('[knowledge] Embedding pass failed, continuing lexical-only:', error.message);
    }
  }

  const index = {
    fingerprint: fp,
    builtAt: new Date().toISOString(),
    buildMs: Date.now() - started,
    documents,
    chunks,
    bm25,
    embeddings,
    embeddingProvider,
  };

  cache.index = index;
  cache.stale = false;
  await persist(index);
  return index;
}

/** Get the current index, rebuilding it if the content changed. */
export async function getIndex(options = {}) {
  if (cache.index && !cache.stale) return cache.index;
  if (cache.building) return cache.building;

  cache.building = build(options).finally(() => {
    cache.building = null;
  });
  return cache.building;
}

/** Force a full rebuild, ignoring both caches. */
export async function rebuildIndex(options = {}) {
  cache.index = null;
  cache.stale = true;
  try {
    await fs.rm(INDEX_FILE, { force: true });
  } catch {
    /* nothing to remove */
  }
  return getIndex(options);
}

export async function getIndexStats() {
  const index = await getIndex();
  const projects = new Set(index.documents.map((d) => d.project));
  return {
    builtAt: index.builtAt,
    buildMs: index.buildMs ?? null,
    documents: index.documents.length,
    chunks: index.chunks.length,
    transcripts: index.documents.filter((d) => d.kind === 'transcript').length,
    projects: projects.size,
    embeddingProvider: index.embeddingProvider,
    semantic: Boolean(index.embeddings),
    root: PROJECTS_DIR,
  };
}
