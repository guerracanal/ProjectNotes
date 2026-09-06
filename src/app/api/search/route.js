import { NextResponse } from 'next/server';
import { searchDocuments } from '@/lib/knowledge/retrieve';

export const runtime = 'nodejs';

/** Full-text search across every note, task list and transcript. */
export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const scope = searchParams.get('scope') || null;
    const limit = Math.min(Number(searchParams.get('limit')) || 25, 60);

    if (!query.trim()) {
        return NextResponse.json({ results: [], query });
    }

    try {
        const results = await searchDocuments(query, { limit, scope });
        return NextResponse.json({ results, query });
    } catch (error) {
        console.error('[search] failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
