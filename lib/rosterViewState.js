import { useEffect, useRef } from "react";

// Remembers where a coach was on a roster screen while they drill into a
// client and come back.
//
// The problem this solves: on web, pushing /spc/<userId> unmounts the roster,
// so every piece of view state a coach had set up — the coach filter, a status
// chip, a search, how far down the list they'd scrolled — is thrown away and
// rebuilt from defaults on the way back. Both rosters already guarded the
// coach filter against the refocus reload with a ref, but a ref lives on the
// component instance, so it can't survive the instance being destroyed.
//
// Deliberately an in-memory Map, NOT AsyncStorage:
//
//  - It has to be readable synchronously during the first render. A filter
//    restored one tick later paints the wrong list first and then jumps, and
//    an async read can't seed useState at all.
//  - It should die on reload. A reload is a fresh start, and a fresh start is
//    exactly when the "opens filtered to you" default is the right behaviour
//    (see defaultCoachFilter). Persisting a filter across reloads would mean a
//    coach could be looking at someone else's roster days later with nothing
//    but a small token to explain why.
//
// So this is session memory, not storage. Nothing in here is data — losing all
// of it costs a coach one tap.
//
// State is a plain patch-merged object per key; callers decide what they keep.
// Keyed rather than one-screen-specific so the other rosters can adopt it
// without a second copy of the same idea drifting away from this one.

const views = new Map();

export const SPC_ROSTER_VIEW = "spc-roster";
export const CLIENTS_ROSTER_VIEW = "clients-roster";

// Whatever was last saved for this screen, or null on the first visit of the
// session. Callers must treat null as "use your defaults".
export function readRosterView(key) {
  return views.get(key) ?? null;
}

// Merges a partial update over what's there. Called from onScroll as well as
// from the filter setters, so it stays a plain Map write with no React work.
export function saveRosterView(key, patch) {
  views.set(key, { ...(views.get(key) ?? {}), ...patch });
}

// Sign-out. A coach filter naming a specific coach isn't sensitive (any staff
// member can see the whole roster anyway), but the next person to use the
// device should get their own defaults rather than inherit someone's view.
export function clearRosterViews() {
  views.clear();
}

// Props to spread onto a roster's ScrollView so it comes back where the coach
// left it. `enabled` is false when the screen was opened by a link that means
// something specific (a dashboard ?status= deep link) — that should land at the
// top of its own filtered list, not halfway down the last one.
//
// Restoring is deliberately driven by onContentSizeChange rather than an effect
// on mount: the rows aren't laid out yet when the ScrollView first mounts, so a
// scrollTo there clamps to whatever height exists at that instant and the coach
// lands somewhere arbitrary. Waiting until the content is at least as tall as
// the saved offset is what makes the position land exactly.
export function useRosterScrollRestore(key, { enabled = true } = {}) {
  const scrollRef = useRef(null);
  const pendingRef = useRef(null);
  const initialisedRef = useRef(false);
  if (!initialisedRef.current) {
    initialisedRef.current = true;
    pendingRef.current = enabled ? readRosterView(key)?.scrollY ?? null : null;
  }

  useEffect(() => {
    // A deep link starts this screen at the top, so a remembered offset from
    // an earlier visit must not be waiting to be restored on the next one.
    if (!enabled) saveRosterView(key, { scrollY: 0 });
    // Mount only: `enabled` is decided at mount and never meaningfully changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onContentSizeChange = (_width, height) => {
    const y = pendingRef.current;
    if (y == null || y <= 0) return;
    // Not tall enough yet — a later layout pass will bring the rest of the
    // rows. If the list has genuinely shrunk below the old offset we simply
    // never restore, which is the right answer: there's nowhere to go.
    if (height < y) return;
    pendingRef.current = null;
    scrollRef.current?.scrollTo({ y, animated: false });
  };

  const onScroll = (e) => {
    // Anything arriving while a restore is still pending is the coach scrolling
    // for themselves — the restore above clears the flag before it scrolls — so
    // stop trying to move them.
    if (pendingRef.current != null) pendingRef.current = null;
    saveRosterView(key, { scrollY: e?.nativeEvent?.contentOffset?.y ?? 0 });
  };

  return { ref: scrollRef, onScroll, onContentSizeChange, scrollEventThrottle: 16 };
}
