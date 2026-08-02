import { Modal, View, Text, Pressable, ActivityIndicator } from "react-native";
import { fonts, colors } from "../lib/theme";

// SPC History's "Print" button opens this to ask which session before
// generating the printable page — printing a whole block at once isn't
// offered anymore (see spc/print/[blockId].web.js's rework), one session
// per printed page.
export function PrintSessionPickerModal({ visible, sessionNumbers, loading, onClose, onPick }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-sm rounded-2xl bg-white p-6">
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 19 }} className="mb-1">
            Print which session?
          </Text>
          <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
            Every week's version of that session prints on one page.
          </Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : sessionNumbers.length === 0 ? (
            <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
              This block has no sessions yet.
            </Text>
          ) : (
            <View className="gap-2.5">
              {sessionNumbers.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => onPick(n)}
                  className="rounded-xl border px-4 py-3.5"
                  style={{ borderColor: "#ece7e1" }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
                    Session {n}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable onPress={onClose} className="mt-5 self-end rounded-lg border border-stone-300 px-4 py-2.5">
            <Text className="text-stone-600" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
