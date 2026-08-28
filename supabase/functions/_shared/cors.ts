// Edge Functions get no CORS headers by default — the frontend calls these
// straight from the browser, so every response (including OPTIONS preflight)
// needs them explicitly.
//
// FRONTEND_ORIGIN is a comma-separated allow-list (e.g.
// "https://faction-conquest.vercel.app,http://localhost:5173"), not a single
// value — a hardcoded single origin broke local dev entirely (any origin
// other than the exact configured one gets a mismatched
// Access-Control-Allow-Origin, which the browser reports as "Failed to
// fetch", not as a helpful CORS error). "*" allows any origin.
const ALLOWED_ORIGINS = (Deno.env.get("FRONTEND_ORIGIN") ?? "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function resolveOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (ALLOWED_ORIGINS.includes("*")) return origin ?? "*";
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  // Origin not on the allow-list — still return a well-formed response
  // (never leave the header empty), the browser just won't accept it.
  return ALLOWED_ORIGINS[0] ?? "*";
}

function corsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function handleOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  return null;
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
