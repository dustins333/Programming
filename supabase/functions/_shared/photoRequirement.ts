// Server-side mirror of the photo-requirement logic in
// lib/nutrition/photos.js (isPhotoRequirementWeek, CADENCE_WEEKS) and
// lib/nutrition/weekCycle.js (computeWeekWindows, ANCHOR_DAY).
//
// Kept in sync by hand, same as this app's other client-vs-server
// duplicated-on-purpose logic (_shared/announcementAudience.ts,
// _shared/expoPush.ts) — Edge Functions are Deno and cannot import from
// lib/. If you change the cadence rule or the week anchor on either side,
// change it on both.

const ANCHOR_DAY = 0; // Sunday
const CADENCE_WEEKS: Record<string, number> = { weekly: 1, biweekly: 2, monthly: 4, bimonthly: 8 };

export type PhotoRequirementClient = {
  photo_frequency?: string | null;
  photo_frequency_started_at?: string | null;
  photo_requirement_next_checkin?: string | null;
};

function addDays(dateString: string, days: number) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayOfWeek(dateString: string) {
  return new Date(`${dateString}T12:00:00`).getDay();
}

// The Monday-Sunday week a check-in submitted "now" is about. A week only
// becomes current once it is fully over (it ends on the most recent Sunday
// on or before today) and stays current through the following Saturday.
export function computeCurrentWeek(today: string) {
  const daysSinceAnchor = (dayOfWeek(today) - ANCHOR_DAY + 7) % 7;
  const end = addDays(today, -daysSinceAnchor);
  return { start: addDays(end, -6), end };
}

function parseDate(str: string) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function isPhotoRequirementWeek(client: PhotoRequirementClient, weekStart: string) {
  if (client.photo_requirement_next_checkin === weekStart) return true;
  if (!client.photo_frequency || !client.photo_frequency_started_at) return false;
  const weeksSince = Math.floor((parseDate(weekStart).getTime() - parseDate(client.photo_frequency_started_at).getTime()) / (7 * 86400000));
  if (weeksSince < 0) return false;
  return weeksSince % CADENCE_WEEKS[client.photo_frequency] === 0;
}
