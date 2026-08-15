import { useMemo, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../lib/theme";
import { SessionLogger } from "./SessionLogger";
import { KeyboardDoneButton } from "./KeyboardDoneButton";
import { NativePickerField } from "./NativePickerField";
import { todayInBoise, addDays, dayOfWeekInBoise } from "../lib/boiseDate";
import { formatDateMDY } from "../lib/formatDate";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The last 30 days as picker options — replaces the free-typed YYYY-MM-DD
// field, which was the most avoidable phone input in the member app.
function buildRecentDateOptions() {
  const today = todayInBoise();
  return Array.from({ length: 30 }, (_, i) => {
    const date = addDays(today, -i);
    const label = `${WEEKDAY_SHORT[dayOfWeekInBoise(date)]} ${formatDateMDY(date)}${i === 0 ? " (today)" : i === 1 ? " (yesterday)" : ""}`;
    return { value: date, label };
  });
}

const CARD_BORDER = "#ece7e1";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };

function repSchemeSummary(repScheme) {
  if (!repScheme?.length) return null;
  const unique = [...new Set(repScheme)];
  return unique.length > 1 ? repScheme.join(", ") : null;
}

// Same first-occurrence-order grouping SessionLogger uses, for this read-only
// future-week branch's own hand-rolled list.
function groupBySuperset(exercises) {
  const groups = [];
  const indexByKey = new Map();
  exercises.forEach((item) => {
    const key = item.supersetGroupId ?? item.id;
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push([]);
    }
    groups[indexByKey.get(key)].push(item);
  });
  return groups;
}

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
  error,
  onRetry,
  warmups,
  userId,
  datePerformed,
  loggable,
  defaultLogDate,
  source,
  // Which session these sets belong to (0063) — the two "View full block"
  // screens pass it, so a lift logged here is attributed the same way it
  // would be from My Fitness rather than landing as session-unknown.
  session,
  exercises,
  onFinalize,
}) {
  const [logDate, setLogDate] = useState(defaultLogDate ?? "");
  const [dateLocked, setDateLocked] = useState(false);
  const dateOptions = useMemo(buildRecentDateOptions, []);

  const showEditableUnfinalized = !completed && loggable;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
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
          ) : error ? (
            <View className="items-center py-6">
              <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
                Couldn't load this session.
              </Text>
              {onRetry ? (
                <Pressable onPress={onRetry} hitSlop={8}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
                  session={session}
                  exercises={exercises}
                  hideVideo
                  hideFinalizeButton
                />
              ) : showEditableUnfinalized ? (
                <>
                  <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                    When did you do this?
                  </Text>
                  {dateLocked ? (
                    <Text className="rounded-lg border border-stone-200 px-3 py-2.5" style={{ fontFamily: fonts.sans, width: 210, opacity: 0.5, color: "#44403c" }}>
                      {formatDateMDY(logDate)}
                    </Text>
                  ) : Platform.OS === "web" ? (
                    <select
                      value={logDate}
                      onChange={(e) => setLogDate(e.target.value)}
                      style={{ fontFamily: fonts.sans, fontSize: 14, width: 210, padding: "9px 12px", borderRadius: 8, border: "1px solid #d6d3d1", color: "#44403c", backgroundColor: "white" }}
                    >
                      {dateOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <View style={{ width: 230, flexDirection: "row" }}>
                      <NativePickerField options={dateOptions} value={logDate} onChange={setLogDate} placeholder="Pick a date" />
                    </View>
                  )}
                  <Text className="mb-3 mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                    {dateLocked ? "Date locked — start over to change it." : "Defaults to today — change it if you did this earlier."}
                  </Text>
                  <SessionLogger
                    userId={userId}
                    datePerformed={logDate}
                    source={source}
                    session={session}
                    exercises={exercises}
                    hideVideo
                    isCompleted={false}
                    onFinalize={() => onFinalize(logDate)}
                    onExpandExercise={() => setDateLocked(true)}
                  />
                </>
              ) : (
                <View style={{ gap: 10 }}>
                  {groupBySuperset(exercises ?? []).map((group) => (
                    <View
                      key={group[0].id}
                      style={group.length > 1 ? { borderWidth: 1.5, borderColor: "#a46a57", borderStyle: "dashed", borderRadius: 18, padding: 6, gap: 10 } : undefined}
                    >
                      {group.length > 1 ? (
                        <Text className="self-start rounded-full px-2.5 py-0.5" style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#b23a22", backgroundColor: "#fdece5" }}>
                          ⚭ SUPERSET
                        </Text>
                      ) : null}
                      {group.map((ex) => (
                        <View
                          key={ex.id}
                          className="flex-row items-center justify-between rounded-2xl bg-white px-4 py-4"
                          style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}
                        >
                          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>{ex.exercise?.name}</Text>
                          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
                            Target: {ex.targetSets ?? "–"} sets × {repSchemeSummary(ex.repScheme) ?? ex.targetReps ?? "–"}
                          </Text>
                        </View>
                      ))}
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
      </KeyboardAvoidingView>
      {/* Its own copy, per KeyboardDoneButton's own rule: a floating overlay
          can't cross a native Modal's window boundary, so the one mounted at
          the app root never reaches the reps/weight fields in here. They're
          decimal-pad, which has no Return key on iOS — without this there is
          no way to dismiss the keyboard except guessing to tap outside. */}
      <KeyboardDoneButton />
    </Modal>
  );
}
