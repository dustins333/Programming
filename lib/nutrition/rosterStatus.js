// rosterStatus (see dashboard.js's deriveRosterStatus) -> the shared 4-tone
// badge system, plus display copy and stable ordering. Shared by the native
// and web nutrition roster screens so they can't drift out of sync.
//
// Two client-facing groupings, per the 2026-08-03 dashboard rework: every
// post-approval, non-paused client falls into exactly one of
// ACTIVE_CLIENT_STATUSES (driven purely by this week's check-in state —
// deriveCheckinStatus only ever returns pending/ready/completed/closed, so
// there's no catch-all "on track" bucket anymore), and every not-yet-approved
// client falls into exactly one of NEW_CLIENT_STATUSES. needsTarget/paused are real
// but rare edge cases that don't fit either grouping cleanly, so the web
// dashboard surfaces them separately rather than folding them in.
export const STATUS_META = {
  otSetup: { label: "Objective tracking set up", tone: "needsAction" },
  otInProgress: { label: "Objective tracking", tone: "onTrack" },
  readyForReview: { label: "Ready for review", tone: "needsAction" },
  checkinPending: { label: "Awaiting client check-in", tone: "urgent" },
  readyForCheckin: { label: "Awaiting coach check-in", tone: "needsAction" },
  checkinCompleted: { label: "Check-in completed", tone: "onTrack" },
  // Nothing came in and the coach has said it isn't going to — a resolved
  // state, not an outstanding one, so it takes the quiet tone rather than
  // onTrack. Reading it as "completed" would claim a check-in happened.
  checkinClosed: { label: "Check-in closed out", tone: "paused" },
  needsTarget: { label: "Needs target", tone: "needsAction" },
  paused: { label: "Paused", tone: "paused" },
};

export const STATUS_ORDER = [
  "otSetup",
  "otInProgress",
  "readyForReview",
  "checkinPending",
  "readyForCheckin",
  "checkinCompleted",
  "checkinClosed",
  "needsTarget",
  "paused",
];

export const NEW_CLIENT_STATUSES = ["otSetup", "otInProgress", "readyForReview"];
export const ACTIVE_CLIENT_STATUSES = ["checkinPending", "readyForCheckin", "checkinCompleted", "checkinClosed"];
export const OTHER_STATUSES = ["needsTarget", "paused"];
