// Ported from the standalone Nutrition Tracker app's app/api/cron/reminders/
// route.js (see CLAUDE.md's nutrition section — this app's nutrition module
// is otherwise a one-time logic port, not a live sync, but these two
// reminder triggers didn't exist here at all yet). Two independent checks,
// same as the source app combined them into one daily cron run:
//   1. Daily log reminder — every day, per client, if today's log isn't
//      finalized yet.
//   2. Weekly check-in nag — Mondays only, if last week's check-in was never
//      submitted at all (existence check, not finalized_at — submitting is a
//      client action, finalizing is a coach action in this app's model).
//
// Deploy with: supabase functions deploy scan-nutrition-reminders --no-verify-jwt
// Schedule: supabase/migrations/0014_nutrition_reminder_cron.sql
// Reuses the same CRON_SECRET already set for scan-spc-alerts — Supabase
// function secrets are project-wide, not per-function.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushToUser } from "../_shared/expoPush.ts";

const TIMEZONE = "America/Boise";

function todayInBoise() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dayOfWeekInBoise(dateString: string) {
  return new Date(`${dateString}T12:00:00`).getDay();
}

function addDays(dateString: string, days: number) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Same Sunday-anchored cycle as lib/nutrition/weekCycle.js's
// computeWeekWindows — ported here since Edge Functions can't import from
// the Expo app's lib/ (different runtime, no shared bundler resolution).
function lastWeekStart(today: string) {
  const ANCHOR_DAY = 0;
  const daysSinceAnchor = (dayOfWeekInBoise(today) - ANCHOR_DAY + 7) % 7;
  const currentWeekEnd = addDays(today, -daysSinceAnchor);
  const currentWeekStart = addDays(currentWeekEnd, -6);
  const lastWeekEnd = addDays(currentWeekStart, -1);
  return addDays(lastWeekEnd, -6);
}

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

  const { data: settingRows } = await core
    .from("settings")
    .select("key, value")
    .in("key", ["notify_nutrition_daily_log_reminder", "notify_nutrition_checkin_nag"]);
  const settingsByKey = Object.fromEntries((settingRows ?? []).map((r) => [r.key, r.value]));
  const dailyLogEnabled = settingsByKey.notify_nutrition_daily_log_reminder !== false;
  const checkinNagEnabled = settingsByKey.notify_nutrition_checkin_nag !== false;

  const today = todayInBoise();
  const isMonday = dayOfWeekInBoise(today) === 1;

  const { data: clients, error: clientsError } = await nutrition
    .from("nutrition_clients")
    .select("*")
    .neq("status", "paused");
  if (clientsError) {
    return new Response(JSON.stringify({ error: clientsError.message }), { status: 500 });
  }

  const results = { scanned: clients?.length ?? 0, dailyLogPushed: 0, checkinNagPushed: 0, errors: [] as string[] };

  for (const client of clients ?? []) {
    try {
      if (dailyLogEnabled) {
        const { data: todayLog, error: logError } = await nutrition
          .from("daily_logs")
          .select("finalized_at")
          .eq("user_id", client.user_id)
          .eq("log_date", today)
          .maybeSingle();
        if (logError) throw logError;

        if (!todayLog || !todayLog.finalized_at) {
          const result = await sendPushToUser(
            admin,
            client.user_id,
            "Daily log reminder",
            "Don't forget to log today — weight, macros, steps, sleep.",
            { type: "nutrition_daily_log_reminder" }
          );
          if (result.sent > 0) results.dailyLogPushed += 1;
        }
      }

      if (checkinNagEnabled && isMonday) {
        const weekStart = lastWeekStart(today);
        const { data: response, error: checkinError } = await nutrition
          .from("checkin_responses")
          .select("id")
          .eq("user_id", client.user_id)
          .eq("week_start", weekStart)
          .maybeSingle();
        if (checkinError) throw checkinError;

        if (!response) {
          const result = await sendPushToUser(
            admin,
            client.user_id,
            "Weekly check-in still needed",
            "Your weekly check-in is still open — get it in when you can.",
            { type: "nutrition_checkin_nag" }
          );
          if (result.sent > 0) results.checkinNagPushed += 1;
        }
      }
    } catch (err) {
      results.errors.push(`${client.user_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
