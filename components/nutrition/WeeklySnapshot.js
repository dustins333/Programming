import { View, Text } from "react-native";
import { fonts } from "../../lib/theme";

function fmt(n, digits = 1) {
  if (n === null || n === undefined) return "—";
  const rounded = Math.round(n * 10 ** digits) / 10 ** digits;
  return digits === 0 ? String(Math.round(rounded)) : String(rounded);
}

function Box({ accent, title, children }) {
  return (
    <View className="rounded-lg border border-stone-200 p-3.5" style={{ borderLeftWidth: 4, borderLeftColor: accent, minWidth: 160, flexGrow: 1 }}>
      <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansSemiBold }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View className="mb-1 flex-row items-baseline justify-between">
      <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
        {label}
      </Text>
      <Text className="text-sm" style={{ fontFamily: fonts.sansMedium }}>
        {value}
      </Text>
    </View>
  );
}

export function WeeklySnapshot({ thisWeek, lastWeek }) {
  const t = thisWeek.averages;
  const l = lastWeek.averages;
  const weightDelta = t.weight != null && l.weight != null ? t.weight - l.weight : null;

  return (
    <View className="flex-row flex-wrap gap-2.5">
      <Box accent="#a46a57" title="Weight">
        <Row label="This week" value={fmt(t.weight)} />
        <Row label="Last week" value={fmt(l.weight)} />
        <Row label="Change" value={weightDelta == null ? "—" : `${weightDelta > 0 ? "+" : ""}${fmt(weightDelta)}`} />
      </Box>
      <Box accent="#ad816d" title="Nutrition">
        <Row label="Protein (g)" value={fmt(t.protein_g)} />
        <Row label="Carb (g)" value={fmt(t.carb_g)} />
        <Row label="Fat (g)" value={fmt(t.fat_g)} />
        <Row label="Fiber (g)" value={fmt(t.fiber_g)} />
      </Box>
      <Box accent="#beac95" title="Steps">
        <Row label="Daily average" value={fmt(t.steps, 0)} />
      </Box>
      <Box accent="#a46a57" title="Sleep">
        <Row label="Hours" value={t.sleep_hours != null ? `${fmt(t.sleep_hours)}h` : "—"} />
        <Row label="Quality (1-5)" value={fmt(t.sleep_quality)} />
      </Box>
      <Box accent="#ad816d" title="Hunger & Energy">
        <Row label="Hunger (1-5)" value={fmt(t.hunger)} />
        <Row label="Energy (1-5)" value={fmt(t.energy)} />
      </Box>
    </View>
  );
}
