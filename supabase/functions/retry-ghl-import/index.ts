// Admin-only: replays a GHL import from the payload core.ghl_import_log
// stored when the webhook first arrived, so a failed import can be fixed
// without asking Terra to re-fire the GHL automation (which she often
// cannot do — the "won" trigger fires on a pipeline event, not on demand).
//
// The import itself is _shared/ghlImport.ts, the same code path the webhook
// takes. A retry that ran its own implementation would prove nothing about
// the path GHL actually uses.
//
// Deploy with (JWT verification ON — unlike import-client, this one is
// called by a signed-in admin from the app):
//   supabase functions deploy retry-ghl-import
//
// Caller must be an admin; enforced here rather than left to RLS, because
// the work happens under the service role and RLS never sees it. Same shape
// as invite-staff.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { dedupeKeyFor, recordGhlImport, runGhlImport } from "../_shared/ghlImport.ts";

// A bulk retry after a batch import can be large; cap it so one call can't
// run for minutes against the Auth Admin API. The response says how many
// were left, rather than silently truncating.
const BULK_LIMIT = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const callerClient = createClient(supabaseUrl, serviceRoleKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();
  if (callerError || !caller) return json({ error: "Invalid or expired session" }, 401);

  const { data: callerProfile } = await adminClient
    .schema("core")
    .from("users")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (!callerProfile || callerProfile.role !== "admin") {
    return json({ error: "Only an admin can retry a GHL import" }, 403);
  }

  let body: { logId?: string; all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Select `payload` explicitly — it is the one column the app never reads
  // and the whole reason this endpoint exists.
  let query = adminClient
    .schema("core")
    .from("ghl_import_log")
    .select("id, dedupe_key, payload, status");

  if (body.logId) {
    query = query.eq("id", body.logId);
  } else if (body.all) {
    // Oldest first: in a bulk migration the earliest failure is the one
    // that has been broken longest.
    query = query.in("status", ["failed", "partial"]).order("first_received_at", { ascending: true }).limit(BULK_LIMIT);
  } else {
    return json({ error: "Pass either logId or all: true" }, 400);
  }

  const { data: rows, error: readError } = await query;
  if (readError) return json({ error: readError.message }, 500);
  if (!rows?.length) return json({ error: "No matching import to retry" }, 404);

  const outcomes = [];
  for (const row of rows) {
    const result = await runGhlImport(adminClient, row.payload as Record<string, any>);
    await recordGhlImport(adminClient, {
      // Re-derive rather than reusing row.dedupe_key: if the stored payload
      // is keyed by hash (no email) and a fix has since given it one, the
      // retry should land on the email key. The hash-keyed row is left
      // behind as the record of the original malformed delivery.
      dedupeKey: await dedupeKeyFor(result.email, row.payload),
      result,
      payload: row.payload,
      isRetry: true,
      retriedBy: caller.id,
    });
    outcomes.push({
      logId: row.id,
      email: result.email,
      status: result.status,
      detail: result.detail,
    });
  }

  const remaining = body.all && rows.length === BULK_LIMIT ? "more may remain — run it again" : null;
  return json(
    {
      retried: outcomes.length,
      imported: outcomes.filter((o) => o.status === "imported").length,
      partial: outcomes.filter((o) => o.status === "partial").length,
      failed: outcomes.filter((o) => o.status === "failed").length,
      remaining,
      outcomes,
    },
    200,
  );
});
