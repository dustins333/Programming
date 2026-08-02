import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { listLogsForDate } from "../lib/programming/memberPlan";
import { formatDateMDY } from "../lib/formatDate";
import { fonts, colors } from "../lib/theme";

const CARD_BORDER = "#ece7e1";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };

// Groups a date's flat log rows by exercise — a session row on My History's
// "By Day" view maps to a whole calendar date's worth of logs (session
// completions don't themselves store per-exercise/per-set data), so this
// popup shows every exercise logged that date rather than trying to
// reconstruct one specific session's exact exercise list.
function groupByExercise(logs) {
  const groups = [];
  const byExercise = new Map();
  for (const row of logs) {
    if (!byExercise.has(row.exercise_id)) {
      const group = { exerciseId: row.exercise_id, name: row.exercises?.name ?? "Exercise", sets: [], notes: null };
      byExercise.set(row.exercise_id, group);
      groups.push(group);
    }
    const group = byExercise.get(row.exercise_id);
    group.sets.push(row);
    if (!group.notes && row.notes) group.notes = row.notes;
  }
  return groups;
}

// Bottom-sheet popup for a My History "By Day" session row — reads the
// house style set by SessionDetailModal (rounded top corners, canvas bg,
// scrim backdrop) but is self-contained rather than reusing SessionLogger,
// since it only has a date + label to work from, not a full workout
// prescription (exercises/warmups/source) the way plan-block.js's caller does.
export function SessionHistoryModal({ visible, onClose, title, date, userId }) {
  const [logs, setLogs] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setLogs(null);
    setLoadError(null);
    listLogsForDate(userId, date)
      .then(setLogs)
      .catch((err) => setLoadError(err.message ?? String(err)));
  }, [visible, userId, date]);

  const groups = logs ? groupByExercise(logs) : [];

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
          <View className="mb-3 flex-row items-start justify-between gap-2.5">
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: "#44403c", lineHeight: 23 }}>{title}</Text>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#4d6142" }}>{formatDateMDY(date)}</Text>
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

          {loadError ? (
            <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
              Something went wrong loading this session: {loadError}
            </Text>
          ) : !logs ? (
            <View className="items-center py-8">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ gap: 10 }}>
              {groups.length === 0 ? (
                <Text className="py-3 text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                  Nothing logged for this session.
                </Text>
              ) : (
                groups.map((group) => (
                  <View
                    key={group.exerciseId}
                    className="mb-2.5 rounded-2xl bg-white px-4 py-3.5"
                    style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}
                  >
                    <Text className="mb-1.5" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>
                      {group.name}
                    </Text>
                    {group.sets.map((s) => (
                      <Text key={s.id} style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", marginTop: 2 }}>
                        Set {s.set_number}: {s.reps ?? "–"} reps{s.weight ? ` @ ${s.weight}` : ""}
                      </Text>
                    ))}
                    {group.notes ? (
                      <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e", marginTop: 6, fontStyle: "italic" }}>
                        {group.notes}
                      </Text>
                    ) : null}
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
