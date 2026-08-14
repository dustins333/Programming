import { programming, core } from "../supabase/client";
import { filterToAudience } from "./audience";

// Gym events (migration 0061) — admin composes, members see them on their
// own Events tab and optionally respond.
//
// There is no on/off switch for the tab: an event is visible exactly while
// status = 'published' and closes_at is in the future, and the tab hides
// itself when a member has none (see useEventsAccess.js). Unpublishing is
// the way to take something down early.

export const RESPONSE_TYPES = [
  { key: "none", label: "Nothing — just read it" },
  { key: "signup", label: "Sign-up" },
  { key: "order", label: "Order" },
  { key: "link", label: "Link out" },
];

// --- Admin: events ---

export async function listEvents() {
  const { data, error } = await programming
    .from("events")
    .select("*")
    .order("closes_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getEvent(eventId) {
  const { data, error } = await programming.from("events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createEvent(
  {
    title,
    body = null,
    imagePath = null,
    eventDate = null,
    closesAt,
    location = null,
    targetType = "all",
    targetGroupProgramId = null,
    responseType = "none",
    linkUrl = null,
  },
  createdBy
) {
  const trimmed = String(title || "").trim();
  if (!trimmed) throw new Error("Title is required");
  if (!closesAt) throw new Error("An end date is required — it's what hides the event when it's over");
  if (responseType === "link" && !String(linkUrl || "").trim()) {
    throw new Error("A link-out event needs a URL");
  }

  const { data, error } = await programming
    .from("events")
    .insert({
      title: trimmed,
      body: body ? String(body).trim() : null,
      image_path: imagePath,
      event_date: eventDate,
      closes_at: closesAt,
      location: location ? String(location).trim() : null,
      target_type: targetType,
      target_group_program_id: targetType === "group_program" ? targetGroupProgramId : null,
      response_type: responseType,
      link_url: responseType === "link" ? String(linkUrl).trim() : null,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Free-form patch, same shape as updateSpcClient/updateClient elsewhere in
// this codebase. Callers pass snake_case column names.
export async function updateEvent(eventId, fields) {
  const { error } = await programming
    .from("events")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) throw error;
}

export async function publishEvent(eventId) {
  await updateEvent(eventId, { status: "published", published_at: new Date().toISOString() });
}

// The emergency brake. With no master switch on the tab, this is how an
// event comes down before its closes_at — members stop seeing it at the
// database level, not just in the UI.
export async function unpublishEvent(eventId) {
  await updateEvent(eventId, { status: "draft" });
}

export async function deleteEvent(eventId) {
  const { error } = await programming.from("events").delete().eq("id", eventId);
  if (error) throw error;
}

// --- Admin: order items ---

export async function listEventItems(eventId) {
  const { data, error } = await programming
    .from("event_items")
    .select("*")
    .eq("event_id", eventId)
    .order("position");
  if (error) throw error;
  return data ?? [];
}

export async function addEventItem(eventId, { name, description = null, options = [], position = 0 }) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Item name is required");
  const { data, error } = await programming
    .from("event_items")
    .insert({ event_id: eventId, name: trimmed, description, options, position })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEventItem(itemId, fields) {
  const { error } = await programming.from("event_items").update(fields).eq("id", itemId);
  if (error) throw error;
}

export async function deleteEventItem(itemId) {
  const { error } = await programming.from("event_items").delete().eq("id", itemId);
  if (error) throw error;
}

// --- Admin: extra questions ---
// Column shape matches public.client_checkin_questions, so
// components/nutrition/QuestionListEditor.js edits these unchanged.

export async function listEventQuestions(eventId) {
  const { data, error } = await programming
    .from("event_questions")
    .select("*")
    .eq("event_id", eventId)
    .order("position");
  if (error) throw error;
  return data ?? [];
}

export async function addEventQuestion(eventId, questionText, position = 0) {
  const trimmed = String(questionText || "").trim();
  if (!trimmed) throw new Error("Question is required");
  const { data, error } = await programming
    .from("event_questions")
    .insert({ event_id: eventId, question_text: trimmed, position })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEventQuestion(questionId, fields) {
  const { error } = await programming.from("event_questions").update(fields).eq("id", questionId);
  if (error) throw error;
}

export async function deleteEventQuestion(questionId) {
  const { error } = await programming.from("event_questions").delete().eq("id", questionId);
  if (error) throw error;
}

// How many people have responded to each event, for the admin list. One
// query for the whole page rather than a count per row — admin RLS allows
// reading every response, so this is a plain client-side tally.
export async function countResponsesByEvent() {
  const { data, error } = await programming.from("event_responses").select("event_id");
  if (error) throw error;
  const counts = {};
  for (const row of data ?? []) counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  return counts;
}

// Live / draft / past, from the same two fields the member-facing RLS uses.
export function eventPhase(event, now = new Date()) {
  if (event.status !== "published") return "draft";
  return new Date(event.closes_at) > now ? "live" : "past";
}

// --- Member: what's live for me ---

export async function listLiveEventsForUser(userId) {
  // RLS already restricts this to published + not-yet-closed; the audience
  // filter is client-side, same as announcements.
  const { data, error } = await programming
    .from("events")
    .select("*")
    .eq("status", "published")
    .gt("closes_at", new Date().toISOString())
    .order("closes_at");
  if (error) throw error;
  return filterToAudience(userId, data ?? []);
}

export async function getLiveEventDetail(eventId) {
  const [event, items, questions] = await Promise.all([
    getEvent(eventId),
    listEventItems(eventId),
    listEventQuestions(eventId),
  ]);
  return { event, items, questions };
}

// --- Member: responses ---

export async function getMyResponse(eventId, userId) {
  const { data, error } = await programming
    .from("event_responses")
    .select("*")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: items, error: itemsError } = await programming
    .from("event_response_items")
    .select("*")
    .eq("response_id", data.id);
  if (itemsError) throw itemsError;
  return { ...data, lineItems: items ?? [] };
}

// Which of these events this member has already responded to — one query
// for the whole list screen rather than per-card.
export async function listMyResponses(userId, eventIds) {
  if (eventIds.length === 0) return {};
  const { data, error } = await programming
    .from("event_responses")
    .select("id, event_id, guest_count, submitted_at")
    .eq("user_id", userId)
    .in("event_id", eventIds);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.event_id, r]));
}

// Hand-rolled upsert (select-then-update-or-insert) rather than .upsert(),
// matching logResult()/finalizeGroupSession() elsewhere in this codebase —
// and here it also has to replace the line-item set, which no single upsert
// call expresses.
//
// Line items are deleted and re-inserted wholesale rather than diffed: an
// order is small (a handful of rows), and a diff would have to reason about
// the nulls-not-distinct unique constraint for options-less items.
export async function submitResponse({ eventId, userId, guestCount = null, answers = [], note = null, lineItems = [] }) {
  const existing = await programming
    .from("event_responses")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) throw existing.error;

  let responseId = existing.data?.id ?? null;

  if (responseId) {
    const { error } = await programming
      .from("event_responses")
      .update({ guest_count: guestCount, answers, note, updated_at: new Date().toISOString() })
      .eq("id", responseId);
    if (error) throw error;
  } else {
    const { data, error } = await programming
      .from("event_responses")
      .insert({ event_id: eventId, user_id: userId, guest_count: guestCount, answers, note })
      .select("id")
      .single();
    if (error) throw error;
    responseId = data.id;
  }

  const { error: clearError } = await programming.from("event_response_items").delete().eq("response_id", responseId);
  if (clearError) throw clearError;

  const rows = lineItems
    .filter((li) => Number(li.qty) > 0)
    .map((li) => ({
      response_id: responseId,
      event_item_id: li.eventItemId,
      option: li.option ?? null,
      qty: Number(li.qty),
    }));

  if (rows.length > 0) {
    const { error: insertError } = await programming.from("event_response_items").insert(rows);
    if (insertError) throw insertError;
  }

  return responseId;
}

export async function cancelResponse(eventId, userId) {
  // The line items cascade with the parent row.
  const { error } = await programming
    .from("event_responses")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) throw error;
}

// --- Admin: who responded ---

// Member names come from core.users in a separate query and are merged
// client-side — this codebase deliberately avoids cross-schema PostgREST
// embeds (see CLAUDE.md's architecture notes).
export async function listEventResponses(eventId) {
  const { data: responses, error } = await programming
    .from("event_responses")
    .select("*")
    .eq("event_id", eventId)
    .order("submitted_at");
  if (error) throw error;
  if (!responses || responses.length === 0) return [];

  const responseIds = responses.map((r) => r.id);
  const [{ data: lineItems, error: itemsError }, { data: users, error: usersError }] = await Promise.all([
    programming.from("event_response_items").select("*").in("response_id", responseIds),
    core.from("users").select("id, name, email").in("id", responses.map((r) => r.user_id)),
  ]);
  if (itemsError) throw itemsError;
  if (usersError) throw usersError;

  const usersById = Object.fromEntries((users ?? []).map((u) => [u.id, u]));
  const itemsByResponse = {};
  for (const li of lineItems ?? []) {
    (itemsByResponse[li.response_id] ||= []).push(li);
  }

  return responses.map((r) => ({
    ...r,
    member: usersById[r.user_id] ?? null,
    lineItems: itemsByResponse[r.id] ?? [],
  }));
}

// Pure — rolls every response's line items up into one row per
// item+option, which is the number a coach actually orders against
// ("12 mediums"), not the per-person list.
export function rollUpOrders(responses, items) {
  const itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
  const buckets = new Map();

  for (const response of responses) {
    for (const li of response.lineItems ?? []) {
      const key = `${li.event_item_id}::${li.option ?? ""}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.qty += li.qty;
        existing.people += 1;
      } else {
        buckets.set(key, {
          key,
          eventItemId: li.event_item_id,
          itemName: itemsById[li.event_item_id]?.name ?? "(deleted item)",
          option: li.option ?? null,
          qty: li.qty,
          people: 1,
        });
      }
    }
  }

  // Item order first (so the roll-up reads in the same order the coach
  // built the list), then option order within an item.
  const itemPosition = Object.fromEntries(items.map((i, idx) => [i.id, idx]));
  return [...buckets.values()].sort((a, b) => {
    const posDiff = (itemPosition[a.eventItemId] ?? 999) - (itemPosition[b.eventItemId] ?? 999);
    if (posDiff !== 0) return posDiff;
    return String(a.option ?? "").localeCompare(String(b.option ?? ""));
  });
}
