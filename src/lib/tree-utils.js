import { getDirectoryContent } from './fs-utils';

/**
 * Recursively builds a tree of projects
 */
export async function buildProjectTree(subpath = '', maxDepth = 10, currentDepth = 0) {
    if (currentDepth >= maxDepth) {
        return null;
    }

    const items = await getDirectoryContent(subpath);
    if (!items) return null;

    const folders = items.filter(item => item.type === 'folder');

    const children = await Promise.all(folders.map(async (folder) => {
        const childTree = await buildProjectTree(folder.path, maxDepth, currentDepth + 1);
        return {
            name: folder.name,
            path: folder.path,
            children: childTree
        };
    }));

    return children;
}
