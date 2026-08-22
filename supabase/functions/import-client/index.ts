// Receives new-client webhooks from a GoHighLevel automation and silently
// (no email sent) creates the auth.users + core.users row a client needs
// to exist in Kova at all — same "core.users can't exist without a real
// auth account" rule as everywhere else in this app. Storing GHL's own
// contactId (not a phone number) is what lets the later registration-code
// flow text the member through GHL's Conversations API without Kova ever
// holding a phone number itself — GHL stays the source of truth for the
// actual number and SMS opt-out state.
//
// The import itself lives in _shared/ghlImport.ts, shared with
// retry-ghl-import so a retry replays the same code path this does.
// Every authenticated call is written to core.ghl_import_log, success or
// failure — GHL's webhook action shows nothing on a non-2xx, so that table
// is the only place a failed import is visible.
//
// Auth: shared-secret header (x-import-secret), not a caller JWT — this is
// called by GHL's automation engine, not a signed-in user. Kept as its own
// secret (GHL_IMPORT_SECRET) rather than reusing CRON_SECRET, so rotating
// one doesn't affect the other. Deploy with:
//   supabase functions deploy import-client --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";
import { dedupeKeyFor, recordGhlImport, runGhlImport } from "../_shared/ghlImport.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Deliberately NOT logged: a wrong secret is not an import attempt, and
  // logging one would let anyone who can reach the URL grow this table at
  // will. Everything past this line has proved it is GHL.
  const providedSecret = req.headers.get("x-import-secret");
  const expectedSecret = Deno.env.get("GHL_IMPORT_SECRET");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const raw = await req.text();
  let payload: Record<string, any> | null = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Still worth a row: an unparseable body means the GHL action is
    // misconfigured, and that is exactly the kind of thing nobody notices.
    // Keyed by the body's own hash, so a repeated misconfiguration is one
    // row rather than one per delivery. Truncated — this is a diagnostic,
    // not an archive.
    const stub = { _unparseable: true, _raw: raw.slice(0, 2000) };
    await recordGhlImport(adminClient, {
      dedupeKey: await dedupeKeyFor(null, stub),
      result: { status: "failed", error: "Invalid JSON body", name: null, email: null, contactId: null, userId: null },
      payload: stub,
    });
    return json({ error: "Invalid JSON body" }, 400);
  }

  const result = await runGhlImport(adminClient, payload);
  await recordGhlImport(adminClient, {
    dedupeKey: await dedupeKeyFor(result.email, payload),
    result,
    payload,
  });

  if (result.status === "failed") {
    return json({ error: result.error, detail: result.detail, received: payload }, result.httpStatus);
  }

  if (result.status === "partial") {
    // Deliberately 200, not an error status. GHL's webhook action shows
    // nothing on a non-2xx, so a 500 here is invisible; a 200 carrying a
    // warning at least lands in its log, and the account is usable.
    console.warn(`import-client: ${result.detail}`);
    return json({ imported: true, warning: result.error, detail: result.detail, profile: result.profile }, 200);
  }

  return json({ imported: true, profile: result.profile }, 200);
});
