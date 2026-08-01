import { useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../lib/theme";
import { SessionLogger } from "./SessionLogger";

const CARD_BORDER = "#ece7e1";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };

// Popup for a single session on the member's full-block plan view (group's
// plan-block.js and SPC's plan-spc-block.js). Three states:
//  - completed: the real SessionLogger accordion, view + edit whatever was
//    logged (no video links — those stay My Fitness-only — no Finalize
//    button, this is for correcting history, not first-time logging).
//  - not completed but loggable (a past/current week's missed session —
//    someone forgot their phone and is catching up later): an editable
//    "when did you do this?" date plus the real SessionLogger WITH its
//    Finalize button, so a missed session can be logged and finalized
//    retroactively instead of being stuck read-only forever. The date
//    field locks once the member actually starts expanding an exercise
//    (onExpandExercise) — changing it after autosave has already started
//    writing to the old date would silently split one session's log
//    across two dates.
//  - not completed and not loggable (a future week): plain read-only
//    prescription, since there's nothing to log yet.
// The caller is expected to remount this component (via a `key` on the
// element) whenever a different session is opened, so this internal state
// doesn't leak between sessions.
export function SessionDetailModal({
  visible,
  onClose,
  title,
  completed,
  completedDateLabel,
  loading,
  warmups,
  userId,
  datePerformed,
  loggable,
  defaultLogDate,
  source,
  exercises,
  onFinalize,
}) {
  const [logDate, setLogDate] = useState(defaultLogDate ?? "");
  const [dateLocked, setDateLocked] = useState(false);

  const showEditableUnfinalized = !completed && loggable;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end px-0" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        {/* Swallows the tap so pressing inside the sheet doesn't bubble up
            to the backdrop's onClose — on web a Pressable's onClick is a
            real DOM event, so nested clicks would otherwise close it. */}
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            maxHeight: "82%",
            width: "100%",
            backgroundColor: "#faf8f6",
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: 22,
            paddingHorizontal: 20,
            paddingBottom: 24,
          }}
        >
          <View className="mb-1.5 flex-row items-start justify-between gap-2.5">
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: "#44403c", lineHeight: 23 }}>{title}</Text>
              {completed ? (
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="checkmark" size={12} color="#4d6142" />
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#4d6142" }}>Completed {completedDateLabel}</Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="items-center justify-center"
              style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#e7e5e4", flexShrink: 0 }}
            >
              <Text style={{ color: "#a8a29e", fontSize: 15 }}>×</Text>
            </Pressable>
          </View>

          {loading ? (
            <View className="items-center py-8">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {warmups?.length > 0 ? (
                <Text className="mb-3 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Warm-up: {warmups.join(", ")}
                </Text>
              ) : null}

              {completed ? (
                <SessionLogger
                  userId={userId}
                  datePerformed={datePerformed}
                  source={source}
                  exercises={exercises}
                  hideVideo
                  hideFinalizeButton
                />
              ) : showEditableUnfinalized ? (
                <>
                  <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                    When did you do this?
                  </Text>
                  <TextInput
                    value={logDate}
                    onChangeText={setLogDate}
                    editable={!dateLocked}
                    placeholder="YYYY-MM-DD"
                    className="rounded-lg border border-stone-300 px-3 py-2.5"
                    style={{ fontFamily: fonts.sans, width: 150, opacity: dateLocked ? 0.5 : 1 }}
                  />
                  <Text className="mb-3 mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                    {dateLocked ? "Date locked — start over to change it." : "Defaults to today — change it if you did this earlier."}
                  </Text>
                  <SessionLogger
                    userId={userId}
                    datePerformed={logDate}
                    source={source}
                    exercises={exercises}
                    hideVideo
                    isCompleted={false}
                    onFinalize={() => onFinalize(logDate)}
                    onExpandExercise={() => setDateLocked(true)}
                  />
                </>
              ) : (
                <View style={{ gap: 10 }}>
                  {(exercises ?? []).map((ex) => (
                    <View
                      key={ex.id}
                      className="flex-row items-center justify-between rounded-2xl bg-white px-4 py-4"
                      style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}
                    >
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>{ex.exercise?.name}</Text>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
                        Target: {ex.targetSets ?? "–"} sets × {ex.targetReps ?? "–"}
                      </Text>
                    </View>
                  ))}
                  {(exercises ?? []).length === 0 ? (
                    <Text className="py-3 text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                      Nothing here yet.
                    </Text>
                  ) : null}
                </View>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
