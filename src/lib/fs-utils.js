import fs from 'fs/promises';
import path from 'path';

/** Root of the user's content. Everything the app reads or writes lives here. */
export const PROJECTS_DIR = path.join(process.cwd(), 'projects_data');

/** Files/folders never exposed through the API or the indexer. */
const IGNORED = new Set(['.git', 'node_modules', '.projectnotes', '.DS_Store', 'Thumbs.db']);

export const TEXT_EXTENSIONS = ['.md', '.txt', '.markdown', '.csv', '.json', '.log'];
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif'];
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.mov', '.avi'];
export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];
export const DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt'];

/**
 * Resolve `subpath` inside PROJECTS_DIR and refuse anything that escapes it.
 *
 * `startsWith(PROJECTS_DIR)` alone is not enough: a sibling directory such as
 * `projects_data_backup` shares the prefix. Comparing against `PROJECTS_DIR +
 * path.sep` (and allowing the root itself) closes that hole, and rejecting NUL
 * bytes stops truncation tricks at the syscall boundary.
 */
export function getSafePath(subpath = '') {
  const raw = String(subpath ?? '');
  if (raw.includes('\0')) {
    throw new Error('Invalid path');
  }

  // Strip leading slashes so an absolute-looking input can never re-root us.
  const normalized = raw.replace(/^[/\\]+/, '');
  const resolved = path.resolve(PROJECTS_DIR, normalized);

  if (resolved !== PROJECTS_DIR && !resolved.startsWith(PROJECTS_DIR + path.sep)) {
    throw new Error('Invalid path: outside of projects directory');
  }
  return resolved;
}

/** Path relative to PROJECTS_DIR, always with forward slashes. */
export function toRelativePath(absolutePath) {
  return path.relative(PROJECTS_DIR, absolutePath).split(path.sep).join('/');
}

export function isHidden(name) {
  return name.startsWith('.') || IGNORED.has(name);
}

export function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/**
 * Classify a file so the UI can pick an icon and the indexer can decide whether
 * the content is worth reading.
 */
export function classifyFile(name) {
  const ext = extensionOf(name);
  if (TEXT_EXTENSIONS.includes(ext)) return 'text';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (DOC_EXTENSIONS.includes(ext)) return 'document';
  return 'other';
}

/** True for files that look like a Whisper transcript or its Gemini summary. */
export function isTranscript(name) {
  return /transcripcion|transcription|transcript/i.test(name);
}

export async function getDirectoryContent(subpath = '') {
  const fullPath = getSafePath(subpath);
  try {
    const stats = await fs.stat(fullPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const items = await Promise.all(
      entries.map(async (entry) => {
        if (isHidden(entry.name)) return null;
        const entryStat = await fs.stat(path.join(fullPath, entry.name));
        return {
          name: entry.name,
          path: path.posix.join(subpath || '', entry.name),
          type: entry.isDirectory() ? 'folder' : 'file',
          kind: entry.isDirectory() ? 'folder' : classifyFile(entry.name),
          size: entry.isDirectory() ? 0 : entryStat.size,
          mtime: entryStat.mtime,
        };
      })
    );

    return items.filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code === 'ENOTDIR') return null;
    throw error;
  }
}

export async function getFileContent(subpath) {
  const fullPath = getSafePath(subpath);
  try {
    return await fs.readFile(fullPath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return null;
    throw error;
  }
}

export async function statFile(subpath) {
  try {
    const stats = await fs.stat(getSafePath(subpath));
    return { size: stats.size, mtime: stats.mtime, isDirectory: stats.isDirectory() };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveFile(subpath, content) {
  const fullPath = getSafePath(subpath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

export async function createFolder(subpath) {
  await fs.mkdir(getSafePath(subpath), { recursive: true });
}

export async function deleteEntry(subpath) {
  const fullPath = getSafePath(subpath);
  if (fullPath === PROJECTS_DIR) {
    throw new Error('Refusing to delete the projects root');
  }
  await fs.rm(fullPath, { recursive: true, force: true });
}

export async function renameEntry(fromSubpath, toSubpath) {
  const from = getSafePath(fromSubpath);
  const to = getSafePath(toSubpath);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
}

export async function saveBinaryFile(subpath, buffer) {
  const fullPath = getSafePath(subpath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
}

/** Kept for backwards compatibility with the original image upload route. */
export const saveImageFile = saveBinaryFile;

export async function getImagesInDirectory(projectPath) {
  const scanDirectory = async (dirRelativePath) => {
    let fullPath;
    try {
      fullPath = getSafePath(dirRelativePath);
    } catch {
      return [];
    }
    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isDirectory()) return [];

      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      return await Promise.all(
        entries
          .filter((e) => !e.isDirectory() && IMAGE_EXTENSIONS.includes(extensionOf(e.name)))
          .map(async (entry) => {
            const stat = await fs.stat(path.join(fullPath, entry.name));
            return {
              name: entry.name,
              path: path.posix.join(dirRelativePath, entry.name),
              type: 'file',
              kind: 'image',
              mtime: stat.mtime,
              size: stat.size,
            };
          })
      );
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  };

  const [rootImages, subImages] = await Promise.all([
    scanDirectory(projectPath),
    scanDirectory(path.posix.join(projectPath, 'images')),
  ]);

  return [...rootImages, ...subImages].sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
}

export async function ensureImagesFolderExists(projectPath) {
  await createFolder(path.posix.join(projectPath, 'images'));
}

/**
 * Walk the whole content tree and return every file.
 * Used by global search and by the knowledge indexer.
 */
export async function walkFiles(subpath = '', { maxDepth = 12, depth = 0 } = {}) {
  if (depth >= maxDepth) return [];

  let fullPath;
  try {
    fullPath = getSafePath(subpath);
  } catch {
    return [];
  }

  let entries;
  try {
    entries = await fs.readdir(fullPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
    throw error;
  }

  const results = [];
  for (const entry of entries) {
    if (isHidden(entry.name)) continue;
    const relPath = path.posix.join(subpath || '', entry.name);

    if (entry.isDirectory()) {
      results.push(...(await walkFiles(relPath, { maxDepth, depth: depth + 1 })));
    } else {
      try {
        const stat = await fs.stat(path.join(fullPath, entry.name));
        results.push({
          name: entry.name,
          path: relPath,
          project: subpath || '',
          kind: classifyFile(entry.name),
          size: stat.size,
          mtime: stat.mtime,
        });
      } catch {
        /* file vanished between readdir and stat — skip it */
      }
    }
  }
  return results;
}
