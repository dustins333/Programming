import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../../../lib/theme";

// SPC builder's warm-up "Copy to...": pick which of the program's other
// sessions get this session's warm-up. A plain one-time copy, no live link,
// because most real SPC programs start from a shared warm-up and then tweak
// it per session. Everything starts ticked, since "the same warm-up in every
// session" is the ask this was built for.
//
// `targets` is [{ id, label, warmupCount }]. warmupCount is null while the
// counts are still loading.
export function CopyWarmupModal({ visible, targets, loading, saving, onClose, onCopy }) {
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    if (visible) setSelected(new Set(targets.map((t) => t.id)));
  }, [visible, targets]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const count = selected.size;
  const disabled = saving || loading || count === 0;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-sm rounded-2xl bg-white p-6" style={{ maxHeight: "85%" }}>
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 19 }} className="mb-1">
            Copy warm-up to...
          </Text>
          <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
            Replaces the warm-up in each session you pick. You can still change any of them after.
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
              {targets.map((t) => {
                const on = selected.has(t.id);
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => toggle(t.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    className="flex-row items-center rounded-xl border px-4 py-3"
                    style={{ borderColor: on ? colors.primary : "#ece7e1", gap: 12 }}
                  >
                    <Ionicons name={on ? "checkbox" : "square-outline"} size={20} color={on ? colors.primary : "#c9c4bd"} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
                        {t.label}
                      </Text>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 12 }} className="text-stone-400">
                        {t.warmupCount
                          ? `Has ${t.warmupCount} warm-up move${t.warmupCount === 1 ? "" : "s"}, will be replaced`
                          : "No warm-up yet"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View className="mt-5 flex-row justify-end" style={{ gap: 10 }}>
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-2.5">
              <Text className="text-stone-600" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onCopy([...selected])}
              disabled={disabled}
              className="rounded-lg px-4 py-2.5"
              style={{ opacity: disabled ? 0.5 : 1, backgroundColor: colors.primary }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>
                {saving ? "Copying..." : count === 0 ? "Pick a session" : `Copy to ${count} session${count === 1 ? "" : "s"}`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
