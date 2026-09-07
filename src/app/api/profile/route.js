import { NextResponse } from 'next/server';
import { profileFromEnv } from '@/lib/user-profile';

export const runtime = 'nodejs';

/**
 * Perfil configurado en el servidor (USER_NAME / USER_ALIASES).
 *
 * Es solo el valor de partida: la interfaz puede sobrescribirlo en sus ajustes
 * sin tocar ficheros ni reiniciar nada.
 */
export function GET() {
    const profile = profileFromEnv();
    return NextResponse.json({
        name: profile.name,
        aliases: profile.aliases.filter((alias) => alias !== profile.name),
        isSet: profile.isSet,
        source: profile.isSet ? 'env' : null,
    });
}
