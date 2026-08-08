// Global flat rate tables — same rate for every coach, admin-write,
// staff-read (per explicit ask: no per-coach overrides for v1).
import { payroll } from "../supabase/client";

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
