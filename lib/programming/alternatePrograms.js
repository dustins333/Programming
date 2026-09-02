import { programming } from "../supabase/client";
import { listTemplateWarmups, listTemplateExercises } from "./templates";
import { todayInBoise, addDays, daysBetween } from "../boiseDate";

// "Alternate programming" is the second way to assign a template
// (migration 0110). The first, one-offs (0008), assigns a single session
// with no date that stays open until it's finished. This one assigns 1-3
// sessions that repeat for a run of calendar weeks starting on a chosen
// Monday — travel programming, mostly, but nothing here is named "away":
// the coach types the name the member sees, so one run can read "Italy
// trip" and another "Welcome block".
//
// Shape note: ONE alternate_sessions row per session for the whole run, not
// one per (session, week). A week is a repeat. That's the same model SPC's
// sessions format uses since 0105, which is why completions carry a
// week_number here and one-off completions don't.

// ---------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------

// The last day covered, honouring an early end. Everything that asks "is
// this live" goes through here so the app and the RLS policy can't drift on
// what the end of a run means.
export function programEndDate(program) {
  const scheduledEnd = addDays(program.start_date, program.weeks * 7 - 1);
  if (program.ended_at && program.ended_at < scheduledEnd) return program.ended_at;
  return scheduledEnd;
}

export function isProgramLive(program, today = todayInBoise()) {
  return program.start_date <= today && today <= programEndDate(program);
}

// 1-based, and clamped: a run that has been ended early still reports the
// week it was in on its last day rather than running off the end.
export function programWeekNumber(program, today = todayInBoise()) {
  const offset = daysBetween(today, program.start_date);
  if (offset < 0) return 1;
  return Math.min(program.weeks, Math.floor(offset / 7) + 1);
}

// How many weeks a run actually covers once an early end is taken into
// account — what "Week 2 of 3" should say after a coach cut it short.
export function programWeekCount(program) {
  const end = programEndDate(program);
  // Clamped at 1: a run ended on its own first day has an effective end
  // BEFORE its start (see endAlternateProgram), which would otherwise
  // report zero or negative weeks.
  return Math.max(1, Math.min(program.weeks, Math.floor(daysBetween(end, program.start_date) / 7) + 1));
}

// ---------------------------------------------------------------------
// Coach: assigning, listing, ending
// ---------------------------------------------------------------------

export async function listAlternateProgramsForUser(userId) {
  const { data, error } = await programming
    .from("alternate_programs")
    .select("*, alternate_sessions(id, title, position)")
    .eq("user_id", userId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}

// Two runs for one client must not overlap, or a member's My Week would
// have to pick between two tiles claiming the same week. Same guard, same
// reasoning, as createSpcBlock's own overlap check — and like that one it
// lives in the write function rather than only in the dialog, so every
// caller is covered.
async function assertNoOverlap(userId, startDate, weeks, exceptId) {
  const newEnd = addDays(startDate, weeks * 7 - 1);
  const existing = await listAlternateProgramsForUser(userId);
  const clash = existing.find((p) => {
    if (exceptId && p.id === exceptId) return false;
    return startDate <= programEndDate(p) && p.start_date <= newEnd;
  });
  if (clash) {
    throw new Error(
      `"${clash.name}" already covers ${clash.start_date} to ${programEndDate(clash)}. End it first, or pick different weeks.`
    );
  }
}

// Copies each chosen template's content onto its own session row, exactly
// the way createOneOffFromTemplate does: titles and content are snapshotted
// at assign time so renaming or deleting a template later can't change what
// a client is already looking at.
export async function assignAlternateProgram({
  userId,
  name,
  startDate,
  weeks,
  pauseMissedFlags = true,
  templates,
  assignedBy,
}) {
  if (!templates?.length) throw new Error("Pick at least one session.");
  await assertNoOverlap(userId, startDate, weeks);

  const { data: program, error } = await programming
    .from("alternate_programs")
    .insert({
      user_id: userId,
      name,
      start_date: startDate,
      weeks,
      pause_missed_flags: pauseMissedFlags,
      created_by: assignedBy ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  for (const [position, template] of templates.entries()) {
    const { data: session, error: sessionError } = await programming
      .from("alternate_sessions")
      .insert({
        alternate_program_id: program.id,
        source_template_id: template.id,
        title: template.name,
        position,
      })
      .select()
      .single();
    if (sessionError) throw sessionError;

    const [warmups, exercises] = await Promise.all([
      listTemplateWarmups(template.id),
      listTemplateExercises(template.id),
    ]);

    if (warmups.length) {
      const { error: warmupError } = await programming.from("alternate_warmups").insert(
        warmups.map((w) => ({
          alternate_session_id: session.id,
          exercise_id: w.exercise_id,
          position: w.position,
          label: w.label,
          superset_group_id: w.superset_group_id,
        }))
      );
      if (warmupError) throw warmupError;
    }

    if (exercises.length) {
      const { error: exerciseError } = await programming.from("alternate_exercises").insert(
        exercises.map((ex) => ({
          alternate_session_id: session.id,
          exercise_id: ex.exercise_id,
          position: ex.position,
          sets: ex.sets,
          reps: ex.reps,
          rep_scheme: ex.rep_scheme,
          superset_group_id: ex.superset_group_id,
          rest: ex.rest,
          notes: ex.notes,
        }))
      );
      if (exerciseError) throw exerciseError;
    }
  }

  return program;
}

// Early return from a trip. Writes an end date rather than deleting or
// rewriting weeks, so what was originally assigned stays readable, and the
// member loses the tile immediately (RLS reads the same coalesce).
//
// It writes YESTERDAY, not today. `ended_at` is the last day the run
// COVERS, so ending it with today's date left it live for the rest of
// today — the button looked completely inert, because the card still said
// "End now" and the member still had the tile. Reported as "the end now
// button doesn't seem to work"; it worked, it just meant "ends tonight".
export async function endAlternateProgram(id, today = todayInBoise()) {
  const { error } = await programming
    .from("alternate_programs")
    .update({ ended_at: addDays(today, -1) })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAlternateProgram(id) {
  const { error } = await programming.from("alternate_programs").delete().eq("id", id);
  if (error) throw error;
}

export async function renameAlternateProgram(id, name) {
  const { error } = await programming.from("alternate_programs").update({ name }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Member
// ---------------------------------------------------------------------

// The run covering today, if any. RLS already restricts this to live runs
// for the caller, but the date filter is repeated here so a coach reading
// on a member's behalf gets the same answer.
export async function getLiveAlternateProgramForUser(userId, today = todayInBoise()) {
  const { data, error } = await programming
    .from("alternate_programs")
    .select("*")
    .eq("user_id", userId)
    .lte("start_date", today)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data.find((p) => isProgramLive(p, today)) ?? null;
}

export async function listAlternateSessions(programId) {
  const { data, error } = await programming
    .from("alternate_sessions")
    .select("*")
    .eq("alternate_program_id", programId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function listAlternateWarmups(sessionId) {
  const { data, error } = await programming
    .from("alternate_warmups")
    .select("*, exercises(id, name)")
    .eq("alternate_session_id", sessionId)
    .order("position");
  if (error) throw error;
  return data;
}

export async function listAlternateExercises(sessionId) {
  const { data, error } = await programming
    .from("alternate_exercises")
    .select("*, exercises(id, name, muscle_group, movement_pattern, video_url, cues, tracks_weight, rep_unit)")
    .eq("alternate_session_id", sessionId)
    .order("position");
  if (error) throw error;
  return data;
}
