import { useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { computeBaseline } from "../../lib/nutrition/onboarding";
import { formatDateMDY } from "../../lib/formatDate";
import { BaselineSummary } from "./BaselineSummary";
import { fonts, colors } from "../../lib/theme";

// Averages (via the same computeBaseline already used on the one-time
// approve.js review screen) are clickable — opens every logged day
// individually, for whenever a coach wants to see the actual data behind
// the average rather than just trusting it.
export function ObjectiveTrackingHistory({ logs }) {
  const [visible, setVisible] = useState(false);

  if (logs.length === 0) {
    return (
      <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
        No Objective Tracking days logged yet.
      </Text>
    );
  }

  const baseline = computeBaseline(logs);
  const sorted = [...logs].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <Pressable onPress={() => setVisible(true)}>
        <View className="rounded-lg border border-stone-200 px-4 py-3">
          <BaselineSummary baseline={baseline} />
          <Text className="mt-2 text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
            {logs.length} day{logs.length === 1 ? "" : "s"} logged · View full data ›
          </Text>
        </View>
      </Pressable>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-4">
          <View className="w-full max-w-md rounded-2xl bg-white" style={{ maxHeight: "85%" }}>
            <View className="flex-row items-center justify-between border-b border-stone-100 px-6 py-4">
              <Text className="text-lg" style={{ fontFamily: fonts.display, color: colors.primary }}>
                Objective Tracking days
              </Text>
              <Pressable onPress={() => setVisible(false)} hitSlop={8}>
                <Text className="text-stone-400" style={{ fontFamily: fonts.sansSemiBold }}>
                  ✕
                </Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 24 }}>
              {sorted.map((log, i) => {
                const calories = 4 * Number(log.protein_g) + 4 * Number(log.carb_g) + 9 * Number(log.fat_g);
                return (
                  <View key={i} className="border-b border-stone-100 py-3">
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }} className="text-stone-700">
                      {formatDateMDY(log.date)}
                    </Text>
                    <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                      Protein {log.protein_g}g · Carb {log.carb_g}g · Fat {log.fat_g}g · Fiber {log.fiber_g}g · {Math.round(calories)} cal
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
