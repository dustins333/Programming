// Where an SPC client is at — computed, never stored.
//
// v2, the SPC simplification (spec + design_handoff_spc_rework_v1): FOUR
// states, all derived from the current program's end date plus whether a
// published upcoming program is queued. The seven-state taxonomy this
// replaces (draftToSend / unfinished / neverStarted / …) described the old
// per-week authoring model; with no week grid there is no draft-to-send and
// no half-published program, so those states have nothing left to describe.
//
// Only 'paused' survives as a real column (spc_clients.status, 0099), because
// it is the one thing the app cannot infer. isSpcActive() still reads it.
//
// The rules, locked with Terra 2026-08-30:
//  - Good to go   program running with more than its final week left, or
//                 ongoing (no end date, 0103), or anything already queued
//                 with a real start date — a queued program clears every
//                 alarm, INCLUDING when it is the only program she has and
//                 hasn't started yet (notStarted).
//  - Due soon     inside the program's final week, nothing queued, and her
//                 final-week sessions aren't all done yet.
//  - Due now      nothing queued, and either the final week's expected
//                 sessions are all completed (a 1x/wk client finishing Monday
//                 goes red that Monday), or the program has ended or ends
//                 today, or she has never been programmed at all. An
//                 enrolled-never-programmed client is deliberately just red —
//                 pausing her is the release valve.
//  - Paused       stored.
//
// A drafted-but-unpublished upcoming program does NOT count as queued: only a
// real start date clears yellow/red.
//
// Output shape: { state, label, tone, clock, reason, nextStep }.
//  - clock  the short time line for a row's meta ("13d left",
//           "7d left · ends Sep 6", "ends today", "no program yet") —
//           computed from the dates alone, independent of queue state, which
//           is why a queued-up client still reads "13d left".
//  - reason the sentence for the STATUS column / row body
//           ("Next program starts Sep 14", "Final week complete, nothing
//           queued"). Paused carries the coach's own note.

export const SPC_STATES = {
  goodToGo: { label: "Good to go", short: "Good", tone: "onTrack" },
  dueSoon: { label: "Due soon", short: "Due soon", tone: "needsAction" },
  dueNow: { label: "Due now", short: "Due now", tone: "urgent" },
  paused: { label: "Paused", short: "Paused", tone: "paused" },
};

// Display order: worst first, Paused parked at the end — it isn't a queue.
export const SPC_STATE_ORDER = ["dueNow", "dueSoon", "goodToGo", "paused"];

// The single next thing to do about a client, and how loudly to say it —
// labels are the roster's real buttons (urgent = filled clay, needsAction =
// outlined, quiet = muted outline; none renders as flat "Nothing due" text).
export const NEXT_STEP = {
  publish: { label: "Build next program", tone: "urgent" },
  start: { label: "Build first program", tone: "needsAction" },
  resume: { label: "Resume", tone: "quiet" },
  none: null,
};

// The enrolment column itself, for the on/off badge on a client's own page.
// Distinct from the states above: this is what's stored, those are computed.
//
// 'inactive' (0108) is deliberately absent — these two are the choices a coach
// picks BETWEEN once someone is an SPC client. Turning SPC off entirely is the
// switch on her client detail page, not a third option in this list.
export const SPC_ENROLLMENT_LABELS = { active: "Active", paused: "Paused" };
export const SPC_ENROLLMENT_TONES = { active: "onTrack", paused: "paused" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Sep 6" from an ISO date, by string ops — never through new Date(), which
// parses a bare date as UTC midnight and shifts it a day west of Greenwich.
export function monthDay(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}`;
}

// WHICH PROGRAM SHE IS ON, and which one is next. One definition, because
// there were two and they disagreed for 33 of 74 real clients: the roster fell
// back to a queued program when nothing was running today, the client page did
// not, so the same woman read "Good to go" on one screen and "Due now · No
// current program" on the other.
//
// A published program that has not started yet IS her current program. She is
// not due for anything — the work is done and it is waiting for its Monday, so
// treating that as "no program" turns a finished job into a false alarm. It is
// FLAGGED rather than quietly promoted, so every surface can say out loud that
// it hasn't started.
//
// Coach-facing only. getCurrentSpcBlock (spcBlocks.js) answers the different
// question of what the MEMBER can see, where an unstarted program is genuinely
// invisible and its lapsed fallback is sessions-format only.
export function resolveClientPrograms(blocks, today) {
  const all = blocks ?? [];
  // A draft has no dates and is not her programming yet — worth surfacing as
  // "there is something written", never picked as the program she is on.
  const scheduled = all.filter((b) => b.status !== "draft" && b.block_start_date);
  const byStart = (dir) => (a, b) => (a.block_start_date < b.block_start_date ? -dir : a.block_start_date > b.block_start_date ? dir : 0);

  const covering = scheduled.find((b) => b.block_start_date <= today && (b.block_end_date == null || today <= b.block_end_date)) ?? null;
  const soonest = [...scheduled].sort(byStart(1)).find((b) => b.block_start_date > today) ?? null;
  const lastRan = [...scheduled].sort(byStart(-1)).find((b) => b.block_start_date <= today) ?? null;

  // Queued beats lapsed: "her next one starts Monday" is both truer and more
  // useful than "her last one ended", and it is the difference between a red
  // row and a quiet one.
  const current = covering ?? soonest ?? lastRan ?? null;
  const promoted = Boolean(current && soonest && current.id === soonest.id);

  return {
    current,
    // The program AFTER whatever is current. Null once the queued one has been
    // promoted, or the same program would render in both panes at once.
    queued: promoted ? null : soonest,
    draft: all.find((b) => b.status === "draft") ?? null,
    notStarted: Boolean(current && current.block_start_date > today),
    lapsed: Boolean(current && current.block_end_date && current.block_end_date < today),
    everScheduled: scheduled.length > 0,
  };
}

function out(state, clock, reason, nextStep) {
  return { state, clock, reason, nextStep, label: SPC_STATES[state].label, tone: SPC_STATES[state].tone };
}

// First match wins. Every input is something the roster already fetched.
//
//   status          spc_clients.status: 'active' | 'paused'
//   current         the program covering today, else the next one starting,
//                   else the last one that ran; null if she has never had one
//   daysLeft        days until current.block_end_date; negative = ended;
//                   null = ongoing or no program
//   ongoing         current.block_end_date is null (0103) — never due
//   nextQueued      another program with a REAL start date runs after this one
//   nextQueuedStart that program's start date, for the reason line
//   finalWeekDone   the current calendar week's completions have met her
//                   sessions_per_week target (only consulted in the final week)
//   everScheduled   she has had at least one real (non-draft) program, ever
//   notStarted      `current` is published but its start Monday hasn't come
//                   yet — she is waiting, not due
//   notes           spc_clients.notes_goals_feedback — the WHY for a pause
export function deriveSpcState({
  status,
  current,
  daysLeft,
  ongoing = false,
  nextQueued = false,
  nextQueuedStart = null,
  finalWeekDone = false,
  everScheduled = true,
  notStarted = false,
  notes,
} = {}) {
  // 'inactive' (0108) means the SPC switch on her client page is off, so she
  // is not on the SPC roster at all and this normally never runs for her —
  // only a direct link to her SPC page gets here. Say so plainly rather than
  // falling through to the no-program branch and shouting "Due now" about
  // someone nobody signed up.
  if (status === "inactive")
    return out("paused", "not enrolled", "SPC is switched off for this client", NEXT_STEP.resume);

  if (status === "paused") return out("paused", "paused", notes?.trim() || "Paused", NEXT_STEP.resume);

  if (!current) {
    return out("dueNow", "no program yet", everScheduled ? "No current program" : "Enrolled, not programmed yet", NEXT_STEP.start);
  }

  // Published and waiting for its Monday. Nothing is due — the coach has
  // already done the work — and the days-left arithmetic below would be
  // measuring to the end of a program that has not begun.
  if (notStarted) {
    const starts = monthDay(current.block_start_date);
    return out("goodToGo", `starts ${starts}`, `Published, starts ${starts}`, NEXT_STEP.none);
  }

  const end = current.block_end_date;
  const clock = ongoing
    ? "ongoing"
    : daysLeft == null
      ? ""
      : daysLeft < 0
        ? `ended ${monthDay(end)}`
        : daysLeft === 0
          ? "ends today"
          : daysLeft <= 6
            ? `${daysLeft}d left · ends ${monthDay(end)}`
            : `${daysLeft}d left`;

  if (ongoing) return out("goodToGo", clock, "Ongoing, no end date", NEXT_STEP.none);

  if (nextQueued) {
    const reason = nextQueuedStart ? `Next program starts ${monthDay(nextQueuedStart)}` : "Next program queued";
    return out("goodToGo", clock, reason, NEXT_STEP.none);
  }

  if (daysLeft == null) return out("goodToGo", clock, "Running", NEXT_STEP.none);

  if (daysLeft < 0) return out("dueNow", clock, `Ended ${monthDay(end)}, nothing queued`, NEXT_STEP.publish);

  // Programs end on a Sunday, so the final week is the last 7 days: 0..6 left.
  if (daysLeft <= 6) {
    if (finalWeekDone) return out("dueNow", clock, "Final week complete, nothing queued", NEXT_STEP.publish);
    if (daysLeft === 0) return out("dueNow", clock, "Ends today, nothing queued", NEXT_STEP.publish);
    return out("dueSoon", clock, `${daysLeft} day${daysLeft === 1 ? "" : "s"} left, nothing queued`, NEXT_STEP.publish);
  }

  return out("goodToGo", clock, `${daysLeft} days left`, NEXT_STEP.none);
}
