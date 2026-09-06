import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

/**
 * Digital Asset Links, for the Android TWA wrapper.
 *
 * Android only drops the browser address bar once this file proves that the
 * signing certificate of the installed APK is allowed to act for this origin.
 * It stays a 404 until both values are configured, which is the honest answer
 * — an empty or placeholder file would make verification fail silently.
 *
 *   ANDROID_PACKAGE_ID          e.g. com.projectnotes.twa
 *   ANDROID_SHA256_FINGERPRINT  the colon-separated SHA-256 of the signing cert
 *                               (Bubblewrap prints it, or use `keytool -list -v`)
 */
export function GET() {
    const packageName = process.env.ANDROID_PACKAGE_ID;
    const fingerprint = process.env.ANDROID_SHA256_FINGERPRINT;

    if (!packageName || !fingerprint) {
        return new NextResponse(null, { status: 404 });
    }

    return NextResponse.json(
        [
            {
                relation: ['delegate_permission/common.handle_all_urls'],
                target: {
                    namespace: 'android_app',
                    package_name: packageName,
                    sha256_cert_fingerprints: fingerprint.split(',').map((f) => f.trim()),
                },
            },
        ],
        { headers: { 'Content-Type': 'application/json' } }
    );
}
