import { programming } from "../supabase/client";
import { todayInBoise, daysBetween } from "../boiseDate";
import { listGroupPrograms, listBlocksForProgram } from "./blocks";

// How ready is a block to ship? Shared by the coach launchpad's SHIP card
// (design_handoff_coach_web_v2, 1a), the Group Programs grid's block band
// (04) and the finalize preflight (05) — all three ask the same question
// and used to answer it by counting cells on screen.
//
// "Empty" is content, "draft" is status, and a session can be both. The
// counts below are mutually exclusive so they sum to the block's total and
// can be drawn as one stacked bar: empty wins over draft, because a
// published-but-empty session is a worse problem than an unpublished full
// one and shouldn't be hidden inside the published segment.

export async function getBlockReadiness(blockId) {
  const { data: workouts, error } = await programming
    .from("group_workouts")
    .select("id, week_number, session_number, title, status")
    .eq("block_id", blockId)
    .order("week_number")
    .order("session_number");
  if (error) throw error;

  const ids = workouts.map((w) => w.id);
  let counts = {};
  if (ids.length) {
    const { data: rows, error: rowsError } = await programming
      .from("group_workout_exercises")
      .select("group_workout_id")
      .in("group_workout_id", ids);
    if (rowsError) throw rowsError;
    for (const row of rows) counts[row.group_workout_id] = (counts[row.group_workout_id] ?? 0) + 1;
  }

  const sessions = workouts.map((w) => {
    const liftCount = counts[w.id] ?? 0;
    return {
      ...w,
      liftCount,
      state: liftCount === 0 ? "empty" : w.status === "published" ? "published" : "draft",
    };
  });

  return {
    blockId,
    sessions,
    total: sessions.length,
    published: sessions.filter((s) => s.state === "published").length,
    draft: sessions.filter((s) => s.state === "draft").length,
    empty: sessions.filter((s) => s.state === "empty").length,
    // What the resume card and the SHIP card both call "unbuilt" — anything
    // a member would open and find nothing in, or that they can't see yet.
    unbuilt: sessions.filter((s) => s.state !== "published"),
  };
}

// The finalize preflight (design_handoff_coach_web_v2, 1c).
//
// Finalizing is the one moment where a mistake reaches every member of a
// program at once, so it gets a read-through rather than a yes/no dialog.
// Blockers ("must fix") are separated from things merely worth a look, and
// every line carries the route to its own fix.
//
// Deliberately arithmetic only — no check here is a judgement about whether
// the programming is any good, because nothing in this app can know that.
// Each one is a fact a coach would agree with on sight.
export function buildFinalizeChecks({ sessions, summaries }) {
  const mustFix = [];
  const worthALook = [];
  const route = (s) => `/(coach)/builder/${s.id}`;
  const where = (s) => `Week ${s.week_number} · Session ${s.session_number}`;

  for (const s of sessions) {
    if ((summaries[s.id]?.liftCount ?? 0) === 0) {
      mustFix.push({
        key: `empty-${s.id}`,
        title: `${where(s)} is empty`,
        detail: "Members would open this day and find nothing",
        actionLabel: "Build it",
        route: route(s),
      });
    }
  }

  for (const s of sessions) {
    if (!s.title) {
      worthALook.push({
        key: `untitled-${s.id}`,
        title: `${where(s)} has no title`,
        detail: `Shows as "Session ${s.session_number}" in the app`,
        actionLabel: "Open",
        route: route(s),
      });
    }
  }

  // "Thin for this block" is measured against the block's own median
  // rather than a fixed number — six lifts is thin in one program and
  // normal in another, and a hardcoded threshold would nag forever in the
  // program it doesn't suit.
  const counts = sessions.map((s) => summaries[s.id]?.liftCount ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
  if (counts.length >= 3) {
    const median = counts[Math.floor(counts.length / 2)];
    const low = Math.floor(median / 2);
    for (const s of sessions) {
      const liftCount = summaries[s.id]?.liftCount ?? 0;
      if (liftCount > 0 && liftCount <= low) {
        worthALook.push({
          key: `thin-${s.id}`,
          title: `${where(s)} has ${liftCount} lift${liftCount === 1 ? "" : "s"}`,
          detail: `Most sessions in this block have around ${median}`,
          actionLabel: "Open",
          route: route(s),
        });
      }
    }
  }

  // One movement pattern dominating a whole week — the imbalance a coach
  // would spot themselves if they had all three sessions in front of them,
  // which on the grid they don't.
  const byWeek = new Map();
  for (const s of sessions) {
    if (!byWeek.has(s.week_number)) byWeek.set(s.week_number, []);
    byWeek.get(s.week_number).push(s);
  }
  for (const [week, weekSessions] of byWeek) {
    const tally = {};
    for (const s of weekSessions) for (const p of summaries[s.id]?.patterns ?? []) tally[p] = (tally[p] ?? 0) + 1;
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (entries.length < 2) continue;
    const [topPattern, topCount] = entries[0];
    const rest = entries.slice(1).reduce((sum, [, n]) => sum + n, 0);
    if (topCount >= 4 && topCount > rest) {
      worthALook.push({
        key: `balance-${week}`,
        title: `${topPattern.replace(/_/g, " ")} appears ${topCount}× in week ${week}`,
        detail: `Everything else in that week adds up to ${rest}`,
        actionLabel: "Open",
        route: route(weekSessions[0]),
      });
    }
  }

  return { mustFix, worthALook };
}

// Every program's currently-running block, with readiness attached. Null
// `block` for a program between blocks — the caller decides whether that's
// a prompt to start one or simply nothing to say.
export async function listActiveBlockReadiness(today = todayInBoise()) {
  const programs = await listGroupPrograms();
  return Promise.all(
    programs.map(async (program) => {
      const blocks = await listBlocksForProgram(program.id);
      const block = blocks.find((b) => b.block_start_date <= today && today <= b.block_end_date) ?? null;
      if (!block) return { program, block: null, readiness: null, daysUntilEnd: null };
      return {
        program,
        block,
        readiness: await getBlockReadiness(block.id),
        daysUntilEnd: daysBetween(block.block_end_date, today),
      };
    })
  );
}
