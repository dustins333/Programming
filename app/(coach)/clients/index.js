import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, FlatList, ActivityIndicator } from "react-native";
import { toastError } from "../../../lib/toast";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { linkMemberByAuthId } from "../../../lib/programming/clients";
import { loadClientsRoster } from "../../../lib/programming/clientsRoster";
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
  const params = useLocalSearchParams();
  const [state, setState] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState(typeof params.program === "string" ? params.program : "");
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setState(await loadClientsRoster());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  // Native's Tabs navigator keeps this list mounted across tab switches —
  // useFocusEffect re-fetches on every focus so a program toggle made on a
  // client's detail page shows up here without a manual pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Same "apply once on arrival, don't fight a manual clear" rule as the
  // web version — a dashboard tile's `?program=` deep link previously did
  // nothing at all here since this screen never read the param.
  useEffect(() => {
    if (typeof params.program === "string") {
      setProgramFilter(params.program);
    }
  }, [params.program]);

  const handleLink = async (form) => {
    try {
      await linkMemberByAuthId(form);
      await load();
    } catch (err) {
      toastError("Failed to link account", err);
      throw err;
    }
  };

  const programLabel = useMemo(() => {
    if (!programFilter || !state) return null;
    if (programFilter === "unassigned") return "Unassigned";
    if (programFilter === "spc") return "SPC";
    if (programFilter === "nutrition") return "Nutrition";
    return state.programs.find((p) => p.id === programFilter)?.name ?? programFilter;
  }, [programFilter, state]);

  const filteredMembers = useMemo(() => {
    if (!state) return [];
    let rows = state.rows;
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    if (programFilter === "unassigned") rows = rows.filter((m) => m.unassigned);
    else if (programFilter) rows = rows.filter((m) => m.programKeys.has(programFilter));
    return rows;
  }, [state, search, programFilter]);

  return (
    <CoachShell>
      <View className="flex-1 bg-white px-6 py-8" style={{ maxWidth: 720 }}>
        <View className="mb-4 flex-row items-center justify-between">
          <View>
            <Text className="text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: "#a46a57" }}>
              Clients
            </Text>
            {state ? (
              <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                {filteredMembers.length} of {state.rows.length}
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

        {programLabel ? (
          <View className="mb-2 flex-row items-center gap-2">
            <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              Filtered: {programLabel}
            </Text>
            <Pressable onPress={() => setProgramFilter("")} hitSlop={8}>
              <Text className="text-xs" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
                Clear filter
              </Text>
            </Pressable>
          </View>
        ) : null}

        {loadError ? (
          <View className="items-start mt-4">
            <Text className="mb-2 text-red-600" style={{ fontFamily: fonts.sans }}>
              Couldn't load clients: {loadError}
            </Text>
            <Pressable onPress={load}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
            </Pressable>
          </View>
        ) : !state ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <FlatList
            data={filteredMembers}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text className="mt-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
                {state.rows.length === 0 ? "No members linked yet." : "No clients match your filters."}
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
