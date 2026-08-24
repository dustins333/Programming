import { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, FlatList } from "react-native";
import { muscleGroupLabel } from "../lib/programming/exercises";

// onCreateNew (optional): renders a "+ New" button beside the search box —
// for the coach who searches, finds the lift isn't in the library yet, and
// used to have to close this, add it from the sidebar, and reopen. Gated by
// the caller on can_view_exercise_library; when absent the button never
// renders.
export function ExercisePickerModal({ visible, library, onClose, onPick, onCreateNew }) {
  const [search, setSearch] = useState("");

  // The Modal stays mounted between opens, so without this the last
  // search a coach typed is still sitting in the box (and still filtering
  // the list) the next time they hit "+ Insert exercise" — every insert
  // after the first started pre-filtered to the wrong movement.
  useEffect(() => {
    if (visible) setSearch("");
  }, [visible]);

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
          <View className="mb-3 flex-row items-center" style={{ gap: 8 }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search…"
              className="flex-1 rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: "Montserrat_400Regular" }}
            />
            {onCreateNew ? (
              <Pressable
                onPress={() => onCreateNew(search)}
                accessibilityLabel="Create a new exercise and insert it"
                className="rounded-lg px-4 py-3"
                style={{ backgroundColor: "#a46a57" }}
              >
                <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>＋ New</Text>
              </Pressable>
            ) : null}
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={{ maxHeight: 320 }}
            ListEmptyComponent={
              <Text className="py-3 text-sm text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
                {onCreateNew ? "Nothing matches — ＋ New creates it and drops it straight into this session." : "Nothing matches."}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onPick(item);
                  onClose();
                }}
                className="border-b border-stone-100 py-3"
              >
                <Text style={{ fontFamily: "Montserrat_500Medium" }}>{item.name}</Text>
                <Text className="text-xs text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
                  {item.type === "warmup" ? "warm-up" : item.muscle_group?.map(muscleGroupLabel).join(", ") ?? ""}
                </Text>
              </Pressable>
            )}
          />
          <Pressable onPress={onClose} className="mt-4 rounded-lg border border-stone-300 px-4 py-3">
            <Text className="text-center" style={{ fontFamily: "Montserrat_500Medium" }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
