import { Modal, View, Text, Pressable, FlatList } from "react-native";
import { fonts } from "../lib/theme";

const CATEGORY_LABELS = { away: "Away programming", trial: "Trial sessions" };

// Picks one of the coach's reusable templates to copy onto this client as a
// one-off — see lib/programming/templates.js / oneOffWorkouts.js for the
// underlying copy operation.
export function AssignOneOffModal({ visible, templates, onClose, onPick }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="max-h-[85vh] w-full max-w-md rounded-2xl bg-white p-6">
          <Text className="mb-3 text-xl text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
            Assign one-off workout
          </Text>
          {templates.length === 0 ? (
            <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
              No templates yet — create one from the SPC page's Templates link first.
            </Text>
          ) : (
            <FlatList
              data={templates}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onPick(item);
                    onClose();
                  }}
                  className="border-b border-stone-100 py-3"
                >
                  <Text style={{ fontFamily: fonts.sansMedium }}>{item.name}</Text>
                  <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </Text>
                </Pressable>
              )}
            />
          )}
          <Pressable onPress={onClose} className="mt-4 rounded-lg border border-stone-300 px-4 py-3">
            <Text className="text-center" style={{ fontFamily: fonts.sansMedium }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
