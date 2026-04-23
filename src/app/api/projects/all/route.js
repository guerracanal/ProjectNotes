import { NextResponse } from 'next/server';
import { buildProjectTree } from '@/lib/tree-utils';

/**
 * Aplana el árbol de proyectos recursivamente
 * @param {Array} tree - Árbol de proyectos
 * @param {number} depth - Profundidad actual
 * @returns {Array} - Lista plana de proyectos
 */
function flattenTree(tree, depth = 0) {
    let projects = [];

    if (!tree || !Array.isArray(tree)) {
        return projects;
    }

    for (const node of tree) {
        projects.push({
            name: node.name,
            path: node.path,
            depth: depth,
            hasChildren: node.children && node.children.length > 0
        });

        if (node.children && node.children.length > 0) {
            projects = projects.concat(flattenTree(node.children, depth + 1));
        }
    }

    return projects;
}

export async function GET() {
    try {
        const tree = await buildProjectTree();
        const allProjects = flattenTree(tree);

        return NextResponse.json({
            projects: allProjects,
            total: allProjects.length
        });
    } catch (error) {
        console.error('Error fetching all projects:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
