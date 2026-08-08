// Global flat rate tables — same rate for every coach, admin-write,
// staff-read (per explicit ask: no per-coach overrides for v1).
import { payroll } from "../supabase/client";
import { buildRateMaps } from "./calc";

export async function listCoreRates() {
  const { data, error } = await payroll.from("core_rates").select("*");
  if (error) throw error;
  return data;
}

export async function updateCoreRate(workType, rate) {
  const { error } = await payroll.from("core_rates").update({ rate }).eq("work_type", workType);
  if (error) throw error;
}

export async function listOtherRates() {
  const { data, error } = await payroll.from("other_rates").select("*").order("other_type");
  if (error) throw error;
  return data;
}

export async function updateOtherRate(otherType, fields) {
  const { error } = await payroll.from("other_rates").update(fields).eq("other_type", otherType);
  if (error) throw error;
}

export async function createOtherRate({ otherType, unit, rate }) {
  const { error } = await payroll.from("other_rates").insert({ other_type: otherType, unit, rate });
  if (error) throw error;
}

export async function listSpcTiers() {
  const { data, error } = await payroll.from("spc_tiers").select("*").order("attendees");
  if (error) throw error;
  return data;
}

export async function updateSpcTier(attendees, ratePerSession) {
  const { error } = await payroll.from("spc_tiers").update({ rate_per_session: ratePerSession }).eq("attendees", attendees);
  if (error) throw error;
}

// One batched fetch for screens that need all three tables at once (the
// entry form, the report, the rates admin page) — same "fetch everything
// once, aggregate client-side" convention as lib/programming/coachDashboard.js.
export async function listAllRates() {
  const [coreRates, otherRates, spcTiers] = await Promise.all([listCoreRates(), listOtherRates(), listSpcTiers()]);
  return { coreRates, otherRates, spcTiers };
}

// Captures a full copy of every rate table at the exact moment a period is
// closed — see 0041_payroll_redesign.sql's header for the full "why". One
// row per period, written once, never updated.
export async function saveRateSnapshotForPeriod(periodStart, { coreRates, otherRates, spcTiers }) {
  const { error } = await payroll
    .from("closed_period_rate_snapshots")
    .insert({ pay_period_start: periodStart, core_rates: coreRates, other_rates: otherRates, spc_tiers: spcTiers });
  if (error) throw error;
}

// The function every report/entry screen should route through instead of
// calling listAllRates() directly: a closed period reads its own frozen
// rates (immune to a later rate edit), an open period reads the live
// tables exactly as before. Falls back to live rates if a closed period
// somehow has no snapshot (e.g. one closed before this feature shipped) —
// better to show a plausible-but-not-guaranteed-frozen number than to
// throw and block the whole report.
export async function getRateMapsForPeriod(periodRow) {
  if (periodRow?.closed) {
    const { data, error } = await payroll
      .from("closed_period_rate_snapshots")
      .select("*")
      .eq("pay_period_start", periodRow.start_date)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return buildRateMaps({ coreRates: data.core_rates, otherRates: data.other_rates, spcTiers: data.spc_tiers });
    }
  }
  return buildRateMaps(await listAllRates());
}
