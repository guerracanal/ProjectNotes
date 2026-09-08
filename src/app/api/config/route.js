/**
 * API endpoint to expose non-sensitive configuration
 * Returns environment variables that are safe to expose to the frontend
 */
export async function GET(request) {
    return Response.json({
        googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    });
}
