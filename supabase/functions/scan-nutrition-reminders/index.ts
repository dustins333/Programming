// Ported from the standalone Nutrition Tracker app's app/api/cron/reminders/
// route.js. Originally written against Kova's placeholder nutrition.*
// schema — now rewritten to query the same live public.* tables the
// standalone app itself uses, matching the rest of the nutrition rebuild
// (see CLAUDE.md's nutrition-rebuild section). Two independent checks, same
// as the source app combined them into one daily cron run:
//   1. Daily log reminder — every day, per client, if today's log isn't
//      finalized yet.
//   2. Weekly check-in nag — Mondays only, if last week's check-in was never
//      submitted at all (existence check, not finalized_at — submitting is a
//      client action, finalizing is a coach action in this app's model).
// Only scans clients past onboarding (objective_tracking_approved_at set) —
// someone still mid-onboarding has no daily-log/check-in cadence yet, so
// nagging them about either would be wrong. That condition has no
// placeholder-schema equivalent since that schema had no onboarding concept
// at all — this is a real behavior addition, not just a rename.
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

  const { data: clients, error: clientsError } = await admin
    .from("clients")
    .select("*")
    .eq("status", "active")
    .not("objective_tracking_approved_at", "is", null);
  if (clientsError) {
    return new Response(JSON.stringify({ error: clientsError.message }), { status: 500 });
  }

  // Per-user opt-out (design_handoff_v2_settings_nutrition's member Settings
  // screen — migration 0020) on top of the gym-wide toggle above, for the
  // daily-log reminder only: both have to allow it for it to send. The
  // Monday check-in nag below has no matching member-facing toggle (the
  // mock's 3 member toggles are Daily log reminder / Weekly check-in
  // available / Coach messages — "available" maps to the OTHER function,
  // scan-nutrition-checkin-available's Sunday announcement, not this nag) —
  // it stays gated by the admin toggle only, same as before. Batched in one
  // query rather than per-client, same "no N+1" convention this app uses
  // elsewhere. public.clients.id IS core.users.id (same auth.users row,
  // shared project).
  const clientIds = (clients ?? []).map((c) => c.id);
  const { data: prefRows } = await core
    .from("users")
    .select("id, notify_daily_log_reminder")
    .in("id", clientIds.length > 0 ? clientIds : ["00000000-0000-0000-0000-000000000000"]);
  const prefsByUserId = Object.fromEntries((prefRows ?? []).map((r) => [r.id, r]));

  const results = { scanned: clients?.length ?? 0, dailyLogPushed: 0, checkinNagPushed: 0, errors: [] as string[] };

  for (const client of clients ?? []) {
    try {
      const prefs = prefsByUserId[client.id];
      const userWantsDailyLog = prefs?.notify_daily_log_reminder !== false;

      if (dailyLogEnabled && userWantsDailyLog) {
        const { data: todayLog, error: logError } = await admin
          .from("daily_logs")
          .select("finalized_at")
          .eq("client_id", client.id)
          .eq("date", today)
          .maybeSingle();
        if (logError) throw logError;

        if (!todayLog || !todayLog.finalized_at) {
          const result = await sendPushToUser(
            admin,
            client.id,
            "Daily log reminder",
            "Don't forget to log today — weight, macros, steps, sleep.",
            { type: "nutrition_daily_log_reminder" }
          );
          if (result.sent > 0) results.dailyLogPushed += 1;
        }
      }

      if (checkinNagEnabled && isMonday) {
        const weekStart = lastWeekStart(today);
        const { data: response, error: checkinError } = await admin
          .from("checkin_responses")
          .select("id")
          .eq("client_id", client.id)
          .eq("week_start", weekStart)
          .maybeSingle();
        if (checkinError) throw checkinError;

        if (!response) {
          const result = await sendPushToUser(
            admin,
            client.id,
            "Weekly check-in still needed",
            "Your weekly check-in is still open — get it in when you can.",
            { type: "nutrition_checkin_nag" }
          );
          if (result.sent > 0) results.checkinNagPushed += 1;
        }
      }
    } catch (err) {
      results.errors.push(`${client.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
