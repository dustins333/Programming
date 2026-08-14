import { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { listMembers } from "../../lib/programming/clients";
import { createOrReactivateClient } from "../../lib/nutrition/clients";
import { toastError, toastSuccess } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";

// "+ Enroll client" on the Nutrition queue (coach web v2, screen 17).
//
// Nutrition enrollment already existed — as a switch buried on the client's
// programming page, which is the wrong place to look for it when you're
// standing in the nutrition module. Same underlying call
// (createOrReactivateClient), reachable from where the job actually starts.
//
// Search is by name, not email: an admin is far more likely to recognise the
// person than their address, and a mistyped address here would enroll the
// wrong person silently. Anyone who already has a nutrition row is excluded
// outright rather than shown and rejected on tap.
export function EnrollClientModal({ visible, existingClientIds, onClose, onEnrolled }) {
  const [members, setMembers] = useState(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setLoadError(null);
    listMembers()
      .then(setMembers)
      .catch((err) => setLoadError(err.message ?? String(err)));
  }, [visible]);

  const candidates = useMemo(() => {
    if (!members) return [];
    const term = query.trim().toLowerCase();
    return members
      .filter((m) => !existingClientIds.has(m.id))
      .filter((m) => !term || (m.name ?? "").toLowerCase().includes(term) || (m.email ?? "").toLowerCase().includes(term))
      .slice(0, 40);
  }, [members, query, existingClientIds]);

  const handleEnroll = async (member) => {
    setBusyId(member.id);
    try {
      await createOrReactivateClient({ userId: member.id, name: member.name, email: member.email, phone: member.phone });
      toastSuccess(`${member.name} enrolled — set her up on the Onboarding tab`);
      await onEnrolled(member.id);
      onClose();
    } catch (err) {
      toastError("Failed to enroll", err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <View className="w-full rounded-2xl bg-white" style={{ maxWidth: 460, maxHeight: "80%" }}>
          <View className="px-5 pb-3 pt-5">
            <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.primary }}>Enroll a nutrition client</Text>
            <Text className="mt-1" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
              Anyone already on nutrition is left out of this list.
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name"
              placeholderTextColor="#c9c4bd"
              className="mt-3 rounded-lg px-3.5 py-3"
              style={{ borderWidth: 1, borderColor: "#ddd6cd", fontFamily: fonts.sans, fontSize: 14 }}
            />
          </View>

          <ScrollView className="px-5" style={{ maxHeight: 340 }}>
            {loadError ? (
              <Text className="py-6" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
                Couldn&apos;t load the member list: {loadError}
              </Text>
            ) : !members ? (
              <View className="items-center py-8">
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : candidates.length === 0 ? (
              <Text className="py-6" style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>
                {query.trim() ? "No members match that." : "Everyone is already enrolled."}
              </Text>
            ) : (
              candidates.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => handleEnroll(member)}
                  disabled={busyId !== null}
                  className="flex-row items-center justify-between py-3"
                  style={{ borderBottomWidth: 1, borderBottomColor: "#f6f3ef", opacity: busyId && busyId !== member.id ? 0.4 : 1 }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#2a211c" }}>
                      {member.name}
                    </Text>
                    <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 1 }}>
                      {member.email}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
                    {busyId === member.id ? "Enrolling…" : "Enroll →"}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>

          <View className="flex-row justify-end px-5 py-4">
            <Pressable onPress={onClose} className="rounded-lg border px-4 py-2.5" style={{ borderColor: "#d6d3d1" }}>
              <Text style={{ fontFamily: fonts.sansMedium, color: "#57534e" }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
