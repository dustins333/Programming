// Server-side counterpart to lib/programming/spcDashboard.js's
// checkAndAutoDraft() — that version only runs when a coach happens to have
// the SPC dashboard open, so a block ending while no coach opens the page in
// time never auto-drafts and never notifies anyone. This runs on a schedule
// (see supabase/migrations/0013_spc_alert_push_cron.sql) via pg_cron +
// pg_net, independent of anyone loading the app, and — unlike the client
// version — actually pushes the assigned coach when it drafts a block.
//
// Deploy with: supabase functions deploy scan-spc-alerts --no-verify-jwt
// (--no-verify-jwt because pg_net's cron call carries no user JWT — this
// function is invoked by the database itself, not a logged-in user. Auth
// instead comes from the CRON_SECRET header check below.)
//
// Requires a CRON_SECRET function secret:
//   supabase secrets set CRON_SECRET=<a-random-value>
// and the same value pasted into the cron.schedule() call in the migration.
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPushToUser } from "../_shared/expoPush.ts";
import { extendBlockByOneWeek, GROUP_BLOCK_KIND, SPC_BLOCK_KIND } from "../_shared/extendBlock.ts";

const TIMEZONE = "America/Boise";

function todayInBoise() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  return Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
}

// The date helpers that used to live here (addDays / mondayOnOrBefore /
// rangesOverlap) went with the dated block this function used to insert.
// Since 0089 it creates a DRAFT, which has no dates to snap or overlap.

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
  const programming = admin.schema("programming");
  const core = admin.schema("core");

  const { data: settingRows } = await core
    .from("settings")
    .select("key, value")
    .in("key", ["alert_lead_time_days", "notify_spc_block_alerts"]);
  const settingsByKey = Object.fromEntries((settingRows ?? []).map((r) => [r.key, r.value]));
  const leadTimeDays = Number(settingsByKey.alert_lead_time_days ?? 3);
  // Default true (unset = existing always-on behavior) — only an explicit
  // false in core.settings turns the push half off. Drafting still happens
  // either way; this only gates whether the coach gets notified about it.
  const pushEnabled = settingsByKey.notify_spc_block_alerts !== false;

  const today = todayInBoise();

  const { data: clients, error: clientsError } = await programming
    .from("spc_clients")
    .select("*")
    .neq("status", "paused");
  if (clientsError) {
    return new Response(JSON.stringify({ error: clientsError.message }), { status: 500 });
  }

  const results = {
    scanned: clients?.length ?? 0,
    drafted: 0,
    pushed: 0,
    extended: 0,
    errors: [] as string[],
  };

  for (const client of clients ?? []) {
    try {
      const { data: latest, error: latestError } = await programming
        .from("spc_blocks")
        .select("*")
        .eq("spc_client_id", client.user_id)
        .eq("status", "active")
        .order("block_start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw latestError;
      if (!latest) continue;

      // Sessions-format runs (0102, the SPC simplification) are NOT this
      // scan's business: their upcoming program is built on the client
      // page's own pane, a lapsed run keeps showing to the member by design,
      // and the roster's derived Due soon / Due now is the alarm. Drafting a
      // weekly-format grid behind one would also flip the client's page back
      // to the legacy view — the exact regression the format split prevents.
      // An ongoing run additionally has no end date to measure against.
      if (latest.format === "sessions" || latest.block_end_date == null) continue;

      const daysUntilEnd = daysBetween(today, latest.block_end_date);
      if (daysUntilEnd > leadTimeDays) continue;

      // A rolling block grows instead of ending, so it must NEVER also get
      // a successor drafted behind it — that's the duplicate-block churn
      // this whole feature exists to remove. Extending and drafting are
      // deliberately mutually exclusive, decided here in one place.
      if (latest.auto_extend) {
        const outcome = await extendBlockByOneWeek(programming, SPC_BLOCK_KIND, latest);
        if (outcome.extended) results.extended += 1;
        else if (outcome.reason) results.errors.push(`${client.user_id}: not extended (${outcome.reason})`);
        continue;
      }

      // A draft (migration 0089) is a block the coach has already started
      // writing and hasn't sent yet, so there is nothing to draft for her —
      // a second one would be exactly the duplicate churn this scan exists
      // to remove.
      //
      // It is checked HERE, below the rolling branch, and that placement is
      // load-bearing: a rolling block still has to grow whether or not a
      // draft exists behind it. Checking earlier would have stopped a
      // rolling client's block at its end date the moment anyone started
      // writing her next one — silently, and she'd simply run out of
      // training. Creating a draft deliberately does not switch rolling off
      // either; that happens when the draft is actually sent, so an
      // abandoned draft can't leave someone with nothing.
      const { data: draft, error: draftError } = await programming
        .from("spc_blocks")
        .select("id")
        .eq("spc_client_id", client.user_id)
        .eq("status", "draft")
        .limit(1)
        .maybeSingle();
      if (draftError) throw draftError;
      if (draft) continue;

      const lengthWeeks = latest.block_length_weeks;

      // What gets created is a DRAFT: no dates, invisible to the client, and
      // not on the calendar. Before 0089 this inserted a live block starting
      // the day after the last one ended, which meant the clock was already
      // running on week 1 while the coach was still writing it — for an
      // auto-drafted block, several days before she even sees the push. She
      // picks the start date when she sends it.
      //
      // Because it holds no dates there is no overlap to guard against, which
      // is why the existing-block check that used to sit here is gone: the
      // "the coach already made the next block" case is the draft check above.
      const coachId = client.assigned_coach_id ?? latest.coach_id;

      const { data: newBlock, error: insertError } = await programming
        .from("spc_blocks")
        .insert({
          spc_client_id: client.user_id,
          coach_id: coachId,
          block_length_weeks: lengthWeeks,
          status: "draft",
        })
        .select()
        .single();
      if (insertError) throw insertError;

      // Full week x session grid, matching createSpcBlock() client-side
      // (lib/programming/spcBlocks.js) — since migration 0016 rearchitected
      // SPC to one independent spc_workouts row per (week, session) with a
      // required week_number, the old one-row-per-session skeleton this
      // function used to insert would violate the NOT NULL constraint and
      // silently leave a coach with an empty, session-less block.
      const workoutRows = [];
      for (let week = 1; week <= lengthWeeks; week += 1) {
        for (let session = 1; session <= client.sessions_per_week; session += 1) {
          workoutRows.push({ spc_block_id: newBlock.id, session_number: session, week_number: week });
        }
      }
      const { error: workoutsError } = await programming.from("spc_workouts").insert(workoutRows);
      if (workoutsError) throw workoutsError;

      // No status stamp. spc_clients.status is 'active' | 'paused' only
      // (migration 0099) — writing 'new_program_asap' here would violate the
      // CHECK and fail this scan every night. The block this just created is
      // itself the signal, and deriveSpcState() reads it back out.
      results.drafted += 1;

      if (coachId && pushEnabled) {
        const { data: clientUser } = await core.from("users").select("name").eq("id", client.user_id).maybeSingle();
        const clientName = clientUser?.name ?? "A client";
        const pushResult = await sendPushToUser(
          admin,
          coachId,
          "New SPC block ready",
          `${clientName}'s next block was started for you — write it, then send it with a start date.`,
          { type: "spc_block_drafted", spcClientId: client.user_id, blockId: newBlock.id }
        );
        if (pushResult.sent > 0) results.pushed += 1;
      }
    } catch (err) {
      results.errors.push(`${client.user_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Group blocks marked rolling, handled in the same daily pass rather
  // than a second cron job. Group has no scan of its own, and standing up
  // one more Edge Function + pg_cron entry to run the identical
  // "is this block nearly over" check on the identical schedule would be
  // two things to keep in step instead of one. Unlike SPC there's no
  // auto-draft on this side, so there's nothing to be mutually exclusive
  // with — a group block either rolls or it ends.
  const { data: rollingGroupBlocks, error: rollingError } = await programming
    .from("group_blocks")
    .select("*")
    .eq("auto_extend", true);
  if (rollingError) {
    results.errors.push(`group rolling blocks: ${rollingError.message}`);
  } else {
    for (const block of rollingGroupBlocks ?? []) {
      try {
        if (daysBetween(today, block.block_end_date) > leadTimeDays) continue;
        const outcome = await extendBlockByOneWeek(programming, GROUP_BLOCK_KIND, block);
        if (outcome.extended) results.extended += 1;
        else if (outcome.reason) results.errors.push(`group block ${block.id}: not extended (${outcome.reason})`);
      } catch (err) {
        results.errors.push(`group block ${block.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
