import { NextResponse } from 'next/server';
import { retrieve } from '@/lib/knowledge/retrieve';
import { buildContextBlock, buildInstructions } from '@/lib/knowledge/prompt';
import { normalizeProfile, profileFromEnv } from '@/lib/user-profile';
import {
    defaultProviderId,
    getProvider,
    isConfigured,
    providerConfig,
} from '@/lib/knowledge/providers';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_HISTORY_TURNS = 12;
const MAX_TOKENS = 4000;

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

    const {
        message,
        history = [],
        scope = null,
        topK = 8,
        provider: requestedProvider,
        model,
        profile: requestedProfile,
    } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
        return NextResponse.json({ error: 'El mensaje es obligatorio' }, { status: 400 });
    }

    const providerId = requestedProvider || defaultProviderId();

    if (!providerId) {
        return NextResponse.json(
            {
                error: 'no_provider',
                message:
                    'No hay ningún proveedor de chat configurado. Copia .env.example a .env.local y añade una clave: Gemini y Groq tienen plan gratuito.',
            },
            { status: 503 }
        );
    }

    const provider = getProvider(providerId);
    if (!provider) {
        return NextResponse.json(
            { error: 'unknown_provider', message: `Proveedor desconocido: ${providerId}` },
            { status: 400 }
        );
    }

    if (!isConfigured(providerId)) {
        return NextResponse.json(
            {
                error: 'missing_api_key',
                message: `Falta ${provider.envKey} para usar ${provider.label}. Añádela a .env.local.`,
            },
            { status: 503 }
        );
    }

    // Lo que se configura en la interfaz manda sobre el entorno: es lo que la
    // persona acaba de escribir, y no obliga a reiniciar el servidor.
    const envProfile = profileFromEnv();
    const profile = requestedProfile?.name || requestedProfile?.aliases?.length
        ? normalizeProfile(requestedProfile)
        : envProfile;

    // Retrieve before opening the stream, so a retrieval failure is a clean
    // HTTP error rather than a half-written answer.
    let retrieval;
    try {
        retrieval = await retrieve(message, {
            limit: Math.min(Math.max(Number(topK) || 8, 1), 20),
            scope,
            profile,
        });
    } catch (error) {
        console.error('[chat] retrieval failed:', error);
        return NextResponse.json(
            { error: 'retrieval_failed', message: error.message },
            { status: 500 }
        );
    }

    const config = providerConfig(providerId);
    const contextBlock = buildContextBlock(retrieval.hits);

    // Anthropic takes the two halves separately so the instructions can carry a
    // cache breakpoint; every other provider takes one system string.
    const instructions = buildInstructions(profile);
    const system =
        providerId === 'anthropic'
            ? { instructions, context: contextBlock }
            : `${instructions}\n\n${contextBlock}`;

    const messages = [
        ...history
            .filter((m) => m && typeof m.content === 'string' && m.content.trim())
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-MAX_HISTORY_TURNS)
            .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message },
    ];

    const encoder = new TextEncoder();
    const abortController = new AbortController();
    // Stop paying for tokens the moment the browser goes away.
    request.signal?.addEventListener('abort', () => abortController.abort());

    const stream = new ReadableStream({
        async start(controller) {
            let closed = false;
            const send = (event, data) => {
                if (closed) return;
                controller.enqueue(encoder.encode(sse(event, data)));
            };

            // Sources first, so the citation chips are on screen while the
            // answer is still being generated.
            send('sources', {
                sources: retrieval.hits.map((hit, i) => ({
                    ref: i + 1,
                    path: hit.path,
                    project: hit.project,
                    title: hit.title,
                    heading: hit.heading,
                    excerpt: hit.excerpt,
                    start: hit.start ?? null,
                    media: hit.media ?? null,
                })),
                semantic: retrieval.semanticUsed,
                totalChunks: retrieval.totalChunks,
                expandedWithProfile: retrieval.expandedWithProfile ?? false,
                provider: providerId,
                model: model || config.model,
            });

            try {
                const iterator = provider.stream({
                    system,
                    messages,
                    model: model || config.model,
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl,
                    maxTokens: MAX_TOKENS,
                    signal: abortController.signal,
                });

                for await (const event of iterator) {
                    if (event.type === 'delta') {
                        send('delta', { text: event.text });
                    } else if (event.type === 'notice') {
                        // Something the user should know about the request, but
                        // that did not stop it — e.g. a retired model swapped
                        // for the replacement the provider named.
                        send('notice', { message: event.text });
                    } else if (event.type === 'done') {
                        if (event.stopReason === 'refusal') {
                            send('error', {
                                message:
                                    'El modelo declinó responder a esta petición. Reformúlala o consulta las fuentes directamente.',
                            });
                        }
                        send('done', {
                            usage: event.usage ?? null,
                            provider: providerId,
                            model: event.model || model || config.model,
                            stopReason: event.stopReason ?? null,
                        });
                    }
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(`[chat] ${providerId} stream failed:`, error);
                    send('error', {
                        message: error?.message || `Error al contactar con ${provider.label}`,
                    });
                }
            } finally {
                closed = true;
                controller.close();
            }
        },

        cancel() {
            abortController.abort();
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
