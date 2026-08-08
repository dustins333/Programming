import { getSetting, updateSetting } from "../settings";

const SETTINGS_KEY = "specialty_bars";

// Gym-wide list of named specialty bars (trap bar, safety squat bar, etc.)
// and their real weight — one jsonb array under core.settings, same
// generic key/value pattern every other admin-configurable app-wide list in
// this app already uses (no new table/migration needed). Coach-managed
// (Settings → Equipment), read by the member-facing weight calculator's
// Specialty picker so nobody has to remember "the safety squat bar is
// 65 lb" from memory. Each entry is a plain { name, weight } object.
export async function listSpecialtyBars() {
  return getSetting(SETTINGS_KEY, []);
}

export async function saveSpecialtyBars(bars) {
  await updateSetting(SETTINGS_KEY, bars);
}
