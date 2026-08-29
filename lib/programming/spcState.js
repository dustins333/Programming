// Where an SPC client is at — computed, never stored.
//
// This replaces programming.spc_clients' five hand-set statuses (migration
// 0099). Four of them described things the data already knew: whether a block
// covers today, whether one is ending with nothing behind it, whether a draft
// is written but unsent, whether the current block still has holes in it.
// Coaches maintained that by hand and it drifted, which is the whole reason the
// SPC roster stopped being readable.
//
// Only 'paused' survives as a real column, because it is the one thing the app
// cannot infer — holiday, injury, a break. isSpcActive() still reads it.
//
// One definition, two consumers: the web roster's status chips and the phone
// roster's filter sheet both read SPC_STATES / SPC_STATE_ORDER, so they cannot
// disagree about what the buckets are or how many are in each.

// How long before a block runs out we start asking for the next one. Kept at
// the 7 days describeCoverage() used rather than the alert_lead_time_days
// setting (default 3): that setting drives the nightly auto-draft scan, and a
// coach needs more warning to WRITE a block than a job needs to CREATE one.
export const LEAD_DAYS = 7;

// tone keys map onto lib/theme.js's statusColors — the same 4-tone badge system
// the nutrition roster uses, so SPC and nutrition read alike at a glance.
// `short` is for the phone roster's status column, which shares one narrow
// column with a dot and a days-left line. It rides along here rather than
// living in a second map inside that component, which is how the two drift.
export const SPC_STATES = {
  noBlock: { label: "Needs a program", short: "No program", tone: "urgent" },
  // Enrolled but not programmed yet — measured against real data, 51 of 73
  // active rows. An spc_clients row is created by the enrolment toggle whether
  // or not anyone ever wrote a block, and as of 2026-08-29 most of these are
  // clients mid-migration onto the app who WILL get a program: a holding
  // pattern, not a backlog of failures. Quiet tone so they don't bury the
  // handful who genuinely need something, but they stay visible and counted on
  // the roster — they must never silently disappear.
  neverStarted: { label: "Not started", short: "Not started", tone: "paused" },
  draftToSend: { label: "Draft to send", short: "Send draft", tone: "urgent" },
  needsNextBlock: { label: "Needs next block", short: "Next block", tone: "needsAction" },
  unfinished: { label: "Unfinished", short: "Unfinished", tone: "needsAction" },
  onTrack: { label: "On track", short: "On track", tone: "onTrack" },
  paused: { label: "Paused", short: "Paused", tone: "paused" },
};

// Display order: worst first, with Paused parked at the end because it isn't a
// queue — nobody works through it. Deliberately NOT the same as the precedence
// inside deriveSpcState() below, which checks paused first (it beats every
// other signal) and draftToSend before noBlock (a client with nothing running
// but a draft written needs it sent, not rebuilt).
export const SPC_STATE_ORDER = ["noBlock", "draftToSend", "needsNextBlock", "unfinished", "onTrack", "neverStarted", "paused"];

// The single next thing to do about a client, and how loudly to say it.
export const NEXT_STEP = {
  build: { label: "Build next block", tone: "urgent" },
  // Quiet on purpose: nobody is waiting on this, it just has never happened.
  start: { label: "Build first block", tone: "quiet" },
  send: { label: "Send draft", tone: "urgent" },
  finishDraft: { label: "Finish draft", tone: "needsAction" },
  resume: { label: "Resume", tone: "quiet" },
  none: null,
};

// The enrolment column itself, for the on/off badge on a client's own page.
// Distinct from the states above: this is what's stored, those are computed.
export const SPC_ENROLLMENT_LABELS = { active: "Active", paused: "Paused" };
export const SPC_ENROLLMENT_TONES = { active: "onTrack", paused: "paused" };

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function out(state, reason, nextStep) {
  return { state, reason, nextStep, label: SPC_STATES[state].label, tone: SPC_STATES[state].tone };
}

// Ordered by urgency, first match wins. Every input here is something the
// caller already had to fetch to draw the roster at all — no extra query.
//
//   status      spc_clients.status: 'active' | 'paused'
//   current     the block covering today, else the next one starting, else the
//               last one that ran; null if she has never had one
//   daysLeft    days until current.block_end_date (negative = already ended)
//   coverage    { total, published, draft, empty } over the current block
//   nextQueued  another scheduled block starts after this one ends
//   draftBlock  an undated draft (0089) written but not sent
//   everScheduled  this client has had at least one real (non-draft) block,
//               ever — distinguishes "lapsed" from "never programmed"
//   notes       spc_clients.notes_goals_feedback — carries the WHY for a pause
export function deriveSpcState({
  status,
  current,
  daysLeft,
  coverage,
  nextQueued,
  draftBlock,
  everScheduled = true,
  notes,
  leadDays = LEAD_DAYS,
} = {}) {
  if (status === "paused") return out("paused", notes?.trim() || "Paused", NEXT_STEP.resume);

  // A draft written and never sent is the most actionable thing this client
  // has, whatever else is or isn't running — it beats every "build the next
  // one" below, because the next one already exists.
  if (draftBlock && !nextQueued) {
    if (!current) return out("draftToSend", "Draft written, not sent", NEXT_STEP.send);
    if (daysLeft != null && daysLeft <= leadDays) {
      const when = daysLeft < 0 ? "Block ended" : `${plural(daysLeft, "day")} left`;
      return out("draftToSend", `${when}, draft not sent`, NEXT_STEP.send);
    }
  }

  // Never programmed is a different thing from lapsed, and far more common.
  // Defaults to false only when the caller says so, so a caller that doesn't
  // know keeps the old, louder behaviour rather than silently going quiet.
  if (!current && !everScheduled) return out("neverStarted", "Enrolled, not programmed yet", NEXT_STEP.start);
  if (!current) return out("noBlock", "No block yet", NEXT_STEP.build);

  if (daysLeft != null && daysLeft < 0) {
    return nextQueued
      ? out("onTrack", "Block ended, next one queued", NEXT_STEP.none)
      : out("needsNextBlock", "Block ended, nothing queued", NEXT_STEP.build);
  }

  const left = daysLeft == null ? null : `${plural(daysLeft, "day")} left`;
  if (!nextQueued && daysLeft != null && daysLeft <= leadDays) {
    return out("needsNextBlock", `${left}, nothing queued`, NEXT_STEP.build);
  }

  // Coverage is optional: a caller that hasn't paid for the workout/lift pass
  // (the coach dashboard's lighter roster) still gets a correct, coarser state
  // rather than a wrong one.
  if (coverage?.empty > 0) {
    return out("unfinished", `Drafted, ${plural(coverage.empty, "session")} empty`, NEXT_STEP.finishDraft);
  }
  if (coverage?.draft > 0) {
    return out("unfinished", `${plural(coverage.draft, "session")} not published`, NEXT_STEP.finishDraft);
  }

  return out("onTrack", left ?? "Running", NEXT_STEP.none);
}
