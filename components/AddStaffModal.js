import { useEffect, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, Alert } from "react-native";
import { SegmentedControl } from "./SegmentedControl";
import { fonts } from "../lib/theme";

const ROLE_OPTIONS = [
  { key: "coach", label: "Coach" },
  { key: "admin", label: "Admin" },
];

// Invites a new coach/admin account (or promotes an existing auth user's
// email to one, if they already have a login from the shared Nutrition
// Tracker auth project) — see inviteStaffMember / the invite-staff Edge
// Function for why this can't just be a plain insert like linking a member.
export function AddStaffModal({ visible, initialRole, onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(initialRole ?? "coach");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setName("");
      setEmail("");
      setRole(initialRole ?? "coach");
    }
  }, [visible, initialRole]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), email: email.trim(), role });
      onClose();
    } catch (err) {
      Alert.alert("Couldn't add", err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white p-6">
          <Text className="mb-1 text-xl text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
            Add staff account
          </Text>
          <Text className="mb-4 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Sends an email invite to set a password. Module access (SPC/Nutrition/Exercise Library) defaults to on and can be adjusted after.
          </Text>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Jordan Smith"
            className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans }}
          />

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="jordan@kovastrength.com"
            autoCapitalize="none"
            keyboardType="email-address"
            className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans }}
          />

          <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Role
          </Text>
          <View className="mb-6">
            <SegmentedControl segments={ROLE_OPTIONS} activeKey={role} onSelect={setRole} />
          </View>

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-3">
              <Text style={{ fontFamily: fonts.sansMedium }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving || !name.trim() || !email.trim()}
              className="rounded-lg bg-primary px-4 py-3 disabled:opacity-50"
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {saving ? "Sending…" : "Send invite"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
