import { View, Text, Pressable, TextInput } from "react-native";
import { fonts, colors } from "../lib/theme";

// −/+ around a typed number. Shared by the two block-creation dialogs and
// the Extend control so "how many weeks" reads and behaves identically
// wherever it's asked. Deliberately no upper bound: a coach programming a
// long off-season cycle shouldn't hit an arbitrary ceiling, and the real
// limit is the overlap check against the next block.
export function WeeksStepper({ value, onChange, min = 1, label = "weeks" }) {
  const numeric = Number(value);
  const valid = Number.isFinite(numeric) && numeric >= min;

  const step = (delta) => {
    const base = valid ? numeric : min;
    onChange(String(Math.max(min, base + delta)));
  };

  return (
    <View className="flex-row items-center gap-2.5">
      <Pressable
        onPress={() => step(-1)}
        disabled={valid && numeric <= min}
        accessibilityLabel={`One fewer ${label}`}
        className="h-10 w-10 items-center justify-center rounded-lg border disabled:opacity-40"
        style={{ borderColor: "#d9d4cd" }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: "#57534e" }}>−</Text>
      </Pressable>
      <TextInput
        value={String(value ?? "")}
        onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        className="h-10 w-16 rounded-lg border text-center"
        style={{ borderColor: "#d9d4cd", fontFamily: fonts.sansSemiBold, fontSize: 15 }}
      />
      <Pressable
        onPress={() => step(1)}
        accessibilityLabel={`One more ${label}`}
        className="h-10 w-10 items-center justify-center rounded-lg border"
        style={{ borderColor: "#d9d4cd" }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: "#57534e" }}>+</Text>
      </Pressable>
      <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: valid ? "#78716c" : colors.primaryOnWhite }}>
        {valid ? label : `enter at least ${min}`}
      </Text>
    </View>
  );
}
