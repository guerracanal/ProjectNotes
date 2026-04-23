import { NextResponse } from 'next/server';
import { buildProjectTree } from '@/lib/tree-utils';
import { getFileContent } from '@/lib/fs-utils';
import { parseTasks } from '@/lib/task-parser';

export async function GET() {
    try {
        const tree = await buildProjectTree('', 10); // Increase depth to scan all projects

        const allTasks = [];

        // Recursive function to extract tasks from tree
        async function extractTasksFromTree(nodes, parentPath = '') {
            if (!nodes) return;

            for (const node of nodes) {
                const fullPath = node.path;

                // Try to read tasks.md
                try {
                    const tasksContent = await getFileContent(`${fullPath}/tasks.md`);
                    if (tasksContent) {
                        const tasks = parseTasks(tasksContent);
                        const pendingTasks = tasks.filter(t => !t.completed);

                        if (pendingTasks.length > 0) {
                            allTasks.push({
                                projectPath: fullPath,
                                projectName: node.name,
                                tasks: pendingTasks,
                                totalTasks: tasks.length,
                                pendingCount: pendingTasks.length
                            });
                        }
                    }
                } catch (e) {
                    // No tasks.md in this project, continue
                }

                // Recurse into children
                if (node.children && node.children.length > 0) {
                    await extractTasksFromTree(node.children, fullPath);
                }
            }
        }

        await extractTasksFromTree(tree);

        return NextResponse.json({ projects: allTasks });
    } catch (error) {
        console.error('Error fetching all tasks:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
