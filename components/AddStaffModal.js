import { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, TextInput, Pressable } from "react-native";
import { SegmentedControl } from "./SegmentedControl";
import { fonts, colors } from "../lib/theme";
import { listMembers } from "../lib/programming/clients";

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
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);

  useEffect(() => {
    if (visible) {
      setName("");
      setEmail("");
      setRole(initialRole ?? "coach");
      setSearch("");
      setSelectedClient(null);
      listMembers()
        .then(setClients)
        .catch(() => setClients([]));
    }
  }, [visible, initialRole]);

  // Existing-client search is purely a fill-the-form convenience — invite-staff
  // itself is what actually matches by email and promotes rather than
  // duplicates, this just removes the "type the email exactly right" risk.
  // Searches by name only — a coach adding staff is much more likely to
  // remember/recognize a client's name than their exact email address.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || selectedClient) return [];
    return clients.filter((c) => c.name?.toLowerCase().includes(q)).slice(0, 6);
  }, [search, clients, selectedClient]);

  const handlePickClient = (client) => {
    setSelectedClient(client);
    setName(client.name ?? "");
    setEmail(client.email ?? "");
    setSearch("");
  };

  const handleClearClient = () => {
    setSelectedClient(null);
    setName("");
    setEmail("");
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), email: email.trim(), role });
      onClose();
    } catch {
      // onSubmit (settings.js's handleAddStaff) already reports the error
      // via toast and re-throws just to keep this modal open — nothing
      // more to show here.
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

          {selectedClient ? (
            <View className="mb-4 flex-row items-center justify-between rounded-lg bg-stone-100 px-4 py-3">
              <Text className="mr-2 flex-1 text-sm text-stone-700" style={{ fontFamily: fonts.sans }}>
                Promoting existing client{" "}
                <Text style={{ fontFamily: fonts.sansSemiBold }}>{selectedClient.name}</Text> — same login, no new
                account.
              </Text>
              <Pressable onPress={handleClearClient}>
                <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>Change</Text>
              </Pressable>
            </View>
          ) : (
            <View className="mb-4">
              <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                Existing client (optional)
              </Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name to promote a client"
                className="rounded-lg border border-stone-300 px-4 py-3"
                style={{ fontFamily: fonts.sans }}
              />
              {matches.length > 0 && (
                <View className="mt-1 overflow-hidden rounded-lg border border-stone-200 bg-white">
                  {matches.map((c, i) => (
                    <Pressable
                      key={c.id}
                      onPress={() => handlePickClient(c)}
                      className="px-4 py-2"
                      style={i < matches.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f5f5f4" } : null}
                    >
                      <Text style={{ fontFamily: fonts.sansMedium }}>{c.name}</Text>
                      <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                        {c.email}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Jordan Smith"
            editable={!selectedClient}
            className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans, opacity: selectedClient ? 0.6 : 1 }}
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
            editable={!selectedClient}
            className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans, opacity: selectedClient ? 0.6 : 1 }}
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
