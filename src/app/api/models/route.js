import { NextResponse } from 'next/server';
import {
    defaultProviderId,
    describeProviders,
    getProvider,
    isConfigured,
    providerConfig,
} from '@/lib/knowledge/providers';

export const runtime = 'nodejs';

/**
 * Which chat providers are usable, and what models each one offers.
 *
 * Model lists are fetched live from each provider rather than hardcoded:
 * these catalogues change often enough that a baked-in list goes stale and
 * starts offering models that no longer exist.
 */
export async function GET() {
    const providers = describeProviders();
    const active = defaultProviderId();

    const withModels = await Promise.all(
        providers.map(async (entry) => {
            if (!entry.configured) return { ...entry, models: [], available: false };

            const provider = getProvider(entry.id);
            const config = providerConfig(entry.id);

            try {
                const models = await provider.listModels({
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl,
                });
                return { ...entry, models, available: models.length > 0 };
            } catch (error) {
                // A provider that is configured but unreachable (Ollama not
                // running, a revoked key) is reported rather than hidden, so
                // the reason shows up in the picker.
                return {
                    ...entry,
                    models: [],
                    available: false,
                    error: error.message,
                };
            }
        })
    );

    return NextResponse.json({
        providers: withModels,
        active,
        anyAvailable: withModels.some((p) => p.available),
    });
}
