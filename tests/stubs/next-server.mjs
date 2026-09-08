/**
 * Lo mínimo de `next/server` para poder ejecutar una ruta de la API fuera de
 * Next. `NextResponse.json` es un `Response` con la cabecera puesta, así que
 * la ruta se comporta igual y el test lee la respuesta con `await res.json()`.
 */
export const NextResponse = {
  json(body, init = {}) {
    return new Response(JSON.stringify(body), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  },
};
