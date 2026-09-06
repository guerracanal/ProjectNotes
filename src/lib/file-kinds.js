/**
 * Extension lists shared by client components.
 *
 * `fs-utils` also exports these, but that module imports `fs`, so importing it
 * from a client component would pull Node built-ins into the browser bundle.
 */

export const TEXT_EXTENSIONS = ['.md', '.txt', '.markdown', '.csv', '.json', '.log'];
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif'];
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.mov', '.avi'];
export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.flac'];
export const DOC_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt',
];

export function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

/** Pick the Icon name that best represents a file. */
export function iconForFile(name) {
  const ext = extensionOf(name);
  if (ext === '.pdf') return 'file';
  if (['.doc', '.docx', '.odt'].includes(ext)) return 'file-text';
  if (['.ppt', '.pptx'].includes(ext)) return 'presentation';
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'table';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'mic';
  if (TEXT_EXTENSIONS.includes(ext)) return 'file-text';
  return 'file';
}

export function isTranscriptName(name) {
  return /transcripcion|transcription|transcript/i.test(name);
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
