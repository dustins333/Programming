import { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SegmentedControl } from "./SegmentedControl";
import { PERMISSION_COLUMNS } from "./StaffPermissionMatrix";
import { fonts, colors } from "../lib/theme";
import { listMembers } from "../lib/programming/clients";

const ROLE_OPTIONS = [
  { key: "coach", label: "Coach" },
  { key: "admin", label: "Admin" },
];

const emptyPermissions = () =>
  Object.fromEntries(PERMISSION_COLUMNS.map(({ field }) => [field, false]));

// One module row on step 2. The whole row is the tap target rather than
// just the box, and the box is drawn by hand instead of using a Switch so a
// tap can't register on both the row and a nested control.
function ModuleRow({ label, description, checked, onToggle }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      className="mb-2 flex-row items-center rounded-xl border px-4 py-3"
      style={{
        borderColor: checked ? "#4d6142" : "#e7e5e4",
        borderWidth: checked ? 2 : 1,
        backgroundColor: checked ? "#f5f8f1" : "#ffffff",
      }}
    >
      <View
        className="mr-3 items-center justify-center rounded-md"
        style={{
          width: 22,
          height: 22,
          borderWidth: checked ? 0 : 1.5,
          borderColor: "#d9d4cd",
          backgroundColor: checked ? "#4d6142" : "#ffffff",
        }}
      >
        {checked ? <Ionicons name="checkmark" size={14} color="#ffffff" /> : null}
      </View>
      <View className="flex-1">
        <Text className="text-sm text-stone-800" style={{ fontFamily: fonts.sansSemiBold }}>
          {label}
        </Text>
        <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

// Adds a coach/admin account in two steps: who they are, then which
// modules they get. Module access starts fully off and is chosen every
// time — the columns' own defaults (0015) exist for backwards
// compatibility, not as a sensible starting point for a new hire.
//
// Promoting someone who already has a login (a member being upgraded, or
// anyone with an account from the shared Nutrition Tracker auth project)
// sends no email at all — they're already in the app. See invite-staff for
// how that's decided; an invite only goes out for an email that's new to
// the whole project.
export function AddStaffModal({ visible, initialRole, onClose, onSubmit }) {
  const [step, setStep] = useState("who");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(initialRole ?? "coach");
  const [permissions, setPermissions] = useState(emptyPermissions);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);

  useEffect(() => {
    if (visible) {
      setStep("who");
      setName("");
      setEmail("");
      setRole(initialRole ?? "coach");
      setPermissions(emptyPermissions());
      setSearch("");
      setSelectedClient(null);
      listMembers()
        .then(setClients)
        .catch(() => setClients([]));
    }
  }, [visible, initialRole]);

  // Existing-client search is what turns this into a promotion rather than
  // an invite: picking someone hands invite-staff their real account id, so
  // it skips creating/emailing anything and only changes their role.
  // Searches by name only — an admin is much more likely to remember a
  // client's name than their exact email address.
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

  const togglePermission = (field) =>
    setPermissions((p) => ({ ...p, [field]: !p[field] }));

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim(),
        role,
        existingUserId: selectedClient?.id ?? null,
        // Admins pass every module regardless of the step-2 selection —
        // core.can_access_*() ignores these columns for an admin anyway, so
        // storing them off would misrepresent their access on the matrix.
        permissions: role === "admin"
          ? Object.fromEntries(PERMISSION_COLUMNS.map(({ field }) => [field, true]))
          : permissions,
      });
      onClose();
    } catch {
      // onSubmit (settings.js's handleAddStaff) already reports the error
      // via toast and re-throws just to keep this modal open — nothing
      // more to show here. Stay on the confirm step so nothing's retyped.
    } finally {
      setSaving(false);
    }
  };

  const canContinue = Boolean(name.trim() && email.trim());
  const roleLabel = role === "admin" ? "admin" : "coach";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white p-6" style={{ maxHeight: "88%" }}>
          <Text className="mb-1 text-xl text-primary" style={{ fontFamily: fonts.sansSemiBold }}>
            Add staff account
          </Text>
          <Text className="mb-4 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            {step === "who" ? "Step 1 of 2" : "Step 2 of 2"}
          </Text>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
            {step === "who" ? (
              <>
                {selectedClient ? (
                  <View className="mb-4 flex-row items-center justify-between rounded-lg bg-stone-100 px-4 py-3">
                    <Text className="mr-2 flex-1 text-sm text-stone-800" style={{ fontFamily: fonts.sansSemiBold }}>
                      {selectedClient.name}
                    </Text>
                    <Pressable onPress={handleClearClient}>
                      <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>Change</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View className="mb-4">
                    <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                      Already a client?
                    </Text>
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Search by name to upgrade their account"
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
                    <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                      Or leave this blank and enter someone new below.
                    </Text>
                  </View>
                )}

                {/* Picking a client is the whole answer to "who" — their
                    name and email come with the account, so the fields go
                    away entirely rather than sitting there greyed out. */}
                {!selectedClient && (
                  <>
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
                  </>
                )}

                <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                  Role
                </Text>
                <View className="mb-2">
                  <SegmentedControl segments={ROLE_OPTIONS} activeKey={role} onSelect={setRole} />
                </View>
              </>
            ) : (
              <>
                <View className="mb-4 rounded-lg bg-stone-100 px-4 py-3">
                  <Text className="text-sm text-stone-700" style={{ fontFamily: fonts.sans }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold }}>{name.trim()}</Text> will be added as{" "}
                    {role === "admin" ? "an admin" : "a coach"}.
                  </Text>
                </View>

                {role === "admin" ? (
                  <View className="rounded-xl border px-4 py-4" style={{ borderColor: "#e7e5e4" }}>
                    <Text className="mb-1 text-sm text-stone-800" style={{ fontFamily: fonts.sansSemiBold }}>
                      Admins have every module
                    </Text>
                    <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                      SPC, Nutrition, Library Reviewer and Ops Hours are always on for an admin, plus Settings,
                      Announcements and payroll administration. There's nothing to choose here.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text className="mb-2 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                      Module access
                    </Text>
                    {PERMISSION_COLUMNS.map(({ field, label, description }) => (
                      <ModuleRow
                        key={field}
                        label={label}
                        description={description}
                        checked={permissions[field]}
                        onToggle={() => togglePermission(field)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </ScrollView>

          <View className="mt-5 flex-row justify-end gap-3">
            <Pressable
              onPress={step === "who" ? onClose : () => setStep("who")}
              disabled={saving}
              className="rounded-lg border border-stone-300 px-4 py-3"
            >
              <Text style={{ fontFamily: fonts.sansMedium }}>{step === "who" ? "Cancel" : "‹ Back"}</Text>
            </Pressable>
            {step === "who" ? (
              <Pressable
                onPress={() => setStep("modules")}
                disabled={!canContinue} style={{ opacity: !canContinue ? 0.5 : 1 }}
                className="rounded-lg bg-primary px-4 py-3"
              >
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                  Next
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSubmit}
                disabled={saving} style={{ opacity: saving ? 0.5 : 1 }}
                className="rounded-lg bg-primary px-4 py-3"
              >
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                  {saving ? "Adding…" : `Add ${roleLabel}`}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
