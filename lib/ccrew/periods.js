import { programming, core } from "../supabase/client";

// --------------------------------------------------------------------
// reads
// --------------------------------------------------------------------

// PostgREST caps every response at 1000 rows by default, and it does so
// SILENTLY — you get 1000 rows and a 200, not an error. That bit for real:
// the streak query ordered by period ascending, so once history passed 1000
// qualifying records the four most recent months fell off the end, nobody
// could reach a perfect record (Top Dogs rendered empty) and every current
// streak resolved to 0. Anything that can outgrow 1000 rows must page.
const PAGE = 1000;

async function fetchAllPages(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

export async function listMembers() {
  return fetchAllPages(() =>
    programming.from("ccrew_members").select("id, email, name, user_id, is_active").order("name")
  );
}

export async function listPeriods() {
  const { data, error } = await programming
    .from("ccrew_periods")
    .select("*")
    .order("period", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listKovaUsers() {
  const { data, error } = await core.from("users").select("id, name, email, role").order("name");
  if (error) throw error;
  return (data || []).map((u) => ({ ...u, email: (u.email || "").toLowerCase() }));
}

export async function getPeriodRecords(period) {
  // One month is ~139 rows today, but a growing gym reaches 1000 eventually
  // and the failure would again be silent.
  return fetchAllPages(() =>
    programming
      .from("ccrew_records")
      .select("*, member:ccrew_members(id, name, email, user_id, is_active)")
      .eq("period", period)
      .order("member_id")
  );
}

// Every qualifying record ever, for the streak/lifetime maths. Deliberately
// only the qualifying ones: the non-qualifiers are kept in the table for
// audit and near-miss work, but nothing about a streak needs them, and this
// keeps the payload small enough to reduce client-side (this codebase's
// standing "fetch the rows, group in JS" convention).
export async function listQualifyingRecords() {
  // Paged — this is the one query guaranteed to outgrow the row cap: it is
  // every qualifying month for every member, and it grows by ~90 rows a
  // month forever.
  return fetchAllPages(() =>
    programming
      .from("ccrew_records")
      .select("period, member_id, attendance, target, tier")
      .eq("qualified", true)
      .order("period")
  );
}

// --------------------------------------------------------------------
// writes (admin only per RLS)
// --------------------------------------------------------------------

/** The manual match table: taught once, remembered forever. */
export async function linkMemberToUser(memberId, userId) {
  const { error } = await programming
    .from("ccrew_members")
    .update({ user_id: userId, updated_at: new Date().toISOString() })
    .eq("id", memberId);
  if (error) throw error;
}

/**
 * Commit a scored month.
 *
 * Sequential plain writes rather than one transaction, matching this
 * codebase's convention. Ordered so a failure part-way is recoverable by
 * re-running rather than corrupting: members first (idempotent upsert),
 * then the period row, then records last — and records are deleted and
 * re-inserted as a set, so a re-upload of the same month replaces it
 * cleanly instead of merging into a half-old list.
 */
export async function commitPeriod({ period, entries, dropped = [], uploadedBy, source = "upload", notes = null }) {
  // 1. Members. Upsert on email — the person key, never the name.
  const memberRows = entries.map((e) => ({
    email: e.email,
    name: e.name,
    user_id: e.linkedUserId || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  }));
  if (memberRows.length) {
    const { error } = await programming
      .from("ccrew_members")
      .upsert(memberRows, { onConflict: "email" });
    if (error) throw error;
  }

  // 2. Anyone previously active who isn't in this export has left. Keep
  //    their history, mark them inactive — if they come back it's all here.
  if (dropped.length) {
    const { error } = await programming
      .from("ccrew_members")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", dropped.map((m) => m.id));
    if (error) throw error;
  }

  // 3. Resolve every email to its member id (new rows have none yet).
  const { data: members, error: memberErr } = await programming
    .from("ccrew_members")
    .select("id, email")
    .in("email", entries.map((e) => e.email));
  if (memberErr) throw memberErr;
  const idByEmail = new Map((members || []).map((m) => [m.email, m.id]));

  // 4. The period row.
  const qualified = entries.filter((e) => e.qualified);
  const { error: periodErr } = await programming.from("ccrew_periods").upsert(
    {
      period,
      source,
      roster_count: entries.length,
      qualified_count: qualified.length,
      uploaded_by: uploadedBy || null,
      uploaded_at: new Date().toISOString(),
      notes,
    },
    { onConflict: "period" }
  );
  if (periodErr) throw periodErr;

  // 5. Records — replace wholesale. `packages` and `target` are FROZEN
  //    here and never recomputed: Kilo returns packages as of export time,
  //    so a closed month re-derived from current packages would silently
  //    change who was on the wall.
  const { error: delErr } = await programming.from("ccrew_records").delete().eq("period", period);
  if (delErr) throw delErr;

  const recordRows = entries
    .map((e) => ({
      period,
      member_id: idByEmail.get(e.email),
      attendance: e.attendance,
      packages: e.packages,
      package_target: e.packageTarget,
      target: e.target,
      qualified: e.qualified,
      tier: e.tier,
      staff_floor_applied: e.staffFloorApplied,
    }))
    .filter((r) => r.member_id);

  // Chunked: ~139 rows today, but a single insert of a few hundred rows is
  // near the point where PostgREST payload limits start to matter.
  for (let i = 0; i < recordRows.length; i += 200) {
    const { error } = await programming.from("ccrew_records").insert(recordRows.slice(i, i + 200));
    if (error) throw error;
  }

  return { members: recordRows.length, qualified: qualified.length };
}

export async function deletePeriod(period) {
  const { error } = await programming.from("ccrew_periods").delete().eq("period", period);
  if (error) throw error;
}
