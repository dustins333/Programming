import { programming } from "../supabase/client";
import { daysBetween } from "../boiseDate";

// Week phases — which named phase a client is in during a given calendar
// week, counted ("Diet 1", "Diet 2", "Diet 3"), shown as a pill on each row
// of the Weeks tab. Migration 0111.
//
// NOT programming.nutrition_plan_phases (0050), despite the shared word.
// That one is the coach's undated "what we're working on" map — an ordered
// list of themes with bullet items, rendered on the Plan tab and the
// member's Today slider, where `position` IS the timeline. This is dated and
// counted, and the member never sees it.
//
// Lives in the `programming` schema, so this file imports the schema-scoped
// client rather than the bare `supabase` one most of lib/nutrition/* uses —
// same exception as milestones.js and planPhases.js, for the same reason.
//
// ---------------------------------------------------------------------
// One row per phase CHANGE, not per week
// ---------------------------------------------------------------------
// A row means "from this week onward, the phase is X", and it holds until
// the next row. That's what makes the counter free (a week's number is just
// how many weeks it sits after the marker covering it) and what stops a
// coach having to set the phase again every Monday. A row with a null
// `phase` is an explicit "no phase from here" — how a run ENDS without
// erasing the history of it having run.

// Offered as quick-picks alongside whatever names are already in use, so a
// coach setting the very first phase in the gym isn't handed a blank box.
// Purely suggestions — the field is free text and nothing validates against
// this list.
export const SUGGESTED_PHASES = ["Diet", "Reverse", "Maintenance", "Build"];

// The colours a phase tab can be drawn in (migration 0125). Muted on
// purpose — a row of eleven weeks with a bright red or green tab on it
// would shout louder than anything else on the page, and these sit beside
// the app's own peach cards and olive status tints all day.
//
// Stored as a KEY, never a hex: the palette can be retuned here without a
// single row changing, and an unrecognised key falls back to the first
// entry rather than rendering an invisible tab.
export const PHASE_COLORS = [
  { key: "clay", label: "Clay", bg: "#fdf6f2", border: "#e6c9ba", text: "#8a5140" },
  { key: "rust", label: "Rust", bg: "#fbeee9", border: "#e0b6a5", text: "#9a4f34" },
  { key: "amber", label: "Amber", bg: "#f7f0e3", border: "#e2d2b4", text: "#8a5a2e" },
  { key: "olive", label: "Olive", bg: "#eef1e7", border: "#cbd8bd", text: "#4d6142" },
  { key: "sage", label: "Sage", bg: "#e9f0ea", border: "#c4d7c7", text: "#3f6350" },
  { key: "slate", label: "Slate", bg: "#ecf0f3", border: "#ccd7de", text: "#4f6270" },
  { key: "plum", label: "Plum", bg: "#f4eef2", border: "#dcc8d4", text: "#71495c" },
  { key: "stone", label: "Stone", bg: "#f2f0ed", border: "#dcd5cc", text: "#57534e" },
];

export const DEFAULT_PHASE_COLOR = PHASE_COLORS[0].key;

export function phaseColor(key) {
  return PHASE_COLORS.find((c) => c.key === key) ?? PHASE_COLORS[0];
}

export async function listWeekPhases(userId) {
  const { data, error } = await programming
    .from("nutrition_week_phases")
    .select("*")
    .eq("user_id", userId)
    .order("week_start");
  if (error) throw error;
  return data ?? [];
}

// Every phase name already in use anywhere in the gym, most-used first, so
// the picker's quick-picks reflect how this gym actually names things
// instead of needing a settings screen to maintain.
//
// Each carries the colour that name was most recently given. That is what
// makes "Diet" come out the same colour every time without a registry table
// keyed on the name: the editor prefills from here, and a coach who wants
// THIS run drawn differently can still override it.
export async function listPhaseNames() {
  const { data, error } = await programming
    .from("nutrition_week_phases")
    .select("phase, color, week_start")
    .not("phase", "is", null)
    .order("week_start");
  if (error) throw error;
  const counts = new Map();
  // Ordered oldest-first above, so the last write for a name wins the colour.
  const colors = new Map();
  for (const row of data ?? []) {
    const name = String(row.phase).trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (row.color) colors.set(name, row.color);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => ({ name, color: colors.get(name) ?? DEFAULT_PHASE_COLOR }));
}

// Upsert, not insert — the table is unique on (user_id, week_start), so
// changing a week that already carries a marker is the same call as setting
// one for the first time and two quick taps can't race into a constraint
// error. `phase` may be null: that's the explicit "no phase from here".
export async function setWeekPhase(userId, weekStart, phase, setBy, color = null) {
  const trimmed = phase === null || phase === undefined ? null : String(phase).trim();
  const { error } = await programming.from("nutrition_week_phases").upsert(
    {
      user_id: userId,
      week_start: weekStart,
      phase: trimmed || null,
      // A marker with no phase is an explicit end to a run and draws no
      // tab, so it has nothing to colour.
      color: trimmed ? color || DEFAULT_PHASE_COLOR : null,
      set_by: setBy,
      set_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" }
  );
  if (error) throw error;
}

// Removes the marker sitting exactly on this week, so the week goes back to
// inheriting whatever ran before it. Distinct from writing a null phase,
// which ENDS a run here — this undoes a change rather than making one.
export async function removeWeekPhaseMarker(userId, weekStart) {
  const { error } = await programming
    .from("nutrition_week_phases")
    .delete()
    .eq("user_id", userId)
    .eq("week_start", weekStart);
  if (error) throw error;
}

// --- pure helpers, so the pill and the popup can't disagree ------------

// Newest-first, which is the order every lookup below wants.
function sortedDesc(markers) {
  return [...(markers ?? [])].sort((a, b) => (a.week_start < b.week_start ? 1 : a.week_start > b.week_start ? -1 : 0));
}

// The marker governing `weekStart` — the latest one on or before it.
export function markerCovering(markers, weekStart) {
  return sortedDesc(markers).find((m) => m.week_start <= weekStart) ?? null;
}

// What the pill on a given week reads, or null for no pill at all: either
// nothing has been set yet, or a run was explicitly ended before this week.
export function resolveWeekPhase(markers, weekStart) {
  const marker = markerCovering(markers, weekStart);
  if (!marker || !marker.phase) return null;
  return {
    name: marker.phase,
    // Whole weeks between the marker and this week — every week_start here
    // is a Monday (enforced by the table's own CHECK), so this can't land
    // on a fraction.
    number: Math.round(daysBetween(weekStart, marker.week_start) / 7) + 1,
    startWeek: marker.week_start,
    color: marker.color ?? DEFAULT_PHASE_COLOR,
  };
}

// The first change AFTER this week, if any — i.e. where a phase set here
// would stop. Lets the popup state its own blast radius honestly instead of
// promising "from here on" when a later change already exists.
export function nextMarkerAfter(markers, weekStart) {
  return (
    [...(markers ?? [])]
      .sort((a, b) => (a.week_start < b.week_start ? -1 : a.week_start > b.week_start ? 1 : 0))
      .find((m) => m.week_start > weekStart) ?? null
  );
}

// True when picking `name` on this week would change nothing except restart
// the counter — the run covering it is already called that, and the marker
// isn't sitting on this week. Guarded because a coach opening a pill that
// reads "Diet" and pressing "Diet" expects nothing to happen, not for the
// numbering to reset to 1 from that week.
export function isRedundantPhase(markers, weekStart, name) {
  const covering = markerCovering(markers, weekStart);
  if (!covering || !covering.phase) return false;
  if (covering.week_start === weekStart) return false;
  return covering.phase.trim().toLowerCase() === String(name ?? "").trim().toLowerCase();
}
