// Texts the client a copy of a saved strategy session: Goal, Plan and
// Notes, never the pillar or coach-only notes (composeText). Only ever sent
// because the coach tapped Yes after saving; nothing sends it on its own.
//
// Asks GHL to send it as the coach who saved the session, but GHL actually
// sends it as the client's assigned user (tested 2026-09-28; fine by Terra).
// The exact message is stored in texted_body, which is how the
// screen knows whether a later edit changed what she'd receive.
//
// Body: { session_id }.
//
// Deploy with: supabase functions deploy strategy-session-text
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  coachGhlUserId,
  describeGhlError,
  getContactTexting,
  type KovaSessionRow,
  listGhlUsers,
  requireStaff,
  sendSms,
  SESSION_COLUMNS,
  textForRow,
} from "../_shared/strategySession.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  const auth = await requireStaff(req, createClient, jsonHeaders);
  if (auth instanceof Response) return auth;
  const { admin } = auth;

  const input = await req.json().catch(() => ({}));
  if (typeof input.session_id !== "string") return reply({ error: "session_id is required" }, 400);

  const sessions = admin.schema("programming").from("strategy_sessions");
  const { data, error } = await sessions.select(SESSION_COLUMNS).eq("id", input.session_id).maybeSingle();
  if (error) return reply({ error: error.message }, 500);
  if (!data) return reply({ error: "That session wasn't found." }, 404);
  const row = data as KovaSessionRow;

  let message: string | null;
  let texting;
  let ghlUserId: string | null;
  try {
    [message, texting, ghlUserId] = await Promise.all([
      textForRow(admin, row),
      getContactTexting(row.ghl_contact_id),
      listGhlUsers().then((users) => coachGhlUserId(admin, row.coach_id, users)),
    ]);
  } catch (err) {
    return reply({ error: describeGhlError(err) }, 502);
  }
  if (!message) return reply({ error: "This session was saved before Goal and Plan existed, so there's nothing to send." }, 400);
  if (!texting.ok) return reply({ error: texting.reason }, 400);

  try {
    await sendSms(row.ghl_contact_id, message, ghlUserId);
  } catch (err) {
    console.error("strategy session text failed:", err);
    return reply({ error: `The text didn't send. ${describeGhlError(err)}` }, 502);
  }

  // Sent, so record it; a failure here only means the screen may offer to
  // send again later, which is the safer direction.
  const textedAt = new Date().toISOString();
  const { error: markErr } = await sessions.update({ texted_at: textedAt, texted_body: message }).eq("id", row.id);
  if (markErr) console.error("text sent but not recorded:", markErr.message);
  return reply({ texted_at: textedAt, texted_body: message });
});
