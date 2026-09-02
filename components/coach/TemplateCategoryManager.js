import { useState } from "react";
import { View, Text, TextInput, Pressable, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../../lib/theme";
import { toastError } from "../../lib/toast";
import { confirmDeleteTemplateCategory } from "../../lib/confirmDialog";

// Add, rename and remove the library's own category labels (0110). Before
// this the list was a two-value CHECK in the database, so a coach inventing
// a third use ("welcome week") needed a migration.
//
// A category names what a template is FOR. It says nothing about how the
// template gets assigned — a welcome week is a single session, an away
// block is several across weeks, and both live in this same library.
export function TemplateCategoryManager({ visible, categories, counts, onClose, onChanged, api }) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await api.createTemplateCategory({ name, position: categories.length });
      setNewName("");
      await onChanged();
    } catch (err) {
      toastError("Couldn't add that category", err);
    } finally {
      setBusy(false);
    }
  };

  // Enter fires onSubmitEditing and then onBlur as the field unmounts, so
  // without a guard one keypress saves twice. A ref would be the usual fix;
  // here clearing `editing` first is enough because both handlers read it.
  const commitRename = async (category) => {
    const name = draft.trim();
    setEditing(null);
    if (!name || name === category.name) return;
    try {
      await api.renameTemplateCategory(category.id, name);
      await onChanged();
    } catch (err) {
      toastError("Couldn't rename that category", err);
    }
  };

  const handleDelete = async (category) => {
    const count = counts[category.id] ?? 0;
    const proceed = await confirmDeleteTemplateCategory(category.name, count);
    if (!proceed) return;
    try {
      await api.deleteTemplateCategory(category.id);
      await onChanged();
    } catch (err) {
      toastError("Couldn't delete that category", err);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white p-6" style={{ maxHeight: "85%" }}>
          <Text className="mb-1 text-xl" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
            Categories
          </Text>
          <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
            Labels for grouping the library. Deleting one never deletes the templates in it, they just become
            uncategorised.
          </Text>

          <ScrollView style={{ flexShrink: 1 }}>
            {categories.map((category) => {
              const count = counts[category.id] ?? 0;
              return (
                <View
                  key={category.id}
                  className="mb-2 flex-row items-center rounded-lg border border-stone-200 px-3 py-2.5"
                >
                  {editing === category.id ? (
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      onSubmitEditing={() => commitRename(category)}
                      onBlur={() => commitRename(category)}
                      autoFocus
                      className="flex-1"
                      style={{ fontFamily: fonts.sansMedium, minWidth: 0 }}
                    />
                  ) : (
                    <Pressable
                      className="flex-1"
                      onPress={() => {
                        setDraft(category.name);
                        setEditing(category.id);
                      }}
                      style={{ minWidth: 0 }}
                    >
                      <Text style={{ fontFamily: fonts.sansMedium }} numberOfLines={1}>
                        {category.name}
                      </Text>
                      <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
                        {count} {count === 1 ? "template" : "templates"}
                      </Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => handleDelete(category)}
                    hitSlop={10}
                    accessibilityLabel={`Delete category ${category.name}`}
                    style={{ marginLeft: 8 }}
                  >
                    <Ionicons name="trash-outline" size={17} color={colors.muted} />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>

          <View className="mt-3 flex-row items-center gap-2">
            <TextInput
              value={newName}
              onChangeText={setNewName}
              onSubmitEditing={handleAdd}
              placeholder="New category"
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2.5"
              style={{ fontFamily: fonts.sans, minWidth: 0 }}
            />
            <Pressable
              onPress={handleAdd}
              disabled={busy || !newName.trim()}
              style={{ opacity: busy || !newName.trim() ? 0.5 : 1 }}
              className="rounded-lg bg-primary px-4 py-2.5"
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                Add
              </Text>
            </Pressable>
          </View>

          <Pressable onPress={onClose} className="mt-4 rounded-lg border border-stone-300 px-4 py-3">
            <Text className="text-center" style={{ fontFamily: fonts.sansMedium }}>
              Done
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
