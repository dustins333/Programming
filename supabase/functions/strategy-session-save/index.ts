// Saves a strategy session: records it in Kova and writes the notes to the
// client's GHL contact as a note, under the saving coach's own GHL user.
//
// Order matters. The Kova row is written first, so a GHL failure never
// loses what the coach typed. Then the GHL note is posted and its id stored
// on the row. Saving the same client on the same day again (a double tap,
// an edit, a retry after a GHL failure) updates that one row and edits that
// one GHL note, never a second copy: the row is unique per client per day,
// and a stored ghl_note_id turns the next write into an edit.
//
// A GHL failure still returns 200, with ghl_synced: false and a message:
// the session IS saved, and the screen should say "saved, but not sent to
// GoHighLevel yet" with a retry rather than an error that reads as lost
// work. Saving again retries it.
//
// Body: { ghl_contact_id } or { user_id }, plus the session's template:
// { goal } and { plan: string[] } (both required), optional { client_notes }
// and { coach_notes }, and { pillar } (one of PILLARS' keys: the coach's
// choice, which saving locks in). The older { notes } free-text body is
// still accepted in place of the template, for a screen loaded before the
// template shipped. Optional
// { held_on: "YYYY-MM-DD" } (defaults to today in Boise) and optional
// { appointment_id } (the calendar booking it was held as).
//
// Deploy with: supabase functions deploy strategy-session-save
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  describeGhlError,
  isIsoDate,
  composeBody,
  isPillar,
  type KovaSessionRow,
  readSessionFields,
  type SessionFields,
  textForRow,
  listGhlUsers,
  requireStaff,
  SESSION_COLUMNS,
  syncSessionToGhl,
  todayInBoise,
} from "../_shared/strategySession.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  const auth = await requireStaff(req, createClient, jsonHeaders);
  if (auth instanceof Response) return auth;
  const { admin, caller } = auth;

  const input = await req.json().catch(() => ({}));
  // The template, or (from a screen loaded before it shipped) free text.
  let fields: SessionFields | null = null;
  let notes: string;
  if (input.goal !== undefined || input.plan !== undefined) {
    const read = readSessionFields(input);
    if (typeof read === "string") return reply({ error: read }, 400);
    fields = read;
    notes = composeBody(fields);
  } else {
    notes = typeof input.notes === "string" ? input.notes.trim() : "";
    if (!notes) return reply({ error: "Write some notes before saving." }, 400);
  }
  if (!isPillar(input.pillar)) return reply({ error: "Pick her pillar to save." }, 400);
  const pillar = input.pillar;
  const today = todayInBoise();
  const heldOn = input.held_on === undefined ? today : input.held_on;
  if (!isIsoDate(heldOn)) return reply({ error: "held_on must be a YYYY-MM-DD date" }, 400);
  if (heldOn > today) return reply({ error: "A session can't be saved for a future date." }, 400);
  const appointmentId = typeof input.appointment_id === "string" ? input.appointment_id : null;

  const users = admin.schema("core").from("users");
  let contactId: string | null = typeof input.ghl_contact_id === "string" ? input.ghl_contact_id : null;
  let userId: string | null = typeof input.user_id === "string" ? input.user_id : null;
  if (!contactId && userId) {
    const { data } = await users.select("ghl_contact_id").eq("id", userId).maybeSingle();
    contactId = data?.ghl_contact_id ?? null;
    if (!contactId) return reply({ error: "This client isn't linked to GoHighLevel, so the notes have nowhere to go." }, 400);
  }
  if (!contactId) return reply({ error: "ghl_contact_id or user_id is required" }, 400);
  if (!userId) {
    const { data } = await users.select("id").eq("ghl_contact_id", contactId).maybeSingle();
    userId = data?.id ?? null;
  }

  const sessions = admin.schema("programming").from("strategy_sessions");

  // Upsert, then read back: an RLS-free service-role write, but the row's
  // existing ghl_note_id (from an earlier save today) is what decides
  // between posting and editing in GHL, so it has to come from the table.
  const patch: Record<string, unknown> = {
    ghl_contact_id: contactId,
    user_id: userId,
    held_on: heldOn,
    coach_id: caller.id,
    notes,
    pillar,
    goal: fields?.goal ?? null,
    plan: fields?.plan ?? null,
    client_notes: fields?.client_notes ?? null,
    coach_notes: fields?.coach_notes ?? null,
    updated_at: new Date().toISOString(),
  };
  if (appointmentId) patch.ghl_appointment_id = appointmentId;
  const { error: upsertErr } = await sessions.upsert(patch, { onConflict: "ghl_contact_id,held_on" });
  if (upsertErr) return reply({ error: upsertErr.message }, 500);

  const { data: row, error: readErr } = await sessions
    .select(SESSION_COLUMNS)
    .eq("ghl_contact_id", contactId)
    .eq("held_on", heldOn)
    .single();
  if (readErr || !row) return reply({ error: readErr?.message ?? "Saved, but couldn't read the session back." }, 500);

  // The text she'd get if the coach sends one. The screen compares it with
  // texted_body to decide whether to offer (again). A lookup failure only
  // costs the offer, never the save.
  const textPreview = await textForRow(admin, row as KovaSessionRow).catch((err) => {
    console.error("text preview failed:", err);
    return null;
  });

  try {
    const synced = await syncSessionToGhl(admin, row as KovaSessionRow, await listGhlUsers());
    return reply({ session: { ...row, ...synced }, ghl_synced: true, text_preview: textPreview });
  } catch (err) {
    console.error("GHL note write failed:", err);
    return reply({
      session: row,
      ghl_synced: false,
      text_preview: textPreview,
      error: `Saved in Kova, but not sent to GoHighLevel yet. ${describeGhlError(err)}`,
    });
  }
});
