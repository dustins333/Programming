import { addDays, dateInBoise, dayOfWeekInBoise } from "../../lib/boiseDate";
import { sessionActivityState } from "../../lib/programming/spcSessionActivity";
import { formatDateShort } from "../../lib/formatDate";

// The model behind the SPC block calendar — pure, no React, no RN, so it can
// be checked without rendering and is shared by the native and web halves of
// SpcBlockCalendar (which must never import each other: a `.web.js` importing
// its own sibling self-resolves and crash-loops).

export const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

// Whole days between two YYYY-MM-DDs, a - b.
export function dayDiff(a, b) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

// Monday-first index (0..6), matching DAY_LETTERS. dayOfWeekInBoise is
// Sunday-first.
export function mondayIndex(dateString) {
  return (dayOfWeekInBoise(dateString) + 6) % 7;
}

export function weekOfBlock(dateString, block) {
  const n = Math.floor(dayDiff(dateString, block.block_start_date) / 7) + 1;
  return Math.min(Math.max(n, 1), block.block_length_weeks);
}

// Which week a session actually sits in.
//
// Three inputs, in precedence order:
//   1. It's finished → the week she finished it in. Her own logging moves a
//      session for free: finalize a week-2 session on a day in week 3 and it
//      lands in week 3, on the day she did it. No coach action, no member
//      decision, and nothing written to the database for it.
//   2. scheduled_week (0101) → the coach moved it.
//   3. week_number → where it was written.
//
// The AUTHORED week_number is what completions and logs are keyed on and is
// never any of this — see lib/programming/sessionCompletions.js.
export function effectiveWeekFor(workout, completedAt, block) {
  if (completedAt) return weekOfBlock(dateInBoise(new Date(completedAt)), block);
  return workout.scheduled_week ?? workout.week_number;
}

// The five bar states:
//
//   done        a completion exists → a chip on the day she finalized
//   started     sets logged, Finalize never tapped → a chip on the day she
//               trained, outlined rather than filled. Ranked above the
//               date-based states: a past week with a session's worth of sets
//               in it is not "past & still open", it's work she did.
//   pending     published, not done, this week or later → any day this week
//   pastOpen    published, not done, its week has fully passed
//   draft       a workout row exists but isn't published
//   notWritten  no workout row for that slot at all
//
// `completions` is the Map from listSpcCompletionDetailsForWorkouts, keyed
// "workoutId:authoredWeek".
export function buildSpcCalendar({ block, workouts = [], completions = new Map(), activity = new Map(), sessionsPerWeek = 1, today, windowWeeks = 2 }) {
  const length = block?.block_length_weeks ?? 0;
  const start = block?.block_start_date ?? null;
  // A draft block has no dates at all (0089), so it has no calendar to draw.
  if (!length || !start) return { rows: [], slots: 0, hiddenBefore: 0, hiddenAfter: 0, todayWeek: null, length: 0 };

  // Slots come from whichever is larger: what the coach has actually written,
  // or what she is owed each week. Using only the written rows would mean an
  // empty block draws nothing at all, when "nothing is written" is precisely
  // what it needs to say.
  const slots = Math.max(1, sessionsPerWeek || 1, ...workouts.map((w) => w.session_number ?? 1));

  const blockEnd = block.block_end_date ?? addDays(start, length * 7 - 1);
  const isCurrentBlock = start <= today && today <= blockEnd;
  const todayWeek = isCurrentBlock ? weekOfBlock(today, block) : null;

  // A sessions-format run has ONE spc_workouts row per session spanning every
  // week (0105), so a row has to be drawn once per week or every week after
  // the first reads "not written yet" — which is what 55 of the 61 live
  // sessions-format blocks were doing. Same expansion getSpcBlockDetail
  // already does for the same reason; the calendar never got it. A legacy
  // weekly block already has a row per week and is left alone.
  const expandedByWeek = block?.format === "sessions";
  const pairs = expandedByWeek
    ? workouts.flatMap((workout) => Array.from({ length }, (_, i) => ({ workout, forcedWeek: i + 1 })))
    : workouts.map((workout) => ({ workout, forcedWeek: null }));

  const placed = pairs.map(({ workout, forcedWeek }) => {
    // The completion key is the calendar week for a sessions run and the
    // authored week for a weekly one, matching spcCompletionWeek exactly.
    const lookupWeek = forcedWeek ?? workout.week_number;
    const completedAt = workout.status === "published" ? (completions.get(`${workout.id}:${lookupWeek}`) ?? null) : null;
    const week = forcedWeek ?? effectiveWeekFor(workout, completedAt, block);
    const weekEnd = addDays(addDays(start, (week - 1) * 7), 6);
    const act = workout.status === "published" ? activity.get(`${workout.id}:${week}`) : null;
    const started = !completedAt && sessionActivityState({ loggedSets: act?.loggedSets ?? 0 }) === "started";
    let state;
    if (workout.status !== "published") state = "draft";
    else if (completedAt) state = "done";
    else if (started) state = "started";
    else state = weekEnd < today ? "pastOpen" : "pending";
    return {
      // Several bars now share a workout id, so the id alone is no longer a
      // key — the same reason getSpcBlockDetail's sessions carry `key`.
      key: `${workout.id}:${week}`,
      workout,
      sessionNumber: workout.session_number,
      authoredWeek: workout.week_number,
      week,
      state,
      // Boise-local, never .slice(0,10) — that reads the UTC date and puts
      // every evening session on the following day.
      day: completedAt
        ? mondayIndex(dateInBoise(new Date(completedAt)))
        : started && act?.lastLoggedDate
          ? mondayIndex(act.lastLoggedDate)
          : null,
      loggedSets: act?.loggedSets ?? 0,
      title: workout.title || null,
      // A sessions run authors every row at week 1 and repeats it, so drawing
      // it in week 3 is not a move and must not be tagged as one. Only a real
      // scheduled_week change on a weekly block is.
      movedFrom: expandedByWeek || week === workout.week_number ? null : workout.week_number,
      // Moving writes scheduled_week, which under a sessions run would shift
      // every week's copy at once. Sets already logged pin it too: they file
      // by the calendar week of the day they were logged, not by where the
      // session is scheduled, so a move would leave them behind.
      movable: workout.status === "published" && !completedAt && !started && !expandedByWeek && length > 1,
    };
  });

  let first = 1;
  let last = length;
  if (todayWeek && Number.isFinite(windowWeeks)) {
    first = Math.max(1, todayWeek - windowWeeks);
    last = Math.min(length, todayWeek + windowWeeks);
  }

  const rows = [];
  for (let week = first; week <= last; week++) {
    const weekStart = addDays(start, (week - 1) * 7);
    const bars = placed
      .filter((p) => p.week === week)
      .sort((a, b) => a.sessionNumber - b.sessionNumber || a.authoredWeek - b.authoredWeek);

    // A ghost is drawn only where nothing was ever WRITTEN for that slot in
    // that week. A session authored here but moved away leaves nothing behind
    // — the page reports where things are, not where they have been — and a
    // slot that already has a bar (its own, or one moved in) needs no ghost.
    for (let n = 1; n <= slots; n++) {
      const authoredHere = workouts.some((w) => w.week_number === week && w.session_number === n);
      if (authoredHere || bars.some((b) => b.sessionNumber === n)) continue;
      bars.push({
        key: `slot-${week}-${n}`,
        workout: null,
        sessionNumber: n,
        authoredWeek: week,
        week,
        state: "notWritten",
        day: null,
        title: null,
        movedFrom: null,
        movable: false,
      });
    }
    bars.sort((a, b) => a.sessionNumber - b.sessionNumber || a.authoredWeek - b.authoredWeek);

    rows.push({
      week,
      start: weekStart,
      end: addDays(weekStart, 6),
      isCurrent: week === todayWeek,
      todayIndex: week === todayWeek ? mondayIndex(today) : null,
      bars,
    });
  }

  return { rows, slots, hiddenBefore: first - 1, hiddenAfter: length - last, todayWeek, length };
}

export function barLabel(bar) {
  const name = `S${bar.sessionNumber}`;
  if (bar.state === "started") return `${name} — ${bar.loggedSets} sets logged, not finalized`;
  if (bar.state === "notWritten") return `${name} — not written yet`;
  if (bar.state === "draft") return bar.title ? `${name} | ${bar.title} — draft` : `${name} — draft`;
  return bar.title ? `${name} | ${bar.title}` : name;
}

// Packs a week's bars into lines the way the mock's CSS grid auto-flow does:
// a full-width bar always takes a line to itself, and consecutive done chips
// share one until their day slots collide.
export function packLines(bars) {
  const lines = [];
  for (const bar of bars) {
    // A started chip packs with the done chips: both sit on a real day and
    // both are half-width, so they share a line the same way.
    if (bar.state !== "done" && bar.state !== "started") {
      lines.push({ kind: "bar", bar });
      continue;
    }
    const last = lines[lines.length - 1];
    if (last?.kind === "done" && !last.bars.some((b) => b.day === bar.day)) last.bars.push(bar);
    else lines.push({ kind: "done", bars: [bar] });
  }
  return lines;
}

// The header line — "2×/week | ends Sep 20".
export function calendarMeta({ block, sessionsPerWeek }) {
  const parts = [];
  if (sessionsPerWeek) parts.push(`${sessionsPerWeek}×/week`);
  if (block?.block_end_date) parts.push(`ends ${formatDateShort(block.block_end_date)}`);
  return parts.join(" | ");
}
