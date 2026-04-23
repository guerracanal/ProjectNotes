import fs from 'fs/promises';
import path from 'path';

const PROJECTS_DIR = path.join(process.cwd(), 'projects_data');

/**
 * Ensures the path is within the projects directory to prevent traversal attacks.
 */
function getSafePath(subpath) {
  const resolvedPath = path.resolve(PROJECTS_DIR, subpath || '');
  if (!resolvedPath.startsWith(PROJECTS_DIR)) {
    throw new Error('Invalid path');
  }
  return resolvedPath;
}

export async function getDirectoryContent(subpath = '') {
  const fullPath = getSafePath(subpath);
  try {
    const stats = await fs.stat(fullPath);
    if (!stats.isDirectory()) {
      throw new Error('Path is not a directory');
    }

    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const items = await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(subpath, entry.name);
      // Skip hidden files
      if (entry.name.startsWith('.')) return null;

      return {
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? 'folder' : 'file',
        mtime: (await fs.stat(path.join(fullPath, entry.name))).mtime,
      };
    }));

    return items.filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error('Error reading directory:', error);
    throw error;
  }
}

export async function getFileContent(subpath) {
  const fullPath = getSafePath(subpath);
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    console.error('Error reading file:', error);
    throw error;
  }
}

export async function saveFile(subpath, content) {
  const fullPath = getSafePath(subpath);
  try {
    await fs.writeFile(fullPath, content, 'utf-8');
  } catch (error) {
    console.error('Error writing file:', error);
    throw error;
  }
}

export async function createFolder(subpath) {
  const fullPath = getSafePath(subpath);
  try {
    await fs.mkdir(fullPath, { recursive: true });
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
}

/**
 * Save a binary file (like an image)
 */
export async function saveImageFile(subpath, buffer) {
  const fullPath = getSafePath(subpath);
  try {
    // Ensure parent directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, buffer);
  } catch (error) {
    console.error('Error writing image file:', error);
    throw error;
  }
}

/**
 * Get all images in the images/ directory of a project
 */
export async function getImagesInDirectory(projectPath) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

  const scanDirectory = async (dirRelativePath) => {
    const fullPath = getSafePath(dirRelativePath);
    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isDirectory()) return [];

      const entries = await fs.readdir(fullPath, { withFileTypes: true });

      const images = await Promise.all(
        entries
          .filter(entry => !entry.isDirectory() && imageExtensions.some(ext => entry.name.toLowerCase().endsWith(ext)))
          .map(async (entry) => {
            const entryPath = path.join(dirRelativePath, entry.name);
            const stat = await fs.stat(path.join(fullPath, entry.name));
            return {
              name: entry.name,
              path: entryPath,
              type: 'file',
              mtime: stat.mtime,
              size: stat.size,
            };
          })
      );
      return images;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      console.error(`Error reading images from ${dirRelativePath}:`, error);
      return [];
    }
  };

  const [rootImages, subImages] = await Promise.all([
    scanDirectory(projectPath),
    scanDirectory(path.join(projectPath, 'images'))
  ]);

  // Combine and sort by date (newest first)
  return [...rootImages, ...subImages].sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
}

/**
 * Ensure the images folder exists for a project
 */
export async function ensureImagesFolderExists(projectPath) {
  const imagesPath = path.join(projectPath, 'images');
  await createFolder(imagesPath);
}
