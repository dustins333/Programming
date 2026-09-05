import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import {
  listGroupExerciseCompletionsForItems,
  listSpcExerciseCompletionsForItems,
  listOneOffExerciseCompletionsForItems,
  markGroupExerciseComplete,
  markSpcExerciseComplete,
  markOneOffExerciseComplete,
  unmarkGroupExerciseComplete,
  unmarkSpcExerciseComplete,
  unmarkOneOffExerciseComplete,
  listAlternateExerciseCompletionsForItems,
  markAlternateExerciseComplete,
  unmarkAlternateExerciseComplete,
} from "../lib/programming/exerciseCompletions";
import { PressFade } from "./PressFade";
import { fonts, colors, type } from "../lib/theme";
import { toastError } from "../lib/toast";
import { ExerciseCard } from "./ExerciseCard";
import { addCoachingNote, listSessionExerciseNotes } from "../lib/programming/coachingNotes";
import { useAuth } from "../lib/auth/AuthProvider";

// The member's session-logging surface (design_handoff_member_lift_v1).
//
// This used to be two very different things: an "accordion" stack and a
// "focus" index-plus-full-screen-overlay. The overlay is gone — looking
// ahead at the rest of the session meant leaving your logging spot, which is
// the opposite of what a session page is for. Everything is now one
// scrolling page of lift cards.
//
// Two layouts remain, and they differ only in how expansion starts:
//  - "session": every lift opens expanded when the page loads, and a lift
//    collapses only when its checkbox is manually ticked (to one "Logged
//    3 × 8 @ 185" line). Per-exercise completion is live here.
//  - "accordion" (default): everything starts closed, single-open. Used by
//    the read-only/late-entry session viewer in My History, where the point
//    is reviewing a past session rather than working through one — and where
//    onExpandExercise locks the "when did you do this?" date on first open,
//    which an all-expanded default would fire immediately.
//
// One Finalize button for the whole session either way, inline at the end of
// the list — never docked over the content (the handoff is explicit: you
// should scroll past the last lift to reach it).
export function SessionLogger({
  userId,
  datePerformed,
  source,
  exercises: allExercises,
  isCompleted,
  onFinalize,
  hideFinalizeButton,
  hideVideo,
  onExpandExercise,
  layout = "accordion",
  exerciseCompletionType,
  weekNumber,
  // Which session's logs these are — {groupWorkoutId} | {spcWorkoutId,
  // weekNumber} | {oneOffWorkoutId} | {alternateSessionId}, mirroring
  // session_completions. Threaded
  // straight to ExerciseCard, which writes it onto every set (0063).
  session,
  restReturnTo,
  scrollViewRef,
  scrollOffsetRef,
  onDataChanged,
}) {
  // Drop any row whose exercises join came back null — an archived or
  // RLS-invisible exercise. Guarding here rather than at each of the ~6
  // `item.exercise.…` reads below is deliberate: without it one bad row took
  // down the entire My Fitness page, not just its own card, and every other
  // reader of this shape already skips nulls (see exerciseStats.js).
  const exercises = (allExercises ?? []).filter((item) => item?.exercise);

  const isSession = layout === "session";
  const [finalizing, setFinalizing] = useState(false);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  // null (not an empty Set) when the feature's off for this caller — that's
  // what tells ExerciseCard to render no checkbox at all.
  const [completions, setCompletions] = useState(null);
  // Map<exerciseId, { current, previous }> — this session's note and the last
  // thing said about this lift in any earlier session.
  const [notesByExerciseId, setNotesByExerciseId] = useState(() => new Map());
  // Whoever is signed in, i.e. the AUTHOR of anything typed here — distinct
  // from userId, which is whose session is being logged.
  const { profile } = useAuth();

  // Superset pairs render adjacently regardless of stored position — group by
  // supersetGroupId (falling back to the item's own id so an unlinked
  // exercise is its own group of one), preserving first-occurrence order.
  const groups = [];
  const groupIndexByKey = new Map();
  exercises.forEach((item) => {
    const key = item.supersetGroupId ?? item.id;
    if (!groupIndexByKey.has(key)) {
      groupIndexByKey.set(key, groups.length);
      groups.push([]);
    }
    groups[groupIndexByKey.get(key)].push(item);
  });

  const exerciseIdsKey = exercises.map((item) => item.exercise.id).join(",");
  const completionIdsKey = exercises.map((item) => item.id).join(",");

  // Session layout opens everything; accordion opens nothing. Re-seeded
  // whenever the exercise list itself changes (e.g. switching SPC sessions).
  // A lift that's ALREADY checked off gets collapsed again the moment
  // completions land — see fetchCompletions below.
  useEffect(() => {
    setExpandedIds(isSession ? new Set(exercises.map((item) => item.id)) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSession, completionIdsKey]);

  // Which exercise set the "collapse what's already done" seed has run for.
  // Keyed rather than a plain boolean so switching SPC sessions re-seeds,
  // while a mere refetch for the same session (e.g. weekNumber changing
  // identity) can't stomp expansions the member has made by hand since.
  const seededKeyRef = useRef(null);

  // The batched last-time fetch that used to run here is gone with the in-box
  // ghost it fed (design_handoff_member_lasttime_v1) — history is now loaded
  // lazily, for one lift, only when the member actually opens the sheet. That
  // takes a whole query off every session load and every refocus.

  // Batched, one round trip for the whole session — keyed by the join-row id
  // (item.id), not the raw exercise id, since that's what
  // exercise_completions is keyed on.
  const fetchCompletions = useCallback(async () => {
    if (!exerciseCompletionType) return;
    const ids = exercises.map((item) => item.id);
    if (ids.length === 0) return;
    try {
      const set =
        exerciseCompletionType === "group"
          ? await listGroupExerciseCompletionsForItems(userId, ids)
          : exerciseCompletionType === "spc"
            ? await listSpcExerciseCompletionsForItems(userId, ids, weekNumber)
            : exerciseCompletionType === "alternate"
              ? // Keyed by week like SPC, not like a one-off: one alternate
                // session row repeats across every week of the run (0110).
                await listAlternateExerciseCompletionsForItems(userId, ids, weekNumber)
              : await listOneOffExerciseCompletionsForItems(userId, ids);
      setCompletions(set);
      // Leaving the tab and coming back re-runs My Fitness's load(), which
      // flips it to its loading state and genuinely unmounts this whole
      // subtree — so expansion state can't survive on its own, and everything
      // came back open even for lifts already ticked off. The checkbox itself
      // was never the problem: it writes a real programming.exercise_completions
      // row (migration 0040) and that row was there the whole time. This is
      // what re-applies it, so a session resumes where it was left.
      if (isSession && seededKeyRef.current !== completionIdsKey) {
        seededKeyRef.current = completionIdsKey;
        setExpandedIds(new Set(exercises.filter((item) => !set.has(item.id)).map((item) => item.id)));
      }
    } catch (err) {
      console.error("Failed to load exercise completions:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseCompletionType, weekNumber, userId, completionIdsKey, isSession]);

  useEffect(() => {
    fetchCompletions();
  }, [fetchCompletions]);

  // ---------------------------------------------------------------------
  // The one note per lift (0087)
  // ---------------------------------------------------------------------
  // Batched for the whole session in a single round trip. These are the same
  // rows the wall display and the coach's live session page read and write,
  // so a note typed at the TV shows up here and a note typed here shows up
  // there — which was the entire point of 0087.
  //
  // Refetched whenever the session or its exercise list changes, which also
  // closes the staleness gap that made this look broken: My Fitness's own
  // detail effect is keyed on values that come back identical after a
  // refocus mid-week, so a note written at the TV never reached the phone
  // until a full reload.
  const sessionKey = [session?.groupWorkoutId, session?.spcWorkoutId, session?.oneOffWorkoutId]
    .map((v) => v ?? "")
    .join("|");

  const fetchNotes = useCallback(async () => {
    if (!userId || exercises.length === 0) return;
    try {
      const map = await listSessionExerciseNotes({
        userId,
        exerciseIds: exercises.map((item) => item.exercise.id),
        session,
      });
      setNotesByExerciseId(map);
    } catch (err) {
      // Never fatal — a notes failure must not blank the session itself.
      console.error("Failed to load lift notes:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, exerciseIdsKey, sessionKey]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Append-only (see coachingNotes.js): a later row supersedes rather than
  // editing in place, so this must only write when the text actually changed
  // or a save-on-blur box would pile up identical rows every time the member
  // tapped away. Author is whoever is LOOKING at the screen, which is not
  // necessarily whose session it is — a coach at the TV writing on a client's
  // lift is the normal case.
  const handleSaveNote = useCallback(
    async (exerciseId, body) => {
      const trimmed = (body ?? "").trim();
      const existing = notesByExerciseId.get(exerciseId)?.current?.body ?? "";
      // Clearing a note IS a real edit and writes an empty row that
      // supersedes — but re-blurring unchanged text must not.
      if (trimmed === existing.trim()) return;
      try {
        await addCoachingNote({
          userId,
          exerciseId,
          authorId: profile?.id ?? null,
          authorName: profile?.name ?? null,
          body: trimmed,
          session,
        });
        await fetchNotes();
      } catch (err) {
        toastError("Couldn't save that note", err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, sessionKey, notesByExerciseId, profile?.id, profile?.name, fetchNotes]
  );

  const markCompleteFor = (item) => {
    if (exerciseCompletionType === "group") return markGroupExerciseComplete(userId, item.id);
    if (exerciseCompletionType === "spc") return markSpcExerciseComplete(userId, item.id, weekNumber);
    if (exerciseCompletionType === "alternate") return markAlternateExerciseComplete(userId, item.id, weekNumber);
    if (exerciseCompletionType === "one_off") return markOneOffExerciseComplete(userId, item.id);
    return Promise.resolve();
  };

  const unmarkCompleteFor = (item) => {
    if (exerciseCompletionType === "group") return unmarkGroupExerciseComplete(userId, item.id);
    if (exerciseCompletionType === "spc") return unmarkSpcExerciseComplete(userId, item.id, weekNumber);
    if (exerciseCompletionType === "alternate") return unmarkAlternateExerciseComplete(userId, item.id, weekNumber);
    if (exerciseCompletionType === "one_off") return unmarkOneOffExerciseComplete(userId, item.id);
    return Promise.resolve();
  };

  // `src` distinguishes a deliberate tap from the card auto-filling its own
  // checkbox once every set holds both numbers. Only a manual tap collapses
  // the lift: "fully filled" flips true after the first digit of a
  // three-digit weight, so collapsing on auto would close the card
  // mid-number. Writes are fire-and-forget, same non-blocking philosophy as
  // autosave — the checkbox already shows the new state optimistically.
  const handleToggleComplete = (item, next, src = "manual") => {
    setCompletions((prev) => {
      const updated = new Set(prev ?? []);
      if (next) updated.add(item.id);
      else updated.delete(item.id);
      return updated;
    });
    (next ? markCompleteFor(item) : unmarkCompleteFor(item)).catch((err) => toastError("Couldn't save", err));
    if (src !== "manual") return;
    setExpandedIds((prev) => {
      const updated = new Set(prev);
      if (next) updated.delete(item.id);
      else updated.add(item.id);
      return updated;
    });
  };

  const handleToggleExpanded = (id) => {
    setExpandedIds((prev) => {
      if (prev.has(id)) {
        const updated = new Set(prev);
        updated.delete(id);
        return updated;
      }
      onExpandExercise?.();
      // Accordion stays single-open; the session page keeps whatever else is
      // already open, since the whole point there is one continuous list.
      return isSession ? new Set(prev).add(id) : new Set([id]);
    });
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      await onFinalize();
    } catch (err) {
      toastError("Couldn't save", err);
    } finally {
      setFinalizing(false);
    }
  };

  const renderCard = (item, group, groupIndex, indexInGroup) => (
    <ExerciseCard
      key={item.id}
      userId={userId}
      datePerformed={datePerformed}
      source={source}
      session={session}
      item={item}
      // One labeling language everywhere (2026-08-23): lifts are lettered,
      // a superset shares its letter and numbers its members — A, B1, B2 —
      // matching the builder and the printed SPC sheet.
      numberLabel={`${String.fromCharCode(65 + groupIndex)}${group.length > 1 ? indexInGroup + 1 : ""}`}
      expanded={expandedIds.has(item.id)}
      onToggleExpanded={handleToggleExpanded}
      completed={completions ? completions.has(item.id) : undefined}
      onToggleComplete={exerciseCompletionType ? (next, src) => handleToggleComplete(item, next, src) : undefined}
      hideVideo={hideVideo}
      scrollViewRef={scrollViewRef}
      scrollOffsetRef={scrollOffsetRef}
      onDataChanged={onDataChanged}
      restReturnTo={restReturnTo}
      compact={group.length > 1}
      note={notesByExerciseId.get(item.exercise.id)?.current ?? null}
      previousNote={notesByExerciseId.get(item.exercise.id)?.previous ?? null}
      onSaveNote={handleSaveNote}
    />
  );

  return (
    <View>
      {groups.map((group, groupIndex) =>
        group.length > 1 ? (
          /* The ground inside the dashed line is REAL peach, not the
             near-white it used to be (#fffdfb, which read as the same white
             as the cards sitting on it — the whole grouping was invisible
             unless you went looking for the dashes). The cards stay white, so
             the contrast between them and the field is what says "these two
             go together" from across the gym. */
          <View
            key={group[0].id}
            style={{
              borderWidth: 1.5,
              borderColor: "#e0b6a5",
              borderStyle: "dashed",
              borderRadius: 18,
              backgroundColor: "#fdece5",
              paddingHorizontal: 11,
              paddingTop: 9,
              paddingBottom: 1,
              marginBottom: 10,
            }}
          >
            {/* Solid rust on the peach field. The old chip was rust text on a
                #fdece5 pill, which is now exactly the colour behind it — it
                would have vanished into the ground. */}
            <Text
              maxFontSizeMultiplier={1.1}
              style={{
                alignSelf: "flex-start",
                fontFamily: fonts.sansBold,
                fontSize: type.eyebrow,
                color: "#fff",
                backgroundColor: "#b23a22",
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 3,
                marginBottom: 8,
              }}
            >
              SUPERSET
            </Text>
            {group.map((item, i) => renderCard(item, group, groupIndex, i))}
          </View>
        ) : (
          renderCard(group[0], group, groupIndex, 0)
        )
      )}

      {!hideFinalizeButton && onFinalize ? (
        <PressFade
          onPress={handleFinalize}
          disabled={finalizing}
          className="mt-1 items-center justify-center"
          pressedOpacity={0.75}
          style={{
            opacity: finalizing ? 0.5 : 1,
            height: 52,
            borderRadius: 14,
            backgroundColor: isCompleted ? "#4d6142" : colors.primary,
            shadowColor: isCompleted ? "#4d6142" : colors.primary,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 16,
          }}
        >
          <Text className="text-white" style={{ fontFamily: fonts.sansBold, fontSize: 14 }}>
            {finalizing ? "Saving…" : isCompleted ? "Workout finalized" : "Finalize workout"}
          </Text>
        </PressFade>
      ) : null}
    </View>
  );
}
