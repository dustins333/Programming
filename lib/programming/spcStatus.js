export const STATUS_LABELS = {
  printed_ready: "Printed & Ready",
  needs_printed: "Needs Printed",
  new_program_asap: "New Program ASAP",
  coming_up_next_week: "Coming Up Next Week",
  paused: "Paused",
};
// Maps SPC's 5 statuses onto the shared 4-tone badge system (same tones the
// Nutrition dashboard uses) — coming_up_next_week and needs_printed are both
// "actionable soon, not urgent" so they share a tone.
export const STATUS_TONES = {
  new_program_asap: "urgent",
  needs_printed: "needsAction",
  coming_up_next_week: "needsAction",
  printed_ready: "onTrack",
  paused: "paused",
};
export const STATUS_ORDER = ["new_program_asap", "needs_printed", "coming_up_next_week", "printed_ready", "paused"];
