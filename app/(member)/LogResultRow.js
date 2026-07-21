import { useState } from "react";
import { View, Text, TextInput, Pressable, Linking } from "react-native";

export function LogResultRow({ item, onLog }) {
  const [sets, setSets] = useState(String(item.sets ?? ""));
  const [reps, setReps] = useState(item.reps ?? "");
  const [weight, setWeight] = useState("");
  const [logged, setLogged] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleLog = async () => {
    setSaving(true);
    try {
      await onLog({
        sets: sets === "" ? null : Number(sets),
        reps: reps === "" ? null : Number(reps) || null,
        weight: weight === "" ? null : Number(weight),
      });
      setLogged(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="mb-3 rounded-lg border border-neutral-200 px-4 py-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text style={{ fontFamily: "Montserrat_500Medium" }}>{item.exercises?.name}</Text>
        {item.exercises?.video_url ? (
          <Pressable onPress={() => Linking.openURL(item.exercises.video_url)}>
            <Text className="text-accent">▶</Text>
          </Pressable>
        ) : null}
      </View>
      <Text className="mb-2 text-xs text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
        Target: {item.sets} sets × {item.reps} reps{item.tempo ? ` · tempo ${item.tempo}` : ""}
        {item.notes ? ` · ${item.notes}` : ""}
      </Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={sets}
          onChangeText={setSets}
          placeholder="sets"
          keyboardType="numeric"
          className="w-16 rounded border border-neutral-300 px-2 py-1.5 text-center"
          style={{ fontFamily: "Montserrat_400Regular" }}
        />
        <TextInput
          value={reps}
          onChangeText={setReps}
          placeholder="reps"
          keyboardType="numeric"
          className="w-16 rounded border border-neutral-300 px-2 py-1.5 text-center"
          style={{ fontFamily: "Montserrat_400Regular" }}
        />
        <TextInput
          value={weight}
          onChangeText={setWeight}
          placeholder="weight"
          keyboardType="numeric"
          className="w-20 rounded border border-neutral-300 px-2 py-1.5 text-center"
          style={{ fontFamily: "Montserrat_400Regular" }}
        />
        <Pressable onPress={handleLog} disabled={saving} className="rounded-lg bg-primary px-3 py-2 disabled:opacity-50">
          <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            {logged ? "Logged ✓" : saving ? "Saving…" : "Log"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
