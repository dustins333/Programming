import { useMemo, useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { MOVEMENT_PATTERNS } from "../lib/programming/exercises";
import { fonts } from "../lib/theme";

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

// Reserved so the panel doesn't grow/shrink as the pointer moves across
// the bubbles — two lines of lift names is enough for any realistic
// session, and a fixed slot keeps everything below this panel still.
const DETAIL_SLOT_HEIGHT = 34;

// currentLifts / siblingLifts: [{ name, patterns }] — the lifts themselves,
// not just a flat list of their patterns, so each bubble can name what's
// feeding it. currentLifts comes from this session's live local state,
// siblingLifts from the other sessions in the same week (fetched once, see
// getSiblingLifts).
export function PatternTally({ currentLifts, siblingLifts }) {
  // Which bubble the pointer is over (web) or was last tapped (native —
  // hover events never fire there, so the same state doubles as a
  // tap-to-inspect toggle).
  const [active, setActive] = useState(null);

  const liftsByPattern = useMemo(() => {
    const byPattern = Object.fromEntries(MOVEMENT_PATTERNS.map((p) => [p, []]));
    [...currentLifts, ...siblingLifts].forEach((lift) => {
      (lift.patterns ?? []).forEach((p) => {
        if (byPattern[p]) byPattern[p].push(lift.name);
      });
    });
    return byPattern;
  }, [currentLifts, siblingLifts]);

  const activeNames = active ? liftsByPattern[active] ?? [] : [];

  return (
    <View className="rounded-lg border border-stone-200 p-4">
      <Text className="mb-3 text-sm text-stone-700" style={{ fontFamily: fonts.sansSemiBold }}>
        Movement balance (this week)
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {MOVEMENT_PATTERNS.map((p) => {
          const count = liftsByPattern[p].length;
          const isActive = active === p;
          return (
            <Pressable
              key={p}
              onHoverIn={() => setActive(p)}
              onHoverOut={() => setActive((prev) => (prev === p ? null : prev))}
              onPress={() => setActive((prev) => (prev === p ? null : p))}
              accessibilityLabel={
                count === 0 ? `${LABELS[p]}: none this week` : `${LABELS[p]}: ${liftsByPattern[p].join(", ")}`
              }
              className={`rounded-full border px-3.5 py-2.5 ${count === 0 ? "border-stone-200" : "border-accent bg-tertiary/30"}`}
              style={isActive ? { borderColor: "#4d6142", borderWidth: 1.5 } : undefined}
            >
              <Text className="text-xs" style={{ fontFamily: fonts.sansMedium }}>
                {LABELS[p]}: {count}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ height: DETAIL_SLOT_HEIGHT, justifyContent: "center" }} className="mt-2.5">
        {!active ? (
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            {Platform.OS === "web" ? "Hover" : "Tap"} a bubble to see which lifts feed it.
          </Text>
        ) : activeNames.length === 0 ? (
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            <Text style={{ fontFamily: fonts.sansSemiBold }}>{LABELS[active]}</Text> — nothing programmed this week.
          </Text>
        ) : (
          <Text numberOfLines={2} className="text-xs text-stone-600" style={{ fontFamily: fonts.sans }}>
            <Text style={{ fontFamily: fonts.sansSemiBold }}>{LABELS[active]}</Text> — {activeNames.join(", ")}
          </Text>
        )}
      </View>
    </View>
  );
}
