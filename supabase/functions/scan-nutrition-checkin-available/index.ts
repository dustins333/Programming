// Ported from the standalone Nutrition Tracker app's
// app/api/cron/checkin-available/route.js — announces the new week's
// check-in is open. Unconditional (unlike scan-nutrition-reminders' checks),
// scheduled to only run Sundays (see 0014_nutrition_reminder_cron.sql), same
// split as the source app.
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
  const nutrition = admin.schema("nutrition");
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

  const { data: clients, error: clientsError } = await nutrition
    .from("nutrition_clients")
    .select("user_id")
    .neq("status", "paused");
  if (clientsError) {
    return new Response(JSON.stringify({ error: clientsError.message }), { status: 500 });
  }

  const results = { scanned: clients?.length ?? 0, pushed: 0, errors: [] as string[] };

  for (const client of clients ?? []) {
    try {
      const result = await sendPushToUser(
        admin,
        client.user_id,
        "Weekly check-in available",
        "Your weekly check-in is ready for you to fill out.",
        { type: "nutrition_checkin_available" }
      );
      if (result.sent > 0) results.pushed += 1;
    } catch (err) {
      results.errors.push(`${client.user_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
