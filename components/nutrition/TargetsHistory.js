import { View, Text } from "react-native";
import { deriveCalories } from "../../lib/nutrition/targets";
import { formatDateMDY } from "../../lib/formatDate";
import { MacroPills } from "./MacroPills";
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
          <MacroPills
            calories={Math.round(deriveCalories(t))}
            protein={t.protein_g}
            carb={t.carb_g}
            fat={t.fat_g}
            fiber={t.fiber_g}
            steps={t.step_goal}
            sleepHours={t.sleep_hours_goal}
          />
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
