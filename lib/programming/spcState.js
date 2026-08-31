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
//                 with a real start date — a queued program clears every alarm.
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
  notes,
} = {}) {
  if (status === "paused") return out("paused", "paused", notes?.trim() || "Paused", NEXT_STEP.resume);

  if (!current) {
    return out("dueNow", "no program yet", everScheduled ? "No current program" : "Enrolled, not programmed yet", NEXT_STEP.start);
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
