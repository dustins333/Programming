import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { listLogsForExercise } from "../lib/programming/memberPlan";
import { formatDateMDY } from "../lib/formatDate";
import { fonts, colors } from "../lib/theme";

const CARD_BORDER = "#ece7e1";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };

// Same grouping as My History's "By Workout" screen (history/[exerciseId].js) —
// one card per date instead of one row per set.
function groupByDate(logs) {
  const groups = [];
  const byDate = new Map();
  for (const row of logs) {
    if (!byDate.has(row.date_performed)) {
      const group = { date: row.date_performed, sets: [] };
      byDate.set(row.date_performed, group);
      groups.push(group);
    }
    byDate.get(row.date_performed).sets.push(row);
  }
  return groups;
}

// Full cross-session history for one lift, as a popup right on the exercise
// card in SessionLogger — same data/grouping as My History's "By Workout"
// screen, just surfaced without leaving the logging flow. Refetches every
// time it's opened rather than caching: the exercise being shown changes
// between opens, and the list itself can change mid-session (today's own
// autosave writes into the same `logs` table this reads).
export function ExerciseHistoryModal({ visible, onClose, userId, exerciseId, exerciseName }) {
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    if (!visible || !exerciseId) return;
    setLogs(null);
    listLogsForExercise(userId, exerciseId).then(setLogs);
  }, [visible, exerciseId, userId]);

  const groups = logs ? groupByDate(logs) : [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end px-0" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
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
          <View className="mb-3 flex-row items-start justify-between" style={{ gap: 10 }}>
            <Text numberOfLines={2} style={{ fontFamily: fonts.sansBold, fontSize: 18, color: "#44403c", lineHeight: 23, flex: 1 }}>
              {exerciseName}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="items-center justify-center"
              style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#e7e5e4", flexShrink: 0 }}
            >
              <Text style={{ color: "#a8a29e", fontSize: 15 }}>×</Text>
            </Pressable>
          </View>

          {!logs ? (
            <View className="items-center py-8">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {groups.length === 0 ? (
                <Text className="py-3 text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                  No logged history for this lift yet.
                </Text>
              ) : (
                groups.map((group) => (
                  <View key={group.date} className="mb-2.5 rounded-2xl bg-white px-4 py-3.5" style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}>
                    <Text className="mb-1.5" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>
                      {formatDateMDY(group.date)}
                    </Text>
                    {group.sets.map((s) => (
                      <Text key={s.id} style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", marginTop: 2 }}>
                        Set {s.set_number}: {s.reps ?? "–"} reps{s.weight ? ` @ ${s.weight}` : ""}
                      </Text>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
