// Reminds any coach who hasn't finalized their payroll for the pay period
// that just ended. Two reminders per period:
//
//   1. On the period's LAST day, at payroll_deadline_time (default 20:00
//      Boise) — "payroll is due tonight".
//   2. The next morning, at payroll_deadline_followup_time (default 12:00
//      Boise) — only to whoever still hasn't finalized.
//
// Both windows are anchored to the pay period's own boundary, NOT to a
// weekday. The original version fired on a configured weekday alone
// (payroll_deadline_weekday), which meant it also fired on the Wednesday in
// the MIDDLE of every 14-day period — a week early, with nothing actually
// due. Since the anchor date (2025-10-02) is a Thursday, every period ends
// on a Wednesday, so "the last day of the period" and "Wednesday" coincide
// for real — but only the boundary version can't drift.
//
// Runs on a schedule (see supabase/migrations/0038_payroll_deadline_cron.sql)
// via pg_cron + pg_net, same shape as scan-spc-alerts — this function has no
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
const LAST_SENT_KEY = "payroll_deadline_reminder_last_sent";

function todayInBoise() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// "HH:MM" in Boise local time, for comparing against the configured
// deadline times. The cron job polls hourly and this is what actually gates
// the send, so the reminder lands at the right Boise hour year-round —
// a fixed-UTC cron would drift an hour across DST and silently miss.
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

function skip(reason: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ skipped: true, reason, ...extra }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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
    .in("key", [
      "payroll_period_anchor_date",
      "payroll_deadline_time",
      "payroll_deadline_followup_time",
      "notify_payroll_deadline_reminders",
      LAST_SENT_KEY,
    ]);
  const settingsByKey = Object.fromEntries((settingRows ?? []).map((r) => [r.key, r.value]));

  const pushEnabled = settingsByKey.notify_payroll_deadline_reminders !== false;
  const anchorDate = settingsByKey.payroll_period_anchor_date ?? "2025-10-02";
  const deadlineTime = settingsByKey.payroll_deadline_time ?? "20:00";
  const followupTime = settingsByKey.payroll_deadline_followup_time ?? "12:00";
  const lastSent = settingsByKey[LAST_SENT_KEY] ?? null;

  const today = todayInBoise();
  const now = currentTimeInBoise();

  // Which period is today inside of, and where are its edges?
  const thisPeriodStart = computePeriodStart(today, anchorDate);
  const thisPeriodEnd = addDays(thisPeriodStart, PERIOD_LENGTH_DAYS - 1);

  // Two windows, and they can never fall on the same calendar day (the
  // follow-up day is the first day of the NEXT period), which is why one
  // last-sent string is enough to keep both idempotent.
  let stage: "final" | "followup" | null = null;
  let targetPeriodStart = thisPeriodStart;

  if (today === thisPeriodEnd && now >= deadlineTime) {
    stage = "final";
    targetPeriodStart = thisPeriodStart;
  } else if (today === thisPeriodStart && now >= followupTime) {
    // First day of a new period = the day after the previous one ended, so
    // the reminder is about that previous period, not the one starting now.
    stage = "followup";
    targetPeriodStart = addDays(thisPeriodStart, -PERIOD_LENGTH_DAYS);
  }

  if (!stage) {
    return skip("outside both reminder windows", { today, now, thisPeriodStart, thisPeriodEnd });
  }

  // The cron polls hourly; without this the same reminder would re-send on
  // every poll for the rest of the day. Same guard shape as
  // nutrition_checkin_available_last_sent_date.
  const marker = `${targetPeriodStart}:${stage}`;
  if (lastSent === marker) {
    return skip("already sent this reminder", { marker });
  }

  const { data: periodRow } = await payroll
    .from("pay_periods")
    .select("closed")
    .eq("start_date", targetPeriodStart)
    .maybeSingle();
  if (periodRow?.closed) {
    return skip("period already closed", { targetPeriodStart });
  }

  const { data: staff, error: staffError } = await core.from("users").select("id, name").in("role", ["admin", "coach"]);
  if (staffError) {
    return new Response(JSON.stringify({ error: staffError.message }), { status: 500 });
  }

  const { data: finalizations, error: finalizationsError } = await payroll
    .from("finalizations")
    .select("user_id, finalized_at, reopened_at")
    .eq("pay_period_start", targetPeriodStart);
  if (finalizationsError) {
    return new Response(JSON.stringify({ error: finalizationsError.message }), { status: 500 });
  }
  const finalizationByUser = new Map((finalizations ?? []).map((f) => [f.user_id, f]));

  const isLocked = (f: { finalized_at: string | null; reopened_at: string | null } | undefined) => {
    if (!f?.finalized_at) return false;
    if (!f.reopened_at) return true;
    return new Date(f.finalized_at) > new Date(f.reopened_at);
  };

  const title = stage === "final" ? "Payroll due tonight" : "Payroll still not submitted";
  const body =
    stage === "final"
      ? "This pay period ends today — finalize your payroll entries before you head out."
      : "Your payroll for the pay period that just ended still isn't submitted. Finalize it today.";

  const results = {
    stage,
    targetPeriodStart,
    scanned: staff?.length ?? 0,
    reminded: 0,
    errors: [] as string[],
  };

  if (pushEnabled) {
    for (const person of staff ?? []) {
      if (isLocked(finalizationByUser.get(person.id))) continue;
      try {
        const pushResult = await sendPushToUser(admin, person.id, title, body, {
          type: "payroll_deadline_reminder",
          stage,
          periodStart: targetPeriodStart,
          // Tapping this used to drop the coach on the dashboard, leaving
          // them to find Payroll -> My Pay -> step back a period themselves.
          // Unprefixed by convention: public/sw.js hands this straight to
          // clients.openWindow() as a real URL, and route groups don't
          // appear in web paths. PushDeepLink adds "(coach)" back for the
          // native router. The period matters — by the time either reminder
          // fires, the one that's owed is not the current one.
          url: `/payroll/report?period=${targetPeriodStart}`,
        });
        if (pushResult.sent > 0) results.reminded += 1;
      } catch (err) {
        results.errors.push(`${person.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Stamped even when pushEnabled is false, so flipping the toggle back on
  // mid-window doesn't fire a reminder hours after its moment has passed.
  await core.from("settings").upsert({ key: LAST_SENT_KEY, value: marker }, { onConflict: "key" });

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
