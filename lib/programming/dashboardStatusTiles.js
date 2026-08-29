// Shared by both coach dashboards (native index.js + web index.web.js),
// which each used to define this verbatim — they now also need the roster
// mapping below, and two copies of that is exactly how the two screens
// drift.
//
// The dashboard's nutrition taxonomy is deliberately COARSER than the
// roster's own (lib/nutrition/rosterStatus.js): coachDashboard.js buckets
// off one signal it actually has (does this client have a target yet),
// while the roster splits the same people across three onboarding stages
// plus needsTarget. `rosterStatuses` is that mapping, so tapping a row can
// land on the roster already filtered to the same people the row counted.
export const NUTRITION_STATUS_META = {
  notSetUp: {
    label: "Not set up yet",
    tone: "needsAction",
    // One dashboard bucket (!hasTarget) = four roster statuses. This is the
    // only row that isn't 1:1, and it's why the roster's status filter
    // accepts a comma-separated list rather than a single key.
    rosterStatuses: ["otSetup", "otInProgress", "readyForReview", "needsTarget"],
  },
  pendingCheckin: { label: "Pending check-in", tone: "needsAction", rosterStatuses: ["checkinPending"] },
  readyForCheckin: { label: "Ready for check-in", tone: "needsAction", rosterStatuses: ["readyForCheckin"] },
  checkinCompleted: { label: "Check-in completed", tone: "onTrack", rosterStatuses: ["checkinCompleted"] },
};

export const NUTRITION_STATUS_ORDER = ["notSetUp", "pendingCheckin", "readyForCheckin", "checkinCompleted"];

// `statusLabel` rides along so the roster can name a multi-status filter in
// its "Filtered: …" line without having to know the dashboard's taxonomy.
export function nutritionRosterRoute(key) {
  const meta = NUTRITION_STATUS_META[key];
  if (!meta) return "/(coach)/nutrition";
  return `/(coach)/nutrition?status=${meta.rosterStatuses.join(",")}&statusLabel=${encodeURIComponent(meta.label)}`;
}
