import { useMemo } from "react";
import { View, Text } from "react-native";
import { MOVEMENT_PATTERNS } from "../../../lib/programming/exercises";

const LABELS = {
  squat: "Squat",
  lunge: "Lunge",
  hinge: "Hinge",
  core: "Core",
  row: "Row",
  horizontal_push: "H Push",
  vertical_pull: "V Pull",
  vertical_push: "V Push",
};

export function PatternTally({ currentPatterns, siblingPatterns }) {
  const counts = useMemo(() => {
    const all = [...currentPatterns, ...siblingPatterns];
    const tally = Object.fromEntries(MOVEMENT_PATTERNS.map((p) => [p, 0]));
    all.forEach((p) => {
      if (p && tally[p] !== undefined) tally[p] += 1;
    });
    return tally;
  }, [currentPatterns, siblingPatterns]);

  return (
    <View className="rounded-lg border border-neutral-200 p-4">
      <Text className="mb-3 text-sm text-neutral-700" style={{ fontFamily: "Montserrat_600SemiBold" }}>
        Movement balance (this week)
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {MOVEMENT_PATTERNS.map((p) => (
          <View
            key={p}
            className={`rounded-full border px-3 py-1.5 ${counts[p] === 0 ? "border-neutral-200" : "border-accent bg-tertiary/30"}`}
          >
            <Text className="text-xs" style={{ fontFamily: "Montserrat_500Medium" }}>
              {LABELS[p]}: {counts[p]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
