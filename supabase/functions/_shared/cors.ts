// Every Edge Function in this project is called cross-origin from the web
// build (app.kovastrength.com -> *.supabase.co), which means the browser
// sends a CORS preflight (OPTIONS) before the real request. None of these
// functions handled it — no Access-Control-Allow-Origin header anywhere,
// no OPTIONS branch — so the preflight always 405'd and the browser silently
// blocked every real call, on every function, for every web user. Totally
// invisible from curl/native (CORS is a browser-only mechanism) or from
// server-to-server calls (GHL webhooks, pg_cron), which is exactly why this
// went unnoticed until a real client (Cozeth) hit it registering on web.
// Real-world confirmed 2026-08-06 — see CLAUDE.md.
//
// Usage in a function's Deno.serve handler:
//   if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
//   ...
//   return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-secret, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
