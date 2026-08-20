import { payroll, core } from "../supabase/client";
import { ensurePayPeriod } from "./periods";

// One coach's entries for a period.
//
// staffEmail is not optional in practice: every pay entry imported from
// Glide carries staff_name/staff_email but NO user_id (those accounts didn't
// exist in Kova yet), and that's the majority of the historical table. A
// user_id-only filter therefore showed a coach an empty pay stub for every
// period before cutover — while the admin's all-staff view, which keys on
// `user_id ?? staff_email` (calc.js's computeTotalsByStaff), showed those
// same rows correctly. Matching on either identity is what makes the two
// agree.
export async function listEntriesForPeriod(userId, periodStart, staffEmail) {
  let query = payroll.from("pay_entries").select("*").eq("pay_period_start", periodStart);
  // The email is double-quoted so a value containing a comma or parenthesis
  // can't be read as more or() branches.
  query = staffEmail
    ? query.or(`user_id.eq.${userId},staff_email.eq."${staffEmail.replace(/"/g, '')}"`)
    : query.eq("user_id", userId);
  const { data, error } = await query.order("entry_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Admin all-employee report / audit views — every entry for a period,
// regardless of whose it is.
export async function listEntriesForPeriodAllStaff(periodStart) {
  const { data, error } = await payroll
    .from("pay_entries")
    .select("*")
    .eq("pay_period_start", periodStart);
  if (error) throw error;
  return data;
}

// PostgREST caps every response at the project's `max_rows` setting (1000 by
// default) — silently, with no error and no signal that anything was left
// behind. That is fine for a single period (~120 entries) but not for a query
// spanning every closed period at once, which is already past 2,000 rows: the
// periods whose entries fell past the cut came back empty, so the
// closed-periods list rendered a confident $0.00 owner/staff pay for them.
// Because rows come back in heap order — roughly oldest-first, the order the
// Glide import inserted them — the ones that got dropped were the ten most
// RECENT periods, i.e. the top of the list and the only ones anyone reads.
//
// Paging keeps the pay formula in one place (calc.js). Pushing a SUM into SQL
// would be cheaper still, but it would mean a second implementation of how
// pay is calculated, and those two would drift.
const PAGE_SIZE = 1000;

// Ordering matters here beyond presentation: paging over an unordered query
// lets Postgres return rows in a different order per page, which duplicates
// some rows and drops others. `id` is the primary key, so it is stable.
async function fetchAllPages(buildQuery) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().order("id").range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...data);
    // Advance by what came back, not by what was asked for, and stop only on
    // an empty page: the server is free to cap a page below PAGE_SIZE, and
    // treating a short page as "that was the last one" would reintroduce the
    // exact silent truncation this exists to prevent.
    if (data.length === 0) return all;
    from += data.length;
  }
}

// Every staff member's entries across several periods at once, grouped by
// period start. Paged rather than one-request-per-period — the closed-periods
// screen needs figures for its whole list up front, and 20-odd sequential
// fetches to render a page of totals is not a trade worth making.
export async function listEntriesForPeriods(periodStarts) {
  if (!periodStarts?.length) return new Map();
  const data = await fetchAllPages(() => payroll.from("pay_entries").select("*").in("pay_period_start", periodStarts));
  const byPeriod = new Map(periodStarts.map((p) => [p, []]));
  for (const row of data) {
    if (!byPeriod.has(row.pay_period_start)) byPeriod.set(row.pay_period_start, []);
    byPeriod.get(row.pay_period_start).push(row);
  }
  return byPeriod;
}

async function snapshotStaff(userId) {
  const { data, error } = await core.from("users").select("name, email").eq("id", userId).single();
  if (error) throw error;
  return { staff_name: data.name, staff_email: data.email };
}

// `source` defaults to coach_entry (a plain logged row); custom-request
// approval and nutrition-billing finalize both pass their own source value
// so the row's origin stays traceable.
export async function createEntry(userId, periodStart, fields, source = "coach_entry") {
  await ensurePayPeriod(periodStart);
  const snapshot = await snapshotStaff(userId);
  const { data, error } = await payroll
    .from("pay_entries")
    .insert({
      user_id: userId,
      ...snapshot,
      pay_period_start: periodStart,
      source,
      ...fields,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEntry(entryId, fields) {
  const { error } = await payroll
    .from("pay_entries")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", entryId);
  if (error) throw error;
}

export async function deleteEntry(entryId) {
  const { error } = await payroll.from("pay_entries").delete().eq("id", entryId);
  if (error) throw error;
}
