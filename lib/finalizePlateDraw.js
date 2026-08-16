import AsyncStorage from "@react-native-async-storage/async-storage";

// Draw bookkeeping for the finalize plate (design_handoff_member_finalize_v1)
// — device-local only, same reasoning as lib/messageBubblePref.js and
// friends: which of two visually-equal random faces/sublines shows next is a
// cosmetic display preference, not data worth a migration or syncing across
// devices.
const KEY = "kova_finalize_plate_draws";

// A member finalizes a handful of times a week — this is generous headroom
// (a year-plus of sessions) while still bounding the stored object. A plain
// reset rather than real LRU eviction: losing the "don't repeat this exact
// session's face" guarantee once a year of history has piled up costs
// nothing worth the extra code.
const MAX_SESSION_DRAWS = 300;

// Only the two "in the pool" faces randomize — olive and ink are forced by
// facts (closing the week / holding a best), never drawn.
export const RANDOM_FACES = ["cream", "clay"];
export const SUBLINE_POOL = ["Session done.", "In the book.", "Banked.", "Work's in.", "Another one down.", "Signed off."];

async function readState() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { lastFace: null, lastSubline: null, bySession: {} };
    const parsed = JSON.parse(raw);
    return {
      lastFace: parsed.lastFace ?? null,
      lastSubline: parsed.lastSubline ?? null,
      bySession: parsed.bySession ?? {},
    };
  } catch {
    return { lastFace: null, lastSubline: null, bySession: {} };
  }
}

async function writeState(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Failed to persist finalize plate draw:", err);
  }
}

function pickDifferent(pool, last) {
  const options = pool.filter((v) => v !== last);
  const choices = options.length ? options : pool; // a pool of 1 can't avoid a repeat
  return choices[Math.floor(Math.random() * choices.length)];
}

// Rules of the draw (README): mid-week draws cream or clay, never the face
// drawn last time; subline draws from the six, never the one drawn last
// time. Re-finalizing the SAME session (un-finalize, then finalize again)
// must reuse whatever was drawn for it rather than rolling again, so it's
// looked up by sessionKey first — a stored draw always wins, and only a
// session with no stored draw yet rolls the dice and updates the "last
// drawn" trackers.
//
// Only call this for the mid-week, non-forced case — olive (week closer) and
// ink (a best) are deterministic and resolved by the caller without ever
// touching storage.
export async function drawFinalizeFace(sessionKey) {
  const state = await readState();
  const stored = state.bySession[sessionKey];
  if (stored) return stored;

  const face = pickDifferent(RANDOM_FACES, state.lastFace);
  const subline = pickDifferent(SUBLINE_POOL, state.lastSubline);
  const draw = { face, subline };

  let bySession = { ...state.bySession, [sessionKey]: draw };
  if (Object.keys(bySession).length > MAX_SESSION_DRAWS) bySession = { [sessionKey]: draw };
  await writeState({ lastFace: face, lastSubline: subline, bySession });
  return draw;
}
