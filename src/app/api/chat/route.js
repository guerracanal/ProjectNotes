import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { retrieve } from '@/lib/knowledge/retrieve';
import { ASSISTANT_INSTRUCTIONS, buildContextBlock } from '@/lib/knowledge/prompt';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const MAX_HISTORY_TURNS = 12;

function sse(event, data) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request) {
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
    }

    const { message, history = [], scope = null, topK = 8 } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
        return NextResponse.json({ error: 'El mensaje es obligatorio' }, { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
            {
                error: 'missing_api_key',
                message:
                    'Falta ANTHROPIC_API_KEY. Copia .env.example a .env.local y añade tu clave para activar el chatbot.',
            },
            { status: 503 }
        );
    }

    // Retrieve before streaming so a retrieval failure returns a clean HTTP error
    // instead of dying halfway through an already-open stream.
    let retrieval;
    try {
        retrieval = await retrieve(message, {
            limit: Math.min(Math.max(Number(topK) || 8, 1), 20),
            scope,
        });
    } catch (error) {
        console.error('[chat] retrieval failed:', error);
        return NextResponse.json(
            { error: 'retrieval_failed', message: error.message },
            { status: 500 }
        );
    }

    const client = new Anthropic();

    // Keep the frozen instructions in their own cacheable block; the retrieved
    // context changes every turn, so it goes after the breakpoint.
    const system = [
        {
            type: 'text',
            text: ASSISTANT_INSTRUCTIONS,
            cache_control: { type: 'ephemeral' },
        },
        { type: 'text', text: buildContextBlock(retrieval.hits) },
    ];

    const messages = [
        ...history
            .filter((m) => m && typeof m.content === 'string' && m.content.trim())
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-MAX_HISTORY_TURNS)
            .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
    ];

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (event, data) => controller.enqueue(encoder.encode(sse(event, data)));

            // Send the sources first so the UI can render citation chips while
            // the answer is still being generated.
            send('sources', {
                sources: retrieval.hits.map((hit, i) => ({
                    ref: i + 1,
                    path: hit.path,
                    project: hit.project,
                    title: hit.title,
                    heading: hit.heading,
                    excerpt: hit.excerpt,
                })),
                semantic: retrieval.semanticUsed,
                totalChunks: retrieval.totalChunks,
            });

            try {
                const anthropicStream = client.messages.stream({
                    model: MODEL,
                    max_tokens: 8000,
                    thinking: { type: 'adaptive' },
                    output_config: { effort: 'medium' },
                    system,
                    messages,
                });

                for await (const event of anthropicStream) {
                    if (
                        event.type === 'content_block_delta' &&
                        event.delta.type === 'text_delta'
                    ) {
                        send('delta', { text: event.delta.text });
                    }
                }

                const final = await anthropicStream.finalMessage();

                if (final.stop_reason === 'refusal') {
                    send('error', {
                        message:
                            'El modelo declinó responder a esta petición. Reformúlala o consulta las fuentes directamente.',
                    });
                }

                send('done', {
                    usage: {
                        input: final.usage?.input_tokens ?? null,
                        output: final.usage?.output_tokens ?? null,
                        cacheRead: final.usage?.cache_read_input_tokens ?? null,
                    },
                    model: final.model,
                    stopReason: final.stop_reason,
                });
            } catch (error) {
                console.error('[chat] streaming failed:', error);
                send('error', { message: error?.message || 'Error al contactar con el modelo' });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
