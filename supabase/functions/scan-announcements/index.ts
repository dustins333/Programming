// Server-side counterpart to the "Send now" path in send-announcement —
// this one catches *scheduled* announcements once their send_at actually
// passes, independent of anyone having the app open. Runs on a schedule
// (see supabase/migrations/0025_announcement_push_cron.sql) via pg_cron +
// pg_net, same pattern as scan-spc-alerts.
//
// Deploy with: supabase functions deploy scan-announcements --no-verify-jwt
// (pg_net's cron call carries no user JWT — auth is the CRON_SECRET header
// check below, same shared secret already set for scan-spc-alerts/the
// nutrition reminder scans: supabase secrets set CRON_SECRET=<value>.)
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendAnnouncementPush } from "../_shared/announcementAudience.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Due (send_at passed) and not yet pushed — "Send now" announcements are
  // already pushed by send-announcement by the time this next runs, so
  // this only ever picks up genuinely scheduled ones (plus a safety net if
  // send-announcement's direct call ever failed to fire).
  const { data: pending, error: fetchError } = await admin
    .schema("programming")
    .from("announcements")
    .select("*")
    .lte("send_at", new Date().toISOString())
    // Skip anything that has already expired (migration 0072). A scheduled
    // announcement whose window closed before this scan reached it is
    // invisible to members, so pushing it would notify people about
    // something they then can't open.
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    // In-app-only announcements (migration 0097) must never be fetched here.
    // They keep pushed_at null forever by design, so without this filter
    // they would be re-scanned on every run for the rest of their life.
    .eq("send_push", true)
    .is("pushed_at", null);
  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
  }

  const results = { scanned: pending?.length ?? 0, pushed: 0, errors: [] as string[] };

  for (const announcement of pending ?? []) {
    try {
      const result = await sendAnnouncementPush(admin, announcement);
      if (result.pushed > 0) results.pushed += 1;
    } catch (err) {
      results.errors.push(`${announcement.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
