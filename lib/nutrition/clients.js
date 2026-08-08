// Points at the standalone Nutrition Tracker app's live public.* tables
// (same Supabase project, different schema) rather than Kova's own
// placeholder nutrition.* schema — see CLAUDE.md's nutrition-rebuild
// section. `supabase` here is the plain client, which defaults to the
// public schema; no `.schema()` call needed.
import { supabase } from "../supabase/client";
import { todayInBoise } from "../boiseDate";
import { copyQuestionnaireTemplateToClient } from "./onboarding";

export async function listClients() {
  const { data, error } = await supabase.from("clients").select("*");
  if (error) throw error;
  return data;
}

export async function getClient(userId) {
  const { data, error } = await supabase.from("clients").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

// A coach's own real active nutrition clients — backs the Payroll module's
// 1:1 Nutrition client dropdown (real clients, not a free-typed name, per
// the fix for the disconnected Glide "1:1 Nutrition" tracker).
export async function listClientsForCoach(coachId) {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("coach_id", coachId)
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return data;
}

// Exported for the member Settings screen's read-only "Assigned coach" row
// — everywhere else in this file already had a private version of this
// same lookup.
export async function getCoachRow(coachId) {
  const { data, error } = await supabase.from("coaches").select("*").eq("id", coachId).maybeSingle();
  if (error) throw error;
  return data;
}

// Branches on whether this person already has a public.clients row — a real
// standalone-app client who's also a Kova member just gets reactivated
// (never touching coach_id/name/objective_tracking_approved_at, since
// they're already past onboarding); someone genuinely new to nutrition gets
// a fresh row and lands in the onboarding hub. No client_drafts involved —
// that table exists only for people with no auth.users row yet, which
// doesn't apply here since this is always an existing Kova member.
//
// coach_id starts null (unassigned) rather than defaulting to whoever
// flipped the toggle — a coach can turn Nutrition on for a client without
// that meaning "and also assign myself as their nutrition coach." Real
// assignment happens via the dropdown on the Objective Tracking onboarding
// step (or later from Client Settings) — see lib/nutrition/onboarding.js's
// tracking step and components/nutrition/ClientSettingsModal.js.
export async function createOrReactivateClient({ userId, name, email, phone }) {
  const existing = await getClient(userId);
  if (existing) {
    const { data, error } = await supabase
      .from("clients")
      .update({ status: "active" })
      .eq("id", userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      id: userId,
      coach_id: null,
      name,
      email,
      phone: phone || null,
      start_date: todayInBoise(),
      status: "active",
      // Held back from the client until the coach explicitly sends it (see
      // sendOnboardingToClient below) — the column defaults to now() (i.e.
      // "already sent") for everyone else, so this is the one insert path
      // that opts into the held-back state.
      onboarding_sent_at: null,
    })
    .select()
    .single();
  if (error) throw error;

  // The standalone app's draft-invite flow copies the questionnaire
  // template onto a new client as part of "Send to client" — Kova skips the
  // draft stage entirely (this member already has a login), but still needs
  // that same copy so the onboarding questionnaire has content immediately
  // rather than the coach having to remember a separate step.
  await copyQuestionnaireTemplateToClient(userId);

  return data;
}

// `status` here is a plain data column only — DO NOT wire this to
// supabase.auth.admin.updateUserById(..., { ban_duration }). The standalone
// Nutrition Tracker app (same Supabase project, same public.clients table)
// used to do exactly that in its own setClientStatus, so switching a
// client's status away from "active" silently banned their real
// auth.users row project-wide, including sign-in to this app. That's fixed
// there now (status-only, no ban), and this file must never reintroduce it
// from the Kova side — "paused"/"archived" here should only ever mean
// "hidden from the active roster," never "locked out of their account."
export async function setClientStatus(userId, status) {
  const { error } = await supabase.from("clients").update({ status }).eq("id", userId);
  if (error) throw error;
}

// Free-form patch backing the Client Settings modal — name/phone/start_date/
// status/photo_frequency/photo_frequency_started_at in one call, same
// convention as programming's updateGroupProgram. Same ban-side-effect
// warning above applies to the status field here too.
export async function updateClient(userId, fields) {
  const { error } = await supabase.from("clients").update(fields).eq("id", userId);
  if (error) throw error;
}

// Releases a brand-new client's onboarding (questionnaire + tracking dates)
// to them — see migration 0031. Idempotent-ish in practice (re-sending just
// bumps the timestamp), but the coach-side UI only ever shows the button
// once, before the first send.
export async function sendOnboardingToClient(userId) {
  const { error } = await supabase.from("clients").update({ onboarding_sent_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw error;
}
