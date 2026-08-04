// Ported from the standalone Nutrition Tracker app's
// app/api/cron/checkin-available/route.js — announces the new week's
// check-in is open. Unconditional (unlike scan-nutrition-reminders' checks),
// scheduled to only run Sundays (see 0014_nutrition_reminder_cron.sql), same
// split as the source app. Rewritten to query the same live public.* tables
// the standalone app itself uses (was originally against Kova's placeholder
// nutrition.* schema) — see CLAUDE.md's nutrition-rebuild section. Only
// announces to clients past onboarding, same reasoning as
// scan-nutrition-reminders: someone still mid-onboarding has no check-in
// cadence to announce yet.
//
// Deploy with: supabase functions deploy scan-nutrition-checkin-available --no-verify-jwt
// Reuses the same CRON_SECRET already set for scan-spc-alerts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushToUser } from "../_shared/expoPush.ts";

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
  const core = admin.schema("core");

  const { data: setting } = await core
    .from("settings")
    .select("value")
    .eq("key", "notify_nutrition_checkin_available")
    .maybeSingle();
  const enabled = (setting?.value ?? true) !== false;

  if (!enabled) {
    return new Response(JSON.stringify({ scanned: 0, pushed: 0, skipped: "disabled", errors: [] }), { status: 200 });
  }

  const { data: clients, error: clientsError } = await admin
    .from("clients")
    .select("id")
    .eq("status", "active")
    .not("objective_tracking_approved_at", "is", null);
  if (clientsError) {
    return new Response(JSON.stringify({ error: clientsError.message }), { status: 500 });
  }

  // Per-user opt-out (design_handoff_v2_settings_nutrition's member Settings
  // screen — migration 0020): the gym-wide toggle above gates whether this
  // announcement sends at all, this gates whether a given member wants it.
  // public.clients.id IS core.users.id (same auth.users row, shared project).
  const clientIds = (clients ?? []).map((c) => c.id);
  const { data: prefRows } = await core
    .from("users")
    .select("id, notify_checkin_available")
    .in("id", clientIds.length > 0 ? clientIds : ["00000000-0000-0000-0000-000000000000"]);
  const prefsByUserId = Object.fromEntries((prefRows ?? []).map((r) => [r.id, r]));

  const results = { scanned: clients?.length ?? 0, pushed: 0, errors: [] as string[] };

  for (const client of clients ?? []) {
    try {
      if (prefsByUserId[client.id]?.notify_checkin_available === false) continue;

      const result = await sendPushToUser(
        admin,
        client.id,
        "Weekly check-in available",
        "Your weekly check-in is ready for you to fill out.",
        { type: "nutrition_checkin_available" }
      );
      if (result.sent > 0) results.pushed += 1;
    } catch (err) {
      results.errors.push(`${client.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
