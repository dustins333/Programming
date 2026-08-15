// Pure calculation functions — no network calls. Fed rate-table rows +
// pay_entries rows already fetched by a screen, same client-side-aggregation
// convention as lib/programming/coachDashboard.js rather than a DB view, so
// the running total on the entry form can update instantly as a coach types
// without a round-trip.
//
// Confirmed against real historical data: Abbi's Jul 23–Aug 5, 2026 period
// computes to Group $125 / Programs $195 / Admin $95.40 / SPC $584 / Other
// $287.50 / Total $1,286.90 — matches the real Glide Payroll Report exactly.

export function buildRateMaps({ coreRates = [], otherRates = [], spcTiers = [] }) {
  return {
    core: Object.fromEntries(coreRates.map((r) => [r.work_type, Number(r.rate)])),
    other: Object.fromEntries(otherRates.map((r) => [r.other_type, Number(r.rate)])),
    spc: Object.fromEntries(spcTiers.map((r) => [r.attendees, Number(r.rate_per_session)])),
  };
}

// SPC pay is a flat rate per session, tiered by that session's attendee
// count (0-4) — not per-attendee. A session with no matching tier (shouldn't
// happen once the input is capped at 4, but historical data can carry
// anything) contributes $0 rather than throwing.
function spcAmountForEntry(entry, rateMaps) {
  if (!entry.spc_session || entry.spc_attendees == null) return 0;
  return rateMaps.spc[entry.spc_attendees] ?? 0;
}

function otherAmountForEntry(entry, rateMaps) {
  if (!entry.other_type) return 0;
  const rate = rateMaps.other[entry.other_type] ?? 0;
  const qty = entry.other_qty ?? 1;
  return rate * qty;
}

export function computeEntryBreakdown(entry, rateMaps) {
  const group = (entry.group_sessions || 0) * (rateMaps.core.group_session || 0);
  const programs = (entry.programs_written || 0) * (rateMaps.core.program_written || 0);
  const admin = (entry.admin_hours || 0) * (rateMaps.core.admin_hours || 0);
  const welcome = (entry.welcome_sessions || 0) * (rateMaps.core.welcome_session || 0);
  const strategy = (entry.strategy_sessions || 0) * (rateMaps.core.strategy_session || 0);
  const ops = (entry.ops_hours || 0) * (rateMaps.core.ops_hours || 0);
  const spc = spcAmountForEntry(entry, rateMaps);
  const other = otherAmountForEntry(entry, rateMaps);
  const custom = entry.custom_amt || 0;
  const total = group + programs + admin + welcome + strategy + ops + spc + other + custom;
  return { group, programs, admin, welcome, strategy, ops, spc, other, custom, total };
}

const emptyTotals = () => ({
  groupAmount: 0, groupCount: 0,
  programsAmount: 0, programsCount: 0,
  adminAmount: 0, adminHours: 0,
  welcomeAmount: 0, welcomeCount: 0,
  strategyAmount: 0, strategyCount: 0,
  opsAmount: 0, opsHours: 0,
  spcAmount: 0, spcSessions: 0, spcAttendees: 0,
  otherAmount: 0,
  customAmount: 0,
  total: 0,
});

// One coach's (or one employee row's, for the admin all-employee grid)
// category totals across a set of entries — mirrors the real Payroll
// Report's column layout: an amount + a count/hours side by side per
// category.
export function computeTotals(entries, rateMaps) {
  const totals = emptyTotals();
  for (const entry of entries || []) {
    const b = computeEntryBreakdown(entry, rateMaps);
    totals.groupAmount += b.group;
    totals.groupCount += entry.group_sessions || 0;
    totals.programsAmount += b.programs;
    totals.programsCount += entry.programs_written || 0;
    totals.adminAmount += b.admin;
    totals.adminHours += entry.admin_hours || 0;
    totals.welcomeAmount += b.welcome;
    totals.welcomeCount += entry.welcome_sessions || 0;
    totals.strategyAmount += b.strategy;
    totals.strategyCount += entry.strategy_sessions || 0;
    totals.opsAmount += b.ops;
    totals.opsHours += entry.ops_hours || 0;
    totals.spcAmount += b.spc;
    if (entry.spc_session) {
      totals.spcSessions += 1;
      totals.spcAttendees += entry.spc_attendees || 0;
    }
    totals.otherAmount += b.other;
    totals.customAmount += b.custom;
    totals.total += b.total;
  }
  return totals;
}

// Groups a flat entries list by user_id (or staff_email as a fallback for
// legacy rows whose user_id was set null after a coach was removed) — the
// shape the admin all-employee grid needs.
export function computeTotalsByStaff(entries, rateMaps) {
  const byStaff = new Map();
  for (const entry of entries || []) {
    const key = entry.user_id || entry.staff_email;
    if (!byStaff.has(key)) byStaff.set(key, []);
    byStaff.get(key).push(entry);
  }
  return Array.from(byStaff.entries()).map(([key, staffEntries]) => ({
    key,
    userId: staffEntries[0].user_id,
    staffName: staffEntries[0].staff_name,
    staffEmail: staffEntries[0].staff_email,
    totals: computeTotals(staffEntries, rateMaps),
  }));
}

export function formatMoney(amount) {
  const value = Number(amount) || 0;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// A logged quantity — a session count, or hours. Two decimals maximum,
// which is also all the column stores (numeric(10,2)), with integers left
// as integers ("31", not "31.00") and a trailing zero trimmed ("6.5", not
// "6.50").
//
// Not cosmetic: 174 real imported entries carry non-quarter hours (0.15,
// 0.67, 1.08…), and summing those in floating point gives tails like
// 26.099999999999998, which is exactly what a column of summed hours was
// rendering. Every raw number on a payroll screen goes through here.
export function formatQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}

// One label-building function per Report category — used only by
// entriesForCategory below, kept as a lookup rather than a switch so the
// category key list (which already exists as the Report's own ROWS array
// in components/payroll/PayrollReportPieces.js) has one obvious place to
// extend if a category's display text needs to change.
const CATEGORY_LABELERS = {
  group: (e) => `${formatQuantity(e.group_sessions)} session${Number(e.group_sessions) === 1 ? "" : "s"}`,
  strategy: (e) => `${formatQuantity(e.strategy_sessions)} session${Number(e.strategy_sessions) === 1 ? "" : "s"}`,
  programs: (e) => `${formatQuantity(e.programs_written)} program${Number(e.programs_written) === 1 ? "" : "s"}`,
  admin: (e) => `${formatQuantity(e.admin_hours)} hr${Number(e.admin_hours) === 1 ? "" : "s"}`,
  welcome: (e) => `${formatQuantity(e.welcome_sessions)} session${Number(e.welcome_sessions) === 1 ? "" : "s"}`,
  ops: (e) => `${formatQuantity(e.ops_hours)} hr${Number(e.ops_hours) === 1 ? "" : "s"}`,
  spc: (e) => `${e.spc_attendees ?? "?"} attendee${Number(e.spc_attendees) === 1 ? "" : "s"}`,
  other: (e) => `${e.other_type} ×${formatQuantity(e.other_qty ?? 1)}`,
  custom: (e) => e.custom_description || "Custom",
};

// Whether a given entry row contributes anything to a category — mirrors
// computeTotals' own per-field non-zero checks, just per-row instead of
// summed, so the Report tab's "tap Group, see every date" drill-down only
// ever lists rows that actually moved that category's total.
function entryHasCategory(entry, categoryKey) {
  switch (categoryKey) {
    case "group":
      return Boolean(entry.group_sessions);
    case "strategy":
      return Boolean(entry.strategy_sessions);
    case "programs":
      return Boolean(entry.programs_written);
    case "admin":
      return Boolean(entry.admin_hours);
    case "welcome":
      return Boolean(entry.welcome_sessions);
    case "ops":
      return Boolean(entry.ops_hours);
    case "spc":
      return Boolean(entry.spc_session);
    case "other":
      return Boolean(entry.other_type);
    case "custom":
      return Boolean(entry.custom_amt);
    default:
      return false;
  }
}

// Which pay_entries column (if any) holds a category's free-text notes —
// only categories that actually collect notes get one; Group/Admin/Ops
// have no notes concept at all (their tiles never ask for it), and Custom
// already surfaces its one text field as the drill-down's quantityLabel
// itself, so it doesn't need a second copy here.
const CATEGORY_NOTES_FIELD = {
  strategy: "strategy_notes",
  programs: "program_notes",
  welcome: "welcome_notes",
  spc: "spc_notes",
  other: "notes",
};

// Powers the Report tab's per-category drill-down popup — "tap Group, see
// every date and quantity that added up to this total." Also carries
// whatever notes were logged alongside that entry (client names for
// Welcome/Strategy/Programs, who-attended for SPC, a free note for Other),
// so a coach reviewing their own report — or an admin reviewing a coach's —
// doesn't have to go dig through the daily entry screen to see them.
export function entriesForCategory(entries, categoryKey, rateMaps) {
  const labeler = CATEGORY_LABELERS[categoryKey];
  if (!labeler) return [];
  const notesField = CATEGORY_NOTES_FIELD[categoryKey];
  return (entries || [])
    .filter((e) => entryHasCategory(e, categoryKey))
    .map((e) => ({
      date: e.entry_date,
      quantityLabel: labeler(e),
      notes: notesField ? e[notesField] || null : null,
      amount: computeEntryBreakdown(e, rateMaps)[categoryKey] || 0,
      entry: e,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Splits one date's full pay_entries row set into the "kinds" the new
// tile-based entry screen understands. `core` holds the simple-counter and
// popup-driven-single-value fields (group/programs/admin/welcome/strategy/
// ops) — there is at most one such row per (user, date), created on first
// save and updated (never re-inserted) on every later tile confirm. SPC
// sessions and Other line items are each their own independent row per
// submission (a coach can log more than one of either per date), and
// Custom stays single-per-date by design (see the plan's Phase B5 note).
// A row counts as "core" by elimination — it isn't an SPC session, isn't
// an Other item, and isn't the Custom row.
export function partitionDayEntries(rows) {
  const list = rows || [];
  const spcSessions = list.filter((r) => r.spc_session);
  const otherItems = list.filter((r) => r.other_type);
  const customRows = list.filter((r) => r.custom_amt != null || r.custom_description);
  const core = list.find((r) => !r.spc_session && !r.other_type && r.custom_amt == null && !r.custom_description) || null;
  return {
    core,
    spcSessions,
    otherItems,
    custom: customRows[0] || null,
  };
}
