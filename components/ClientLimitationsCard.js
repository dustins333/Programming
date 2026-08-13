import { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SEVERITIES, SEVERITY_STYLE } from "../lib/programming/clientNotes";
import { fonts, colors } from "../lib/theme";

// Two fields, not one free-text line: "Left shoulder" / "no overhead" reads
// the same everywhere and stays scannable as a pill, where a single blob
// wouldn't. Severity picks the tone (rust = avoid, amber = caution).
export function ClientLimitationsCard({ limitations, error, editable = true, compact = false, onAdd, onDelete, onRetry }) {
  const [adding, setAdding] = useState(false);
  const [area, setArea] = useState("");
  const [guidance, setGuidance] = useState("");
  const [severity, setSeverity] = useState("caution");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!area.trim() || !guidance.trim()) return;
    setSaving(true);
    try {
      await onAdd({ area, guidance, severity });
      setArea("");
      setGuidance("");
      setSeverity("caution");
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <View>
        <Text className="text-red-600" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          Couldn't load limitations: {error}
        </Text>
        {onRetry ? (
          <Pressable onPress={onRetry} className="mt-2 self-start" hitSlop={6}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const list = limitations ?? [];

  return (
    <View>
      {list.length === 0 && !adding ? (
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          {editable ? "None recorded." : "No limitations recorded."}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap" style={{ gap: 6 }}>
        {list.map((lim) => {
          const tone = SEVERITY_STYLE[lim.severity] ?? SEVERITY_STYLE.caution;
          return (
            <View
              key={lim.id}
              className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ backgroundColor: tone.bg }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: tone.text }}>
                {lim.area} · {lim.guidance}
              </Text>
              {editable ? (
                <Pressable onPress={() => onDelete(lim)} hitSlop={8} accessibilityLabel={`Remove limitation ${lim.area}`}>
                  <Ionicons name="close" size={12} color={tone.text} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      {adding ? (
        <View className="mt-3 rounded-xl border p-3" style={{ borderColor: "#e2ddd6", backgroundColor: "#faf8f6" }}>
          <View className="flex-row gap-2">
            <TextInput
              value={area}
              onChangeText={setArea}
              placeholder="Left shoulder"
              className="flex-1 rounded-lg border bg-white px-3 py-2"
              style={{ fontFamily: fonts.sans, fontSize: 13, borderColor: "#e2ddd6" }}
            />
            <TextInput
              value={guidance}
              onChangeText={setGuidance}
              placeholder="no overhead"
              className="flex-1 rounded-lg border bg-white px-3 py-2"
              style={{ fontFamily: fonts.sans, fontSize: 13, borderColor: "#e2ddd6" }}
            />
          </View>
          <View className="mt-2.5 flex-row items-center justify-between">
            <View className="flex-row gap-1.5">
              {SEVERITIES.map((s) => {
                const active = severity === s.key;
                const tone = SEVERITY_STYLE[s.key];
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => setSeverity(s.key)}
                    className="rounded-full border px-3 py-1.5"
                    style={{ backgroundColor: active ? tone.bg : "#ffffff", borderColor: active ? tone.text : "#d9d4cd" }}
                  >
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: active ? tone.text : "#78716c" }}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="flex-row gap-2">
              <Pressable onPress={() => setAdding(false)} className="rounded-lg border px-3 py-1.5" style={{ borderColor: "#d9d4cd" }}>
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#57534e" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAdd}
                disabled={saving || !area.trim() || !guidance.trim()}
                className="rounded-lg px-3 py-1.5"
                style={{ backgroundColor: colors.primary, opacity: saving || !area.trim() || !guidance.trim() ? 0.5 : 1 }}
              >
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>
                  {saving ? "Saving…" : "Add"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {editable && !adding ? (
        <Pressable onPress={() => setAdding(true)} className="mt-3 self-start" hitSlop={6}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>+ Add limitation</Text>
        </Pressable>
      ) : null}

      {!compact && list.length > 0 ? (
        <Text className="mt-3 text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 11.5 }}>
          Shown in the SPC builder when you program for them.
        </Text>
      ) : null}
    </View>
  );
}
