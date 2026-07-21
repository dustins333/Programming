import { useState } from "react";
import { Modal, View, Text, TextInput, Pressable } from "react-native";

const emptyForm = { id: "", name: "", email: "", phone: "" };

export function LinkMemberModal({ visible, onClose, onSubmit }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit(form);
      setForm(emptyForm);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
          <Text className="mb-1 text-xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            Link existing account
          </Text>
          <Text className="mb-4 text-xs text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
            Create the login first in the Supabase dashboard (Authentication → Users → Add user), then paste its UUID here to
            create their Kova Strength profile. A proper email-invite flow is coming later.
          </Text>

          {["id", "name", "email", "phone"].map((field) => (
            <View key={field} className="mb-3">
              <Text className="mb-1 text-sm capitalize text-neutral-700" style={{ fontFamily: "Montserrat_500Medium" }}>
                {field === "id" ? "Auth user UUID" : field}
              </Text>
              <TextInput
                value={form[field]}
                onChangeText={(v) => setForm((f) => ({ ...f, [field]: v }))}
                autoCapitalize="none"
                className="rounded-lg border border-neutral-300 px-4 py-3"
                style={{ fontFamily: "Montserrat_400Regular" }}
              />
            </View>
          ))}

          <View className="mt-2 flex-row justify-end gap-3">
            <Pressable onPress={onClose} className="rounded-lg border border-neutral-300 px-4 py-3">
              <Text style={{ fontFamily: "Montserrat_500Medium" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving || !form.id || !form.name || !form.email}
              className="rounded-lg bg-primary px-4 py-3 disabled:opacity-50"
            >
              <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                {saving ? "Linking…" : "Link account"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
