import { NextResponse } from 'next/server';
import { buildProjectTree } from '@/lib/tree-utils';

export async function GET() {
    try {
        const tree = await buildProjectTree();
        return NextResponse.json({ tree });
    } catch (error) {
        console.error('Error building project tree:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
