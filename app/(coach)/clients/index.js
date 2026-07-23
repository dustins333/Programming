import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, FlatList, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { listMembers, linkMemberByAuthId } from "../../../lib/programming/clients";
import { LinkMemberModal } from "../../../components/LinkMemberModal";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name }) {
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: 40, height: 40, backgroundColor: "#fdf6f2" }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>
        {initials(name)}
      </Text>
    </View>
  );
}

export default function Clients() {
  const router = useRouter();
  const [members, setMembers] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setMembers(await listMembers());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleLink = async (form) => {
    try {
      await linkMemberByAuthId(form);
      await load();
    } catch (err) {
      Alert.alert("Failed to link account", err.message ?? String(err));
      throw err;
    }
  };

  const filteredMembers = useMemo(() => {
    if (!members) return [];
    if (!search.trim()) return members;
    const q = search.trim().toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }, [members, search]);

  return (
    <CoachShell>
      <View className="flex-1 bg-white px-6 py-8" style={{ maxWidth: 720 }}>
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: "#a46a57" }}>
              Clients
            </Text>
            {members ? (
              <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                {filteredMembers.length} of {members.length}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={() => setModalVisible(true)} className="rounded-lg bg-primary px-4 py-2.5">
            <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              + Link account
            </Text>
          </Pressable>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or email…"
          className="mb-2 rounded-lg border border-stone-300 px-4 py-2.5"
          style={{ fontFamily: fonts.sans, maxWidth: 360 }}
        />

        {!members ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <FlatList
            data={filteredMembers}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text className="mt-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
                {members.length === 0 ? "No members linked yet." : "No clients match your search."}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/(coach)/clients/${item.id}`)}
                className="flex-row items-center gap-3 border-b border-stone-100 py-3"
              >
                <Avatar name={item.name} />
                <View className="flex-1">
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14 }} className="text-stone-700">
                    {item.name}
                  </Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12 }} className="text-stone-500">
                    {item.email}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#c7c2be" />
              </Pressable>
            )}
          />
        )}

        <LinkMemberModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleLink} />
      </View>
    </CoachShell>
  );
}
