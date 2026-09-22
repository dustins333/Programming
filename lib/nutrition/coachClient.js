import { Platform } from "react-native";
import { supabase } from "../supabase/client";

// Focus items (Dashboard tab checklist) and game plan (freeform text on the
// client row itself) — neither existed in Kova's placeholder nutrition
// module at all, these are net-new against the shared public.* tables.

export async function listFocusItems(userId) {
  const { data, error } = await supabase
    .from("focus_items")
    .select("*")
    .eq("client_id", userId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function addFocusItem(userId, text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Focus item text is required");

  const { data: last } = await supabase
    .from("focus_items")
    .select("position")
    .eq("client_id", userId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase
    .from("focus_items")
    .insert({ client_id: userId, text: trimmed, position: (last?.position ?? 0) + 1 });
  if (error) throw error;
}

export async function editFocusItem(itemId, text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("Focus item text is required");
  const { error } = await supabase.from("focus_items").update({ text: trimmed }).eq("id", itemId);
  if (error) throw error;
}

export async function toggleFocusItem(itemId, done) {
  const { error } = await supabase.from("focus_items").update({ done }).eq("id", itemId);
  if (error) throw error;
}

export async function deleteFocusItem(itemId) {
  const { error } = await supabase.from("focus_items").delete().eq("id", itemId);
  if (error) throw error;
}

// Rewrites every row's position as 1..N, same shape as
// lib/programming/workouts.js's reorderWorkoutExercises. Position is not just
// display order — it also freezes the ordering of focus_snapshot when a
// check-in is submitted (see lib/nutrition/checkin.js).
export async function reorderFocusItems(items) {
  const results = await Promise.all(
    items.map((item) => supabase.from("focus_items").update({ position: item.position }).eq("id", item.id))
  );
  for (const { error } of results) if (error) throw error;
}

// A last-resort write for the moment the page is being torn down: a hard
// refresh, a closed tab, iOS killing the PWA. React cleanup does NOT run
// then — measured, not assumed: typing in the notes box and reloading 120ms
// later produced ZERO outgoing requests, so neither the debounce nor the
// unmount flush had a chance and the note was simply gone on the way back.
// The same finding is already recorded for form drafts in lib/formDraft.js.
//
// A pagehide handler can't await anything, so this is a raw keepalive PATCH
// rather than a supabase-js call: keepalive is what lets the browser finish
// a request after the document is gone. It needs the access token
// synchronously, hence the cache — supabase.auth.getSession() is async and
// loses the race with teardown.
//
// Fire-and-forget by design. Nothing can observe the result at this point,
// and the ordinary paths (debounce, blur, unmount, tab-hidden) still cover
// every case where anything can.
let cachedAccessToken = null;
if (Platform.OS === "web") {
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token ?? null;
  });
}

export function beaconGamePlan(userId, gamePlan) {
  if (Platform.OS !== "web" || typeof fetch !== "function") return false;
  if (!userId || !cachedAccessToken) return false;
  try {
    fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/clients?id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH",
      keepalive: true,
      headers: {
        apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${cachedAccessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ game_plan: gamePlan }),
    });
    return true;
  } catch (err) {
    console.error("Failed to beacon notes on page hide:", err);
    return false;
  }
}

// Asks for the row back and throws when none comes. An UPDATE that matches
// nothing — RLS filtered it out, or the id isn't a client row — affects zero
// rows and returns NO error, so without this the notes box says "Saved" over
// a write that never happened. Demonstrated live, not assumed: the same
// update against a made-up id reported success.
export async function updateGamePlan(userId, gamePlan) {
  const { data, error } = await supabase
    .from("clients")
    .update({ game_plan: gamePlan })
    .eq("id", userId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Those notes could not be saved.");
}

// Answer-drag-select highlighting (web-only UI, see
// components/nutrition/HighlightableAnswer.web.js) — highlights is a jsonb
// map of { [answerIndex]: [[start,end], ...] } on the checkin_responses row.
export async function setCheckinHighlights(checkinResponseId, highlights) {
  const { error } = await supabase.from("checkin_responses").update({ highlights }).eq("id", checkinResponseId);
  if (error) throw error;
}

// The questionnaire's equivalent. Same jsonb shape and the same coach-only
// RLS as setCheckinHighlights above, so the onboarding review highlights
// exactly like a weekly check-in does — which is the point, since the
// questionnaire IS her first check-in as far as the coach's review flow is
// concerned.
//
// Keyed by client_id, not by a row id: questionnaire_responses has no id
// column at all (one response per client, client_id is the key), unlike
// checkin_responses which has one row per week.
export async function setQuestionnaireHighlights(userId, highlights) {
  const { error } = await supabase.from("questionnaire_responses").update({ highlights }).eq("client_id", userId);
  if (error) throw error;
}
