// Ported from the standalone Nutrition Tracker app's
// app/api/cron/checkin-available/route.js — announces the new week's
// check-in is open. Rewritten to query the same live public.* tables the
// standalone app itself uses (was originally against Kova's placeholder
// nutrition.* schema) — see CLAUDE.md's nutrition-rebuild section. Only
// announces to clients past onboarding, same reasoning as
// scan-nutrition-reminders: someone still mid-onboarding has no check-in
// cadence to announce yet.
//
// Now fires as a real programming.announcements row (target_type:
// "nutrition") instead of a bare push — per direct ask, this is meant to be
// the Announcements pipeline's first recurring use, not a bespoke push-only
// notification. That gets it a real in-app popup (not just a push banner)
// and a visible entry in the Announcements page's History for free, with no
// new generic "recurring announcement" system needed — the day/time/content
// config for this one specific case stays exactly where it already lived
// (Settings -> Nutrition), only the delivery mechanism changed.
//
// The per-user notify_checkin_available opt-out only ever gated the push
// half in the original version, so it's applied the same way here: the
// announcement row is inserted (and its pushed_at stamped immediately, so
// scan-announcements' own poll doesn't also try to push it) unconditionally
// for the whole nutrition audience — everyone still sees the in-app popup —
// but the push loop itself still skips anyone who's opted out, same as
// before this change.
//
// Title/body/send-day/time are coach-editable (Settings -> Nutrition, see
// CLAUDE.md's "Loom or Zoom" session) via core.settings, not hardcoded —
// this function now polls frequently (see its cron migration) and gates on
// the configured weekday/time itself, same "poll cheap, gate inside the
// function" shape as scan-payroll-deadline-reminders/scan-announcements,
// rather than being a fixed once-a-week cron. A per-week idempotency guard
// (nutrition_checkin_available_last_sent_date) stops it from re-firing every
// poll for the rest of the matched day, since — unlike payroll's deadline
// nag, which naturally stops once a coach finalizes — there's no state
// change that would otherwise end the matching window on its own.
//
// Deploy with: supabase functions deploy scan-nutrition-checkin-available --no-verify-jwt
// Reuses the same CRON_SECRET already set for scan-spc-alerts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushToUser } from "../_shared/expoPush.ts";

const TIMEZONE = "America/Boise";

function todayInBoise() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// 0=Sunday..6=Saturday, matching lib/boiseDate.js's dayOfWeekInBoise().
function weekdayInBoise(dateString: string) {
  return new Date(`${dateString}T12:00:00`).getDay();
}

function currentTimeInBoise() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
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
    .in("key", [
      "notify_nutrition_checkin_available",
      "nutrition_checkin_available_title",
      "nutrition_checkin_available_body",
      "nutrition_checkin_available_weekday",
      "nutrition_checkin_available_time",
      "nutrition_checkin_available_last_sent_date",
    ]);
  const settingsByKey = Object.fromEntries((settingRows ?? []).map((r) => [r.key, r.value]));

  const enabled = (settingsByKey.notify_nutrition_checkin_available ?? true) !== false;
  const title = settingsByKey.nutrition_checkin_available_title ?? "Weekly check-in available";
  const body = settingsByKey.nutrition_checkin_available_body ?? "Your weekly check-in is ready for you to fill out.";
  const targetWeekday = Number(settingsByKey.nutrition_checkin_available_weekday ?? 0);
  const targetTime = settingsByKey.nutrition_checkin_available_time ?? "08:00";
  const lastSentDate = settingsByKey.nutrition_checkin_available_last_sent_date ?? null;

  if (!enabled) {
    return new Response(JSON.stringify({ scanned: 0, pushed: 0, skipped: "disabled", errors: [] }), { status: 200 });
  }

  const today = todayInBoise();

  if (lastSentDate === today) {
    return new Response(JSON.stringify({ skipped: true, reason: "already sent today" }), { status: 200 });
  }

  // Only fire on the configured weekday, once the configured time has
  // passed — this function can run every 15 minutes via cron without
  // spamming a push on every single invocation.
  if (weekdayInBoise(today) !== targetWeekday || currentTimeInBoise() < targetTime) {
    return new Response(JSON.stringify({ skipped: true, reason: "not yet the configured send window" }), { status: 200 });
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

  const results = { scanned: clients?.length ?? 0, pushed: 0, announcementId: null as string | null, errors: [] as string[] };

  // Real announcement row so it gets the same in-app popup + History
  // visibility as any other announcement — pushed_at is stamped right away
  // (not left null) so scan-announcements' own 15-minute poll doesn't also
  // try to push this out a second time.
  const { data: announcement, error: announcementError } = await admin
    .schema("programming")
    .from("announcements")
    .insert({
      title,
      message: body,
      target_type: "nutrition",
      send_at: new Date().toISOString(),
      pushed_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (announcementError) {
    return new Response(JSON.stringify({ error: announcementError.message }), { status: 500 });
  }
  results.announcementId = announcement.id;

  for (const client of clients ?? []) {
    try {
      if (prefsByUserId[client.id]?.notify_checkin_available === false) continue;

      const result = await sendPushToUser(admin, client.id, title, body, {
        type: "announcement",
        announcementId: announcement.id,
      });
      if (result.sent > 0) results.pushed += 1;
    } catch (err) {
      results.errors.push(`${client.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Stamped after the run regardless of whether any individual push failed
  // — this is "did we already announce today," not "did every push
  // succeed," so a partial delivery failure shouldn't cause a same-day
  // resend attempt against everyone (including the clients who already got
  // it) on the next 15-minute poll.
  await core.from("settings").upsert({ key: "nutrition_checkin_available_last_sent_date", value: today, updated_at: new Date().toISOString() }, { onConflict: "key" });

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
