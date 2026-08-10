import { useContext, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, BackHandler } from "react-native";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ExerciseCard } from "./ExerciseCard";
import {
  markGroupExerciseComplete,
  markSpcExerciseComplete,
  markOneOffExerciseComplete,
  unmarkGroupExerciseComplete,
  unmarkSpcExerciseComplete,
  unmarkOneOffExerciseComplete,
} from "../lib/programming/exerciseCompletions";
import { toastError } from "../lib/toast";
import { PressFade } from "./PressFade";
import { fonts, colors } from "../lib/theme";
import { useKeyboardHeight, DONE_BAR_HEIGHT } from "../lib/scrollToKeyboard";

// Gives the checkmark's fill-in a moment to actually be seen before the
// view changes out from under the tap — without this the advance happened
// so fast the state change was basically invisible.
const ADVANCE_DELAY_MS = 550;

// The "focus card" view for My Fitness's logging page — one exercise (or
// superset pair) takes over the screen at a time, left/right arrows move to
// the next, clamped at both ends (no wraparound — overshooting past the
// last exercise and landing back on the first would read as a bug on a
// linear "next" affordance). A superset's members move together as one
// group, matching how SessionLogger already renders them elsewhere.
//
// Every group's ExerciseCard is rendered here unconditionally (not gated on
// focusIndex), with only the current one visible (display:none for the
// rest) — arrow navigation only ever changes focusIndex, never this
// component's own visibility, so nothing here unmounts when moving between
// exercises. That matters because ExerciseCard's autosave is a debounced
// timer cancelled by its own unmount-cleanup: mounting/unmounting per
// navigation would silently drop whatever was just typed the instant the
// arrow is tapped. For the exact same reason, THIS component itself never
// conditionally returns null based on `visible` either — it's toggled via
// `display: visible ? "flex" : "none"` so it stays mounted (and its
// children keep their state/timers) even while "closed".
//
// Deliberately NOT a real React Native <Modal>: a Modal always paints in
// its own native window layer above literally everything else on the
// page, including My Fitness's own header — there is no way to keep that
// header visible/clickable while a real Modal is open, which is exactly
// the bug this replaced. This is instead rendered by My Fitness itself
// (plan.js) as a plain absolutely-positioned sibling of its header, so the
// header — its "My Fitness ‹ Back" bar and the session info/timer below it
// — paints on top and stays interactive the whole time, open or closed.
//
// On the last exercise/superset (canGoNext false), a Finalize button renders
// right in the card so a member doesn't have to close the sheet and hunt for
// the one below the index list — tapping it also checks off that card's own
// exercise(s) (if not already) before finalizing and closing, so the index
// list and the whole-session state agree with each other. Errors render
// inline (not Alert.alert, which is a no-op on the web PWA build members
// can also use) rather than failing silently.
//
// Per-exercise completion state is owned entirely here, not in ExerciseCard
// — a superset's two cards both need to report to one place so checking the
// first doesn't skip past the second one that hasn't been touched yet
// (advancing only happens once every item in the *current* group is
// checked).
export function SessionFocusModal({
  visible,
  groups,
  focusIndex,
  onNavigate,
  onClose,
  userId,
  datePerformed,
  source,
  hideVideo,
  onFinalize,
  isCompleted,
  onSessionDataChanged,
  exerciseCompletionType,
  weekNumber,
  completions,
}) {
  const canGoPrev = focusIndex > 0;
  const canGoNext = focusIndex < groups.length - 1;
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState(null);
  // Seeded from the parent's batch-fetched `completions` every time the
  // overlay opens, then updated locally (optimistically) as the member taps
  // checkboxes — this is what handleToggleComplete's "is the whole group
  // done yet" check reads, since the parent's own `completions` prop only
  // refreshes once the overlay closes.
  const [localCompletions, setLocalCompletions] = useState(() => new Set(completions ? [...completions] : []));
  // Which items were completed by the app auto-filling every set, vs. a
  // deliberate manual tap — only auto-fill shows the "advance" arrow (see
  // handleToggleComplete below for why manual tap never does).
  const [autoCompletedIds, setAutoCompletedIds] = useState(() => new Set());
  const advanceTimeoutRef = useRef(null);
  // Handed down to each ExerciseCard so a focused reps/weight/notes field
  // can scroll itself above the keyboard — see ExerciseCard's own comment
  // for why this is needed at all (a single exercise's content is usually
  // short enough to already be visible, a superset's two stacked cards
  // often aren't). scrollOffsetRef is tracked once here (see
  // lib/scrollToKeyboard.js for why — RN has no synchronous way to read a
  // ScrollView's current offset) and shared by every ExerciseCard instance,
  // since they all scroll the same single ScrollView.
  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  // Keyboard-height-aware bottom padding instead of a KeyboardAvoidingView —
  // same fix, same reasoning as MessageThread.js (see its own header
  // comment): KeyboardAvoidingView's "padding" behavior measures its own
  // on-screen position via onLayout, which is unreliable once nested this
  // many levels deep below other content (this overlay sits inside My
  // Fitness's own page tree, several Views down). It's also redundant here
  // regardless — useScrollToKeyboard (passed to every ExerciseCard below)
  // already computes the keyboard's real occlusion independently via
  // measureInWindow, not by relying on any ancestor's layout. tabBarHeight
  // is subtracted for the same reason MessageThread subtracts it: the tab
  // bar's space is always reserved in the layout, so padding by the raw
  // keyboard height would double-count it and leave a dead gap.
  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const keyboardPadding = Math.max(0, occludedHeight - tabBarHeight);

  const goNext = () => (canGoNext ? onNavigate(focusIndex + 1) : onClose());

  useEffect(() => {
    if (visible) {
      setFinalizeError(null);
      setLocalCompletions(new Set(completions ? [...completions] : []));
      setAutoCompletedIds(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => () => clearTimeout(advanceTimeoutRef.current), []);

  // Android hardware back closes the overlay instead of navigating away
  // from the page underneath it — a real <Modal> handled this
  // automatically via onRequestClose; a plain overlay needs it wired by
  // hand.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const markCompleteFor = (item) => {
    if (exerciseCompletionType === "group") return markGroupExerciseComplete(userId, item.id);
    if (exerciseCompletionType === "spc") return markSpcExerciseComplete(userId, item.id, weekNumber);
    if (exerciseCompletionType === "one_off") return markOneOffExerciseComplete(userId, item.id);
    return Promise.resolve();
  };

  const unmarkCompleteFor = (item) => {
    if (exerciseCompletionType === "group") return unmarkGroupExerciseComplete(userId, item.id);
    if (exerciseCompletionType === "spc") return unmarkSpcExerciseComplete(userId, item.id, weekNumber);
    if (exerciseCompletionType === "one_off") return unmarkOneOffExerciseComplete(userId, item.id);
    return Promise.resolve();
  };

  // A superset's two cards both call this — advancing only once every item
  // in the *current* group is checked is what stops checking the first
  // exercise from jumping straight past the second one. Mark/unmark calls
  // are fire-and-forget, same non-blocking philosophy as autosave — the
  // checkbox already reflects the new state optimistically.
  //
  // `source` distinguishes a deliberate manual tap from the app auto-
  // filling a fully-logged exercise — only a manual tap auto-advances
  // (it's already an explicit "I'm done" action). Auto-fill never advances
  // on its own; it just fills the checkbox solid and surfaces the arrow
  // instead, so a member who just finished typing the last number isn't
  // immediately swept onto the next card before they're ready to move on.
  const handleToggleComplete = (item, next, source = "manual") => {
    const alreadyKnown = localCompletions.has(item.id);
    setLocalCompletions((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(item.id);
      else updated.delete(item.id);
      return updated;
    });
    setAutoCompletedIds((prev) => {
      const updated = new Set(prev);
      if (next && source === "auto") updated.add(item.id);
      else updated.delete(item.id);
      return updated;
    });
    (next ? markCompleteFor(item) : unmarkCompleteFor(item)).catch((err) => toastError("Couldn't save", err));

    if (next && !alreadyKnown && source === "manual") {
      const group = groups[focusIndex] ?? [];
      const groupNowComplete = group.every((g) => g.id === item.id || localCompletions.has(g.id));
      if (groupNowComplete) {
        clearTimeout(advanceTimeoutRef.current);
        advanceTimeoutRef.current = setTimeout(goNext, ADVANCE_DELAY_MS);
      }
    }
  };

  // Finalizing from the last card also checks off that card's own
  // exercise(s), if they weren't already — marked directly (not routed
  // through handleToggleComplete) since there's no reason to also schedule
  // an advance-after-delay here, the finalize flow is already about to
  // close the whole overlay on its own.
  const handleFinalize = async () => {
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const lastGroup = groups[focusIndex] ?? [];
      const newlyCompleted = lastGroup.filter((item) => !localCompletions.has(item.id));
      if (newlyCompleted.length > 0) {
        setLocalCompletions((prev) => {
          const updated = new Set(prev);
          newlyCompleted.forEach((item) => updated.add(item.id));
          return updated;
        });
        newlyCompleted.forEach((item) => {
          markCompleteFor(item).catch((err) => toastError("Couldn't save", err));
        });
      }
      await onFinalize();
      onClose();
    } catch (err) {
      setFinalizeError(err.message ?? String(err));
    } finally {
      setFinalizing(false);
    }
  };

  // A group counts as done only when every exercise in it is checked —
  // a superset isn't finished because one half of it is.
  // localCompletions, not the `completions` prop — the prop only refreshes
  // once the overlay closes, so reading it here would leave the bar frozen
  // while the member is actually checking things off.
  const doneGroupCount = exerciseCompletionType
    ? groups.filter((group) => group.every((item) => localCompletions.has(item.id))).length
    : 0;

  return (
    // Root-caused via a real simulator build + real taps, not guessed: this
    // overlay was mounting and genuinely doing work (its ExerciseCards were
    // firing their own fetches, confirmed via device logs) while rendering
    // completely invisible — not "underneath," not mispositioned, just
    // never painted. Bisected down to one specific line: StyleSheet.
    // absoluteFillObject used *inside a style array* (`style={[StyleSheet.
    // absoluteFillObject, {...}]}`) breaks on this app's Fabric/New
    // Architecture build — a plain equivalent object
    // (`{position:"absolute", top:0, left:0, right:0, bottom:0}`) in the
    // exact same array position renders correctly. Confirmed by swapping
    // only that one value back and forth against an otherwise-identical
    // component tree; every other piece (the Pressable backdrop/sheet, the
    // header row, the ScrollView, a real ExerciseCard) rendered fine in
    // isolation. zIndex/elevation stay explicit as insurance regardless —
    // sibling absolutely-positioned Views are supposed to paint in source
    // order by default, but that's not worth trusting blindly given the
    // above. `pointerEvents` also moved from a direct prop to
    // `style.pointerEvents`, matching the "props.pointerEvents is
    // deprecated" warning this was already throwing.
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: visible ? "flex" : "none",
        zIndex: 50,
        elevation: 50,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <Pressable onPress={onClose} className="flex-1 justify-end px-0" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            maxHeight: "92%",
            width: "100%",
            backgroundColor: "#faf8f6",
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: 16,
            paddingHorizontal: 16,
            paddingBottom: 24 + keyboardPadding,
          }}
        >
          <View className="mb-2 flex-row items-center" style={{ gap: 8 }}>
            <Pressable
              onPress={() => canGoPrev && onNavigate(focusIndex - 1)}
              disabled={!canGoPrev}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Previous exercise"
              className="items-center justify-center disabled:opacity-30"
              style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "#e7e5e4" }}
            >
              <Ionicons name="chevron-back" size={17} color="#78716c" />
            </Pressable>

            <View className="flex-1 items-center" style={{ gap: 6 }}>
              <Text
                maxFontSizeMultiplier={1.1}
                style={{ fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "#a8a29e" }}
              >
                Exercise {focusIndex + 1} of {groups.length}
              </Text>
              {/* Session progress (v5, 1d). The session's identity and timer
                  already sit in the page header above this overlay — this
                  adds the one thing that isn't up there: how much of the
                  session is actually done. */}
              {exerciseCompletionType ? (
                <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: "#f0ddd2", overflow: "hidden" }}>
                    <View
                      style={{
                        width: `${groups.length > 0 ? (doneGroupCount / groups.length) * 100 : 0}%`,
                        height: "100%",
                        borderRadius: 999,
                        backgroundColor: "#4d6142",
                      }}
                    />
                  </View>
                  <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 10.5, color: "#78716c" }}>
                    {doneGroupCount} of {groups.length} done
                  </Text>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={() => canGoNext && onNavigate(focusIndex + 1)}
              disabled={!canGoNext}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Next exercise"
              className="items-center justify-center disabled:opacity-30"
              style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "#e7e5e4" }}
            >
              <Ionicons name="chevron-forward" size={17} color="#78716c" />
            </Pressable>

            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close"
              className="items-center justify-center"
              style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#e7e5e4", marginLeft: 2 }}
            >
              <Text style={{ color: "#a8a29e", fontSize: 15 }}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => {
              scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
            {groups.map((group, i) => (
              <View key={group[0].id} style={{ display: i === focusIndex ? "flex" : "none" }}>
                {group.length > 1 ? (
                  <View
                    className="mb-2.5 rounded-2xl px-2 pt-2"
                    style={{ borderWidth: 1.5, borderColor: "#a46a57", borderStyle: "dashed" }}
                  >
                    <Text
                      className="mb-1 self-start rounded-full px-2.5 py-0.5"
                      style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#b23a22", backgroundColor: "#fdece5" }}
                    >
                      ⚭ SUPERSET
                    </Text>
                    {group.map((item) => (
                      <ExerciseCard
                        key={item.id}
                        userId={userId}
                        datePerformed={datePerformed}
                        source={source}
                        item={item}
                        hideVideo={hideVideo}
                        forceExpanded
                        scrollViewRef={scrollViewRef}
                        scrollOffsetRef={scrollOffsetRef}
                        exerciseCompletionType={exerciseCompletionType}
                        completed={localCompletions.has(item.id)}
                        showAdvanceArrow={autoCompletedIds.has(item.id)}
                        onToggleComplete={(next, src) => handleToggleComplete(item, next, src)}
                        onAdvance={goNext}
                        onDataChanged={onSessionDataChanged}
                      />
                    ))}
                  </View>
                ) : (
                  <ExerciseCard
                    key={group[0].id}
                    userId={userId}
                    datePerformed={datePerformed}
                    source={source}
                    item={group[0]}
                    hideVideo={hideVideo}
                    forceExpanded
                    scrollViewRef={scrollViewRef}
                    scrollOffsetRef={scrollOffsetRef}
                    exerciseCompletionType={exerciseCompletionType}
                    completed={localCompletions.has(group[0].id)}
                    showAdvanceArrow={autoCompletedIds.has(group[0].id)}
                    onToggleComplete={(next, src) => handleToggleComplete(group[0], next, src)}
                    onAdvance={goNext}
                    onDataChanged={onSessionDataChanged}
                  />
                )}
              </View>
            ))}

            {!canGoNext && onFinalize ? (
              <View className="mt-3">
                {finalizeError ? (
                  <Text className="mb-2 text-center" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#b23a22" }}>
                    Couldn't save — {finalizeError}
                  </Text>
                ) : null}
                <PressFade
                  onPress={handleFinalize}
                  disabled={finalizing}
                  className="items-center justify-center disabled:opacity-50"
                  pressedOpacity={0.75}
                  style={{
                    height: 52,
                    borderRadius: 12,
                    backgroundColor: isCompleted ? "#4d6142" : colors.primary,
                    shadowColor: isCompleted ? "#4d6142" : colors.primary,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.25,
                    shadowRadius: 16,
                  }}
                >
                  <Text className="text-white" style={{ fontFamily: fonts.sansBold, fontSize: 14 }}>
                    {finalizing ? "Saving…" : isCompleted ? "✓ Finalized" : "Finalize workout"}
                  </Text>
                </PressFade>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </View>
  );
}
