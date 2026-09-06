import { NextResponse } from 'next/server';
import { getIndexStats, rebuildIndex } from '@/lib/knowledge/store';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Index health: how many documents, chunks and transcripts are searchable. */
export async function GET() {
    try {
        const stats = await getIndexStats();
        return NextResponse.json({
            ...stats,
            chatEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
        });
    } catch (error) {
        console.error('[knowledge] stats failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/** Force a full rebuild — useful after a bulk Google Drive sync. */
export async function POST() {
    try {
        await rebuildIndex();
        const stats = await getIndexStats();
        return NextResponse.json({ success: true, ...stats });
    } catch (error) {
        console.error('[knowledge] rebuild failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
