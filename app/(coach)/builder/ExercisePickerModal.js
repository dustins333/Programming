import { useMemo, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, FlatList } from "react-native";

export function ExercisePickerModal({ visible, library, onClose, onPick }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return library;
    return library.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
  }, [library, search]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="max-h-[85vh] w-full max-w-md rounded-2xl bg-white p-6">
          <Text className="mb-3 text-xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            Insert exercise
          </Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search…"
            className="mb-3 rounded-lg border border-neutral-300 px-4 py-3"
            style={{ fontFamily: "Montserrat_400Regular" }}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={{ maxHeight: 320 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onPick(item);
                  onClose();
                }}
                className="border-b border-neutral-100 py-3"
              >
                <Text style={{ fontFamily: "Montserrat_500Medium" }}>{item.name}</Text>
                <Text className="text-xs text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
                  {item.muscle_group.replace("_", " ")}
                </Text>
              </Pressable>
            )}
          />
          <Pressable onPress={onClose} className="mt-4 rounded-lg border border-neutral-300 px-4 py-3">
            <Text className="text-center" style={{ fontFamily: "Montserrat_500Medium" }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
