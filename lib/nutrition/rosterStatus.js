// rosterStatus (see dashboard.js's deriveRosterStatus) -> the shared 5-tone
// badge system, plus display copy and stable ordering. Shared by the native
// and web nutrition roster screens so they can't drift out of sync —
// "Check-in due" and "Awaiting review" are both check-in-adjacent but
// distinct states (hasn't submitted vs. submitted-and-needs-your-notes), so
// this keeps them as separate statuses rather than collapsing them.
export const STATUS_META = {
  onboarding: { label: "Onboarding", tone: "needsAction" },
  checkinDue: { label: "Check-in due", tone: "urgent" },
  needsTarget: { label: "Needs target", tone: "needsAction" },
  awaitingReview: { label: "Awaiting review", tone: "needsAction" },
  onTrack: { label: "On track", tone: "onTrack" },
  paused: { label: "Paused", tone: "paused" },
};

export const STATUS_ORDER = ["onboarding", "checkinDue", "needsTarget", "awaitingReview", "onTrack", "paused"];
