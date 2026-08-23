import AsyncStorage from "@react-native-async-storage/async-storage";

// Paint-last-known-state-instantly cache for screens that fan out into many
// independent queries.
//
// Why this exists: a member screen like My Week fires ~15 round trips before
// it can render, and useFocusEffect re-runs the whole thing on every tab
// switch — so flipping to My Nutrition and back cost the same as a cold load.
// Measured 2026-08-23: ~124ms per Supabase round trip from Boise (the project
// lives in us-east-2), so that fan-out is on the order of two seconds of pure
// waiting, every time. Caching the *derived* section results and painting them
// immediately turns a revisit into "content is already there, and it quietly
// corrects itself a moment later".
//
// Three rules this module exists to enforce:
//
// 1. A cache must never be able to break a screen. Every read and write here
//    swallows its own errors and degrades to "no cache" — a corrupted entry,
//    a full localStorage quota, or a storage backend that's simply missing
//    must all behave exactly like a cold start, never like a crash.
// 2. Cached JSON outlives the code that wrote it. A member can have a
//    fortnight-old entry in storage when a new build lands, so VERSION below
//    MUST be bumped whenever any cached payload's shape changes, or new code
//    will hydrate its state from a shape it no longer understands. That is
//    the single most dangerous failure mode of this file.
// 3. Entries are scoped, not global. The key carries the user id (so a shared
//    device or a coach's dual-login can never paint someone else's data) and a
//    caller-supplied scope string (so a date-bounded screen can't paint
//    yesterday's week today).
//
// Staleness is bounded twice over: `scope` usually already pins an entry to a
// single day, and MAX_AGE_MS is a hard backstop for anything longer-lived.

const PREFIX = "kova:screencache";

// Screen names live here rather than as string literals at each call site, so
// a screen and anything that has to invalidate it can't drift apart.
export const SCREEN_MY_WEEK = "myweek";

// BUMP THIS whenever the shape of ANY cached payload changes. See rule 2.
const VERSION = 1;

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function entryKey(screen, userId, scope, section) {
  return `${PREFIX}:v${VERSION}:${screen}:${userId}:${scope}:${section}`;
}

// Reads several sections in one storage round trip. Returns a plain object of
// section -> value, containing only the sections that were present, unexpired
// and parseable; a caller hydrates whatever it finds and leaves the rest to
// the network. Never rejects.
export async function readSections(screen, userId, scope, sections) {
  if (!userId || !sections?.length) return {};
  try {
    // Mapped back by the returned key rather than by array position:
    // multiGet documents order-preservation, but nothing here needs to depend
    // on it, and if it ever didn't hold, values would be silently assigned to
    // the wrong sections — a bug that would look like corrupted data, not a
    // cache bug.
    const sectionByKey = new Map(sections.map((s) => [entryKey(screen, userId, scope, s), s]));
    const pairs = await AsyncStorage.multiGet([...sectionByKey.keys()]);
    const now = Date.now();
    const out = {};
    pairs.forEach(([key, raw]) => {
      const section = sectionByKey.get(key);
      if (!section || !raw) return;
      try {
        const parsed = JSON.parse(raw);
        // savedAt is written by writeSection below; an entry without one came
        // from somewhere unexpected and is not trusted.
        if (typeof parsed?.savedAt !== "number") return;
        if (now - parsed.savedAt > MAX_AGE_MS) return;
        out[section] = parsed.value;
      } catch {
        // Unparseable entry — treat as absent. Deliberately not deleted here:
        // a read shouldn't mutate, and the next successful write overwrites it.
      }
    });
    void pruneDeadEntries(screen, userId);
    return out;
  } catch {
    return {};
  }
}

// Removes entries for this screen/user that can never be read again: past
// MAX_AGE_MS, unparseable, or written by an older VERSION.
//
// Without this the store grows forever: scope is usually a date, so every day
// writes a fresh set of keys and the previous day's become unreadable but
// never actually go away. Over months that is thousands of dead entries, and
// Android's AsyncStorage has a hard total-size cap — writes would start
// failing and the cache would quietly stop working with no visible symptom.
//
// Deliberately keyed on age rather than "any scope other than the current
// one", which is the tempting shortcut and is wrong: a screen that reads two
// scopes (this week and last week, say) would have each read delete the
// other's entry, so the cache would never hit and nothing would say why.
// Age is true regardless of how a caller uses scope. Steady state is one set
// of live entries plus at most one expiring set.
//
// Called fire-and-forget from readSections: once per screen load, never on
// the path to a render.
async function pruneDeadEntries(screen, userId) {
  try {
    const mine = `:${screen}:${userId}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(`${PREFIX}:`) && k.includes(mine));
    if (!keys.length) return;
    const now = Date.now();
    const dead = [];
    for (const [key, raw] of await AsyncStorage.multiGet(keys)) {
      if (!key.startsWith(`${PREFIX}:v${VERSION}:`)) { dead.push(key); continue; } // older shape, unreadable
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.savedAt !== "number" || now - parsed.savedAt > MAX_AGE_MS) dead.push(key);
      } catch {
        dead.push(key);
      }
    }
    if (dead.length) await AsyncStorage.multiRemove(dead);
  } catch {
    // Best-effort housekeeping; never worth surfacing.
  }
}

// Fire-and-forget. Callers should NOT await this in a load path — a cache
// write is never worth delaying a render for. Returns a promise only so a
// test can await it; it can never reject.
export async function writeSection(screen, userId, scope, section, value) {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(
      entryKey(screen, userId, scope, section),
      JSON.stringify({ savedAt: Date.now(), value })
    );
  } catch {
    // Quota exceeded, storage unavailable, value not serializable — all fine,
    // the screen just loads from the network next time like it always did.
  }
}

// Drops every cached entry for one screen/user, whatever its scope. For a
// mutation made somewhere else that this screen reflects — finalizing a
// workout on My Fitness, say — so the next visit can't paint a remembered
// "not done yet" over something the member just finished. Fire-and-forget;
// worst case it doesn't run and the screen self-corrects a moment later.
export async function clearScreen(screen, userId) {
  if (!userId) return;
  try {
    const mine = `:${screen}:${userId}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(`${PREFIX}:`) && k.includes(mine));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Best-effort.
  }
}

// Drops every cached entry for every screen and every user. Called on sign-out:
// cached member data must not survive into the next person to use the device,
// and this runs regardless of which user id is being signed out because the
// signed-out session is exactly when we may no longer be able to resolve one.
export async function clearAllScreenCaches() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(`${PREFIX}:`));
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // Nothing to do — worst case a stale entry lingers, and its key carries a
    // user id, so it can never be painted for a different account anyway.
  }
}
