import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ExerciseCard } from "./ExerciseCard";
import { TimerControl } from "./TimerControl";
import { KeyboardDoneButton } from "./KeyboardDoneButton";
import { fonts, colors } from "../lib/theme";

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
// component's visible prop, so nothing here unmounts when moving between
// exercises. That matters because ExerciseCard's autosave is a debounced
// timer cancelled by its own unmount-cleanup: mounting/unmounting per
// navigation would silently drop whatever was just typed the instant the
// arrow is tapped.
//
// On the last exercise/superset (canGoNext false), a Finalize button renders
// right in the card so a member doesn't have to close the sheet and hunt for
// the one below the index list — tapping it finalizes and closes the sheet
// back to the overview in one action. `onFinalize`/`isCompleted` are the
// same props SessionLogger already threads to its own Finalize button, so no
// new plumbing is needed from callers. Errors render inline (not
// Alert.alert, which is a no-op on the web PWA build members can also use)
// rather than failing silently.
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
  timer,
  onToggleTimer,
  onResetTimer,
  onFinalize,
  isCompleted,
}) {
  const canGoPrev = focusIndex > 0;
  const canGoNext = focusIndex < groups.length - 1;
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState(null);
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

  useEffect(() => {
    if (visible) setFinalizeError(null);
  }, [visible]);

  const handleFinalize = async () => {
    setFinalizing(true);
    setFinalizeError(null);
    try {
      await onFinalize();
      onClose();
    } catch (err) {
      setFinalizeError(err.message ?? String(err));
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
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
            paddingBottom: 24,
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

            <View className="flex-1 items-center">
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: "#a8a29e" }}>
                Exercise {focusIndex + 1} of {groups.length}
              </Text>
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

          {timer ? (
            <View className="mb-3 items-center">
              <TimerControl timer={timer} onToggle={onToggleTimer} onReset={onResetTimer} compact />
            </View>
          ) : null}

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
                <Pressable
                  onPress={handleFinalize}
                  disabled={finalizing}
                  className="items-center justify-center disabled:opacity-50"
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
                    {finalizing ? "Saving…" : isCompleted ? "✓ Finalized — tap to update" : "Finalize workout"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
      <KeyboardDoneButton />
    </Modal>
  );
}
