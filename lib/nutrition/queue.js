import { supabase } from "../supabase/client";
import { todayInBoise, addDays, daysBetween } from "../boiseDate";
import { computeWeekWindows, summarizeWeek } from "./weekCycle";
import { getCurrentTarget } from "./targets";
import { getPhotoSignedUrls, photosForRequirementWeek } from "./photos";

const ANGLES = ["front", "side", "back"];

// The Nutrition queue's right-hand preview: everything needed to decide
// whether a check-in is ready to action, without opening the client record
// (coach web v2, screen 17).
//
// Scoped to ONE client — the one currently selected in the left rail — and
// deliberately not folded into getNutritionRoster. That function already
// fetches logs for every client on the roster to compute the status tiles;
// pulling a full week of macros, a target, and photo URLs for all ~31 of
// them so that one preview can render would be a large query to throw away
// 30/31 of.
//
// The week shown is the CHECK-IN week (computeWeekWindows' currentWeek, the
// most recent fully-elapsed Mon-Sun), not the calendar week today falls in.
// A queue is a list of check-ins waiting to be read, so the days on screen
// have to be the days the check-in is actually about.
export async function getQueuePreview(userId, today = todayInBoise()) {
  const { currentWeek } = computeWeekWindows(today);
  const priorWeek = { start: addDays(currentWeek.start, -7), end: addDays(currentWeek.end, -7) };

  const [{ data: logs, error: logsError }, { data: checkin, error: checkinError }, target, { data: photos, error: photosError }] =
    await Promise.all([
      supabase
        .from("daily_logs")
        .select("*")
        .eq("client_id", userId)
        .gte("date", priorWeek.start)
        .lte("date", currentWeek.end)
        .order("date"),
      supabase.from("checkin_responses").select("*").eq("client_id", userId).eq("week_start", currentWeek.start).maybeSingle(),
      getCurrentTarget(userId, currentWeek.end),
      // Bounded to the check-in window rather than the client's whole photo
      // history — a weekly client passes 150 rows inside a year and the
      // preview only ever shows this week's set.
      supabase
        .from("photos")
        .select("*")
        .eq("client_id", userId)
        .gte("date", currentWeek.start)
        .lte("date", addDays(currentWeek.end, 6)),
    ]);
  if (logsError) throw logsError;
  if (checkinError) throw checkinError;
  if (photosError) throw photosError;

  const week = summarizeWeek(logs ?? [], currentWeek.start, currentWeek.end);
  const prior = summarizeWeek(logs ?? [], priorWeek.start, priorWeek.end);

  // The week's photos, keyed by angle so the preview can render a real
  // "back missing" placeholder rather than three silent gaps. Latest wins
  // when a client re-shot an angle inside the same window.
  const weekPhotos = photosForRequirementWeek(photos ?? [], currentWeek);
  const photoByAngle = {};
  for (const photo of weekPhotos.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) {
    photoByAngle[photo.angle] = photo;
  }
  const present = ANGLES.filter((angle) => photoByAngle[angle]);
  let photoUrls = {};
  if (present.length > 0) {
    // At most three signed URLs, and only for the client actually selected.
    try {
      photoUrls = await getPhotoSignedUrls(present.map((angle) => photoByAngle[angle].storage_path));
    } catch {
      // A signing failure costs the thumbnails, not the whole preview — the
      // numbers next to them are the point of this pane.
      photoUrls = {};
    }
  }

  return {
    week: currentWeek,
    priorWeek,
    summary: week,
    priorSummary: prior,
    target,
    checkin,
    daysLogged: week.days.length,
    photos: ANGLES.map((angle) => ({
      angle,
      photo: photoByAngle[angle] ?? null,
      url: photoByAngle[angle] ? photoUrls[photoByAngle[angle].storage_path] ?? null : null,
    })),
    missingAngles: ANGLES.filter((angle) => !photoByAngle[angle]),
  };
}

// "Week 11" — how far into the programme this client is, counted from their
// own start_date. Weeks are 1-based (their first week is week 1, not week
// 0); a start date in the future clamps to 1 rather than reading as week -2.
export function weekOnProgramme(startDate, date = todayInBoise()) {
  if (!startDate) return null;
  // daysBetween is a - b, so today's date goes first.
  const days = daysBetween(date, startDate);
  if (days < 0) return 1;
  return Math.floor(days / 7) + 1;
}

// The seven Mon-Sun dates of a week, so a table can render a column for a
// day the client never logged instead of silently dropping it.
export function weekDates(week) {
  return Array.from({ length: 7 }, (_, i) => addDays(week.start, i));
}
