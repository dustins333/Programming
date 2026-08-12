import { programming, core } from "../supabase/client";
import { todayInBoise, formatDateTimeInBoise } from "../boiseDate";

// "PICK UP WHERE YOU LEFT OFF" — the first thing on the coach-web
// launchpad (design_handoff_coach_web_v2, 1a/2a/2b).
//
// The premise of the whole redesign is that a coach programs in gaps
// between clients, so the dashboard's job is to put them back inside
// whatever they were last in rather than to report counts at them. That
// needs a per-coach signal, which is what migration 0052's
// last_edited_by/updated_at triggers provide.
//
// Deliberately NOT filtered to drafts. A published session stays editable
// in this app, and "I was in Week 3 Session 2 ten minutes ago" is true
// whether or not it happens to be published — filtering to drafts would
// silently drop a coach back to an empty state the moment they hit
// Publish, which is the exact opposite of resuming.

// "Tuesday, 4:12pm" for something inside the last week, an explicit date
// beyond that. Relative-only would read as a lie on a session last touched
// three weeks ago ("Tuesday" — which Tuesday?).
function describeEditTime(isoString, today = todayInBoise()) {
  if (!isoString) return null;
  const stamp = formatDateTimeInBoise(isoString); // MM/DD HH:MM AM/PM
  const [datePart, ...timeParts] = stamp.split(" ");
  // "04:12 PM" -> "4:12pm"
  const time = timeParts.join(" ").toLowerCase().replace(" ", "").replace(/^0/, "");
  const [month, day] = datePart.split("/").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);

  const editedDate = new Date(Date.UTC(ty, month - 1, day));
  const todayDate = new Date(Date.UTC(ty, tm - 1, td));
  const daysAgo = Math.round((todayDate - editedDate) / 86400000);

  if (daysAgo === 0) return `today, ${time}`;
  if (daysAgo === 1) return `yesterday, ${time}`;
  if (daysAgo > 1 && daysAgo < 7) {
    const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][editedDate.getUTCDay()];
    return `${weekday}, ${time}`;
  }
  return `${datePart}`;
}

function liftCountLine(count, title) {
  const lifts = count === 0 ? "Nothing in it yet" : `${count} lift${count === 1 ? "" : "s"} in`;
  return title ? lifts : `${lifts}, no title yet`;
}

// Most recent group session this coach touched, with the block it belongs
// to (needed for the unbuilt queue beside it).
async function latestGroupEdit(coachId) {
  const { data, error } = await programming
    .from("group_workouts")
    .select(
      `id, week_number, session_number, title, status, updated_at, block_id,
       group_blocks ( id, block_start_date, block_end_date, group_programs ( id, name ) )`
    )
    .eq("last_edited_by", coachId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function latestSpcEdit(coachId) {
  const { data, error } = await programming
    .from("spc_workouts")
    .select(
      `id, week_number, session_number, title, status, updated_at, spc_block_id,
       spc_blocks ( id, spc_client_id, block_start_date, block_end_date )`
    )
    .eq("last_edited_by", coachId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function countExercises(table, foreignKey, ids) {
  if (!ids.length) return {};
  const { data, error } = await programming.from(table).select(`${foreignKey}`).in(foreignKey, ids);
  if (error) throw error;
  const counts = {};
  for (const row of data) counts[row[foreignKey]] = (counts[row[foreignKey]] ?? 0) + 1;
  return counts;
}

// Every other session in the same block that still isn't finished — the
// right-hand column of the resume card. "Unbuilt" is deliberately about
// content, not status: a published session with no lifts in it is the
// thing that actually hurts a member, and a draft with eight lifts in it
// is nearly done. Ordered by week then session so it reads as a queue.
async function unbuiltGroupSessions(blockId, excludeWorkoutId) {
  const { data, error } = await programming
    .from("group_workouts")
    .select("id, week_number, session_number, status")
    .eq("block_id", blockId)
    .order("week_number")
    .order("session_number");
  if (error) throw error;

  const counts = await countExercises("group_workout_exercises", "group_workout_id", data.map((w) => w.id));
  return data
    .filter((w) => w.id !== excludeWorkoutId)
    .map((w) => ({ ...w, liftCount: counts[w.id] ?? 0 }))
    .filter((w) => w.liftCount === 0 || w.status !== "published")
    .map((w) => ({
      key: w.id,
      label: `Week ${w.week_number} · Session ${w.session_number}`,
      detail: w.liftCount === 0 ? "empty" : `${w.liftCount} lift${w.liftCount === 1 ? "" : "s"}`,
      route: `/(coach)/builder/${w.id}`,
    }));
}

async function unbuiltSpcSessions(blockId, excludeWorkoutId, clientName) {
  const { data, error } = await programming
    .from("spc_workouts")
    .select("id, week_number, session_number, status")
    .eq("spc_block_id", blockId)
    .order("week_number")
    .order("session_number");
  if (error) throw error;

  const counts = await countExercises("spc_workout_exercises", "spc_workout_id", data.map((w) => w.id));
  return data
    .filter((w) => w.id !== excludeWorkoutId)
    .map((w) => ({ ...w, liftCount: counts[w.id] ?? 0 }))
    .filter((w) => w.liftCount === 0 || w.status !== "published")
    .map((w) => ({
      key: w.id,
      label: `${clientName} · wk ${w.week_number}${w.session_number > 1 ? ` · S${w.session_number}` : ""}`,
      detail: w.liftCount === 0 ? "empty" : `${w.liftCount} lift${w.liftCount === 1 ? "" : "s"}`,
      route: `/(coach)/spc/builder/${w.id}`,
    }));
}

// The one nutrition-shaped resume: a coach who never programs still has a
// "where was I", it's just the check-in queue instead of a block (2b).
// Deliberately does NOT claim a half-written reply the way the mock's copy
// does — nothing in this app stores a draft response, and inventing that
// line would be the screen telling the coach something untrue.
function nutritionResume(readyClients) {
  if (!readyClients.length) return null;
  const [first, ...rest] = readyClients;
  const waited = first.daysWaiting;
  return {
    kind: "nutrition_checkin",
    title: `${first.name}'s check-in`,
    detail:
      waited != null
        ? `Waiting ${waited} day${waited === 1 ? "" : "s"}. ${rest.length} more behind it.`
        : `${rest.length} more behind it.`,
    primary: { label: "Start reviewing", route: `/(coach)/nutrition/clients/${first.userId}` },
    secondary: null,
    queueTitle: "QUEUE BEHIND IT",
    queue: rest.slice(0, 3).map((c) => ({
      key: c.userId,
      label: c.name,
      detail: c.daysWaiting != null ? `${c.daysWaiting} day${c.daysWaiting === 1 ? "" : "s"}` : "waiting",
      route: `/(coach)/nutrition/clients/${c.userId}`,
    })),
    queueAction: rest.length ? { label: `Review all ${readyClients.length} back to back →`, route: "/(coach)/nutrition" } : null,
  };
}

// `nutritionQueue` is passed in rather than fetched here so the dashboard's
// one nutrition round-trip (getNutritionRoster) isn't duplicated — this
// module owns "where was I", not "who needs what".
export async function getResumeTarget(coachId, { nutritionQueue = [] } = {}) {
  if (!coachId) return null;

  const [group, spc] = await Promise.all([latestGroupEdit(coachId), latestSpcEdit(coachId)]);

  // Whichever was touched most recently wins — a coach who programs both
  // group and SPC should land back in the last thing they touched, not in
  // whichever module we happened to check first.
  const newest =
    group && spc ? (group.updated_at >= spc.updated_at ? "group" : "spc") : group ? "group" : spc ? "spc" : null;

  if (newest === "group") {
    const programName = group.group_blocks?.group_programs?.name ?? "Group program";
    const counts = await countExercises("group_workout_exercises", "group_workout_id", [group.id]);
    const liftCount = counts[group.id] ?? 0;
    const edited = describeEditTime(group.updated_at);
    return {
      kind: "group",
      title: `${programName} | Week ${group.week_number}, Session ${group.session_number}`,
      detail: `${liftCountLine(liftCount, group.title)}.${edited ? ` Last edit ${edited}.` : ""}`,
      primary: { label: "Continue building", route: `/(coach)/builder/${group.id}` },
      secondary: { label: "Preview as member", previewWorkoutId: group.id, previewKind: "group" },
      queueTitle: "STILL UNBUILT IN THIS BLOCK",
      queue: (await unbuiltGroupSessions(group.block_id, group.id)).slice(0, 3),
      queueAction: {
        label: "Open the block →",
        route: `/(coach)/blocks?program=${group.group_blocks?.group_programs?.id ?? ""}`,
      },
    };
  }

  if (newest === "spc") {
    const clientId = spc.spc_blocks?.spc_client_id;
    let clientName = "SPC client";
    if (clientId) {
      const { data } = await core.from("users").select("name").eq("id", clientId).maybeSingle();
      if (data?.name) clientName = data.name;
    }
    const counts = await countExercises("spc_workout_exercises", "spc_workout_id", [spc.id]);
    const liftCount = counts[spc.id] ?? 0;
    const edited = describeEditTime(spc.updated_at);
    return {
      kind: "spc",
      title: `${clientName} | Week ${spc.week_number}, Session ${spc.session_number}`,
      detail: `${liftCountLine(liftCount, spc.title)}.${edited ? ` Last edit ${edited}.` : ""}`,
      primary: { label: "Continue building", route: `/(coach)/spc/builder/${spc.id}` },
      secondary: { label: "Preview as member", previewWorkoutId: spc.id, previewKind: "spc" },
      queueTitle: "STILL UNBUILT, THIS BLOCK",
      queue: (await unbuiltSpcSessions(spc.spc_block_id, spc.id, clientName)).slice(0, 3),
      queueAction: clientId ? { label: "Open the block →", route: `/(coach)/spc/${clientId}` } : null,
    };
  }

  return nutritionResume(nutritionQueue);
}
