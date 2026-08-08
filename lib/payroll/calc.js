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
