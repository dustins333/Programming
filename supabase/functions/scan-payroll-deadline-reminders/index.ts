// Reminds any coach who hasn't finalized their payroll for the current pay
// period once the configured weekly deadline passes (Terra's real ask: "I
// want them to have their time in by a certain time on Wednesday"). Runs on
// a schedule (see supabase/migrations/0038_payroll_deadline_cron.sql) via
// pg_cron + pg_net, same shape as scan-spc-alerts — this function has no
// caller JWT (invoked by the database itself), auth is the CRON_SECRET
// header check below.
//
// Deploy with: supabase functions deploy scan-payroll-deadline-reminders --no-verify-jwt
// Requires the same CRON_SECRET function secret already set for
// scan-spc-alerts (Supabase function secrets are project-wide, no new
// secret needed).
//
// Period math is a standalone reimplementation of lib/payroll/periods.js's
// anchor + 14-day cadence — Edge Functions run in Deno and can't import the
// RN app's lib/ code, same reason scan-spc-alerts reimplements addDays/
// rangesOverlap itself instead of sharing lib/programming/blocks.js.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushToUser } from "../_shared/expoPush.ts";

const TIMEZONE = "America/Boise";
const PERIOD_LENGTH_DAYS = 14;

function todayInBoise() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// 0=Sunday..6=Saturday, matching lib/boiseDate.js's dayOfWeekInBoise().
function weekdayInBoise(dateString: string) {
  return new Date(`${dateString}T12:00:00`).getDay();
}

// "HH:MM" in Boise local time, for comparing against the configured
// deadline time.
function currentTimeInBoise() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function daysBetween(fromDate: string, toDate: string) {
  const from = new Date(fromDate + "T00:00:00");
  const to = new Date(toDate + "T00:00:00");
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(dateString: string, days: number) {
  const d = new Date(dateString + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function computePeriodStart(dateString: string, anchorDate: string) {
  const offset = daysBetween(anchorDate, dateString);
  const periodIndex = Math.floor(offset / PERIOD_LENGTH_DAYS);
  return addDays(anchorDate, periodIndex * PERIOD_LENGTH_DAYS);
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
  const payroll = admin.schema("payroll");

  const { data: settingRows } = await core
    .from("settings")
    .select("key, value")
    .in("key", ["payroll_period_anchor_date", "payroll_deadline_weekday", "payroll_deadline_time", "notify_payroll_deadline_reminders"]);
  const settingsByKey = Object.fromEntries((settingRows ?? []).map((r) => [r.key, r.value]));

  const pushEnabled = settingsByKey.notify_payroll_deadline_reminders !== false;
  const anchorDate = settingsByKey.payroll_period_anchor_date ?? "2025-10-02";
  const deadlineWeekday = Number(settingsByKey.payroll_deadline_weekday ?? 3);
  const deadlineTime = settingsByKey.payroll_deadline_time ?? "17:00";

  const today = todayInBoise();

  // Only fire on the configured weekday, once the configured time has
  // passed — this function can run every 15-30 minutes via cron without
  // spamming a reminder on every single invocation.
  if (weekdayInBoise(today) !== deadlineWeekday || currentTimeInBoise() < deadlineTime) {
    return new Response(JSON.stringify({ skipped: true, reason: "not yet the configured deadline window" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const periodStart = computePeriodStart(today, anchorDate);

  const { data: periodRow } = await payroll.from("pay_periods").select("closed").eq("start_date", periodStart).maybeSingle();
  if (periodRow?.closed) {
    return new Response(JSON.stringify({ skipped: true, reason: "period already closed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: staff, error: staffError } = await core.from("users").select("id, name").in("role", ["admin", "coach"]);
  if (staffError) {
    return new Response(JSON.stringify({ error: staffError.message }), { status: 500 });
  }

  const { data: finalizations, error: finalizationsError } = await payroll
    .from("finalizations")
    .select("user_id, finalized_at, reopened_at")
    .eq("pay_period_start", periodStart);
  if (finalizationsError) {
    return new Response(JSON.stringify({ error: finalizationsError.message }), { status: 500 });
  }
  const finalizationByUser = new Map((finalizations ?? []).map((f) => [f.user_id, f]));

  const isLocked = (f: { finalized_at: string | null; reopened_at: string | null } | undefined) => {
    if (!f?.finalized_at) return false;
    if (!f.reopened_at) return true;
    return new Date(f.finalized_at) > new Date(f.reopened_at);
  };

  const results = { scanned: staff?.length ?? 0, reminded: 0, errors: [] as string[] };

  if (pushEnabled) {
    for (const person of staff ?? []) {
      if (isLocked(finalizationByUser.get(person.id))) continue;
      try {
        const pushResult = await sendPushToUser(
          admin,
          person.id,
          "Payroll due today",
          "Finalize your payroll entries for this pay period before the deadline.",
          { type: "payroll_deadline_reminder", periodStart }
        );
        if (pushResult.sent > 0) results.reminded += 1;
      } catch (err) {
        results.errors.push(`${person.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
