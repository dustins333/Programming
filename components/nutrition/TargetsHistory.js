import { View, Text } from "react-native";
import { deriveCalories } from "../../lib/nutrition/targets";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts } from "../../lib/theme";

export function TargetsHistory({ history }) {
  if (history.length === 0) return null;

  return (
    <View>
      {history.map((t, i) => (
        <View key={t.id} className="border-b border-stone-100 py-3">
          <View className="mb-1.5 flex-row items-center gap-2">
            {i === 0 ? (
              <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: "#ad816d" }}>
                <Text className="text-xs text-white" style={{ fontFamily: fonts.sansMedium }}>
                  current
                </Text>
              </View>
            ) : null}
            <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              {formatDateMDY(t.effective_date)}
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.sans }}>
            {Math.round(deriveCalories(t))} cal — P {t.protein_g}g / C {t.carb_g}g / F {t.fat_g}g / Fiber {t.fiber_g}g
            {t.step_goal ? ` · ${t.step_goal} steps` : ""}
            {t.sleep_hours_goal ? ` · ${t.sleep_hours_goal}h sleep` : ""}
          </Text>
          {t.note ? (
            <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              {t.note}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
