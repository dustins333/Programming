import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { fonts, colors } from "../lib/theme";

// Read-only "what's in this lift" popup for the member Today overview — no
// logging inputs here, that's still My Fitness's job. Callers pre-format
// warmups/exercises into plain label/detail strings so this component
// stays shape-agnostic between group's {sets, reps, tempo} and SPC's
// per-week {sets, reps, rest} exercise rows.
export function SessionPreviewModal({ visible, onClose, title, subtitle, loading, warmups, exercises }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center bg-black/40 px-4">
        {/* Swallows the tap so pressing inside the card doesn't bubble up
            to the backdrop's onClose — on web a Pressable's onClick is a
            real DOM event, so nested clicks would otherwise close it. */}
        <Pressable onPress={(e) => e.stopPropagation?.()} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
          <View className="mb-4 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 17 }} className="text-stone-700">
                {title}
              </Text>
              {subtitle ? (
                <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text className="text-stone-400">✕</Text>
            </Pressable>
          </View>

          {loading ? (
            <View className="items-center py-8">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ScrollView>
              {warmups?.length > 0 ? (
                <Text className="mb-3 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Warm-up: {warmups.join(", ")}
                </Text>
              ) : null}

              <View className="rounded-xl px-3.5" style={{ backgroundColor: "#faf7f4", borderWidth: 1, borderColor: "#f0ebe6" }}>
                {(exercises ?? []).map((ex, i) => (
                  <View
                    key={ex.id}
                    className="flex-row items-center justify-between py-2.5"
                    style={i < exercises.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f0ebe6" } : undefined}
                  >
                    <Text className="text-stone-700" style={{ fontFamily: fonts.sansMedium, fontSize: 14 }}>
                      {ex.name}
                    </Text>
                    <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                      {ex.detail}
                    </Text>
                  </View>
                ))}
                {exercises?.length === 0 ? (
                  <Text className="py-3 text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                    Nothing here yet.
                  </Text>
                ) : null}
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
