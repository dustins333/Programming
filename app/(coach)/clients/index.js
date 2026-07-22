import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, FlatList, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Link } from "expo-router";
import { listMembers, linkMemberByAuthId, listAssignments, assignProgram } from "../../../lib/programming/clients";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import { listNutritionClients, assignNutritionClient, setNutritionStatus } from "../../../lib/nutrition/clients";
import { listSpcClients, assignSpcClient, setSpcStatus } from "../../../lib/programming/spcClients";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { LinkMemberModal } from "./LinkMemberModal";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

const TABLE_MIN_WIDTH = 860;
const COLS = {
  name: { flex: 1.4, minWidth: 140 },
  email: { flex: 2, minWidth: 200 },
  group: { flex: 1.6, minWidth: 190 },
  spc: { flex: 1.3, minWidth: 160 },
  nutrition: { flex: 1.3, minWidth: 160 },
};

function GroupCell({ current, programs, onPick }) {
  return (
    <View className="flex-row flex-wrap items-center gap-x-2">
      <Pressable onPress={() => onPick(null)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
        <Text style={{ fontFamily: !current ? fonts.sansSemiBold : fonts.sans, color: !current ? colors.primaryOnWhite : "#a8a29e", fontSize: 13 }}>
          None
        </Text>
      </Pressable>
      {programs.map((p) => (
        <Pressable key={p.id} onPress={() => onPick(p.id)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text
            style={{
              fontFamily: current === p.id ? fonts.sansSemiBold : fonts.sans,
              color: current === p.id ? colors.primaryOnWhite : "#a8a29e",
              fontSize: 13,
            }}
          >
            {p.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function StatusCell({ label, active, onToggle, viewHref }) {
  return (
    <View>
      <Pressable onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
        <Text style={{ fontFamily: fonts.sansMedium, color: active ? "#4d6142" : "#a8a29e", fontSize: 13 }}>
          {label}
        </Text>
      </Pressable>
      {viewHref ? (
        <Link href={viewHref} style={{ fontFamily: fonts.sans, color: "#8a5140", fontSize: 12 }}>
          View
        </Link>
      ) : null}
    </View>
  );
}

export default function Clients() {
  const { profile } = useAuth();
  const [members, setMembers] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [programs, setPrograms] = useState(null);
  const [nutritionClients, setNutritionClients] = useState(null);
  const [spcClients, setSpcClients] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const [memberRows, assignmentRows, programRows] = await Promise.all([
      listMembers(),
      listAssignments(),
      listGroupPrograms(),
    ]);
    setMembers(memberRows);
    setAssignments(assignmentRows);
    setPrograms(programRows);

    // Isolated from the Promise.all above on purpose: this client roster
    // already works today against the programming/core schemas, and
    // nutrition_clients/spc_clients living in schemas/tables that might not
    // be migrated yet shouldn't be able to break it — fall back to an empty
    // list rather than rejecting.
    try {
      setNutritionClients(await listNutritionClients());
    } catch {
      setNutritionClients([]);
    }
    try {
      setSpcClients(await listSpcClients());
    } catch {
      setSpcClients([]);
    }
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

  const handleAssign = async (userId, groupProgramId) => {
    try {
      await assignProgram(userId, groupProgramId);
      await load();
    } catch (err) {
      Alert.alert("Failed to assign program", err.message ?? String(err));
    }
  };

  const handleNutritionToggle = async (userId, active) => {
    try {
      if (active) {
        await setNutritionStatus(userId, "paused");
      } else if (nutritionFor(userId)) {
        await setNutritionStatus(userId, "active");
      } else {
        await assignNutritionClient(userId, profile.id);
      }
      await load();
    } catch (err) {
      Alert.alert("Failed to update nutrition status", err.message ?? String(err));
    }
  };

  const handleSpcToggle = async (userId, active) => {
    try {
      if (active) {
        await setSpcStatus(userId, "paused");
      } else if (spcFor(userId)) {
        await setSpcStatus(userId, "needs_printed");
      } else {
        await assignSpcClient(userId, profile.id);
      }
      await load();
    } catch (err) {
      Alert.alert("Failed to update SPC status", err.message ?? String(err));
    }
  };

  const assignmentFor = (userId) => assignments?.find((a) => a.user_id === userId);
  const nutritionFor = (userId) => nutritionClients?.find((n) => n.user_id === userId);
  const spcFor = (userId) => spcClients?.find((s) => s.user_id === userId);

  const filteredMembers = useMemo(() => {
    if (!members) return [];
    if (!search.trim()) return members;
    const q = search.trim().toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }, [members, search]);

  return (
    <CoachShell>
      <View className="flex-1 bg-white px-6 py-8">
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
          className="mb-4 rounded-lg border border-stone-300 px-4 py-2.5"
          style={{ fontFamily: fonts.sans, maxWidth: 360 }}
        />

        {!members ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator className="flex-1">
            <View style={{ minWidth: TABLE_MIN_WIDTH, flex: 1 }}>
              <View className="flex-row border-b border-stone-200 pb-2">
                <Text style={{ ...COLS.name, fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#a8a29e", textTransform: "uppercase" }}>
                  Name
                </Text>
                <Text style={{ ...COLS.email, fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#a8a29e", textTransform: "uppercase" }}>
                  Email
                </Text>
                <Text style={{ ...COLS.group, fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#a8a29e", textTransform: "uppercase" }}>
                  Group program
                </Text>
                <Text style={{ ...COLS.spc, fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#a8a29e", textTransform: "uppercase" }}>
                  SPC
                </Text>
                <Text style={{ ...COLS.nutrition, fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#a8a29e", textTransform: "uppercase" }}>
                  Nutrition
                </Text>
              </View>

              <FlatList
                data={filteredMembers}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                  <Text className="mt-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
                    {members.length === 0 ? "No members linked yet." : "No clients match your search."}
                  </Text>
                }
                renderItem={({ item }) => {
                  const assignment = assignmentFor(item.id);
                  const nutritionAssignment = nutritionFor(item.id);
                  const nutritionActive = nutritionAssignment?.status === "active";
                  const spcAssignment = spcFor(item.id);
                  const spcActive = spcAssignment && spcAssignment.status !== "paused";
                  return (
                    <View className="flex-row items-center border-b border-stone-100 py-3">
                      <Text style={{ ...COLS.name, fontFamily: fonts.sansMedium, fontSize: 13 }} className="text-stone-700">
                        {item.name}
                      </Text>
                      <Text style={{ ...COLS.email, fontFamily: fonts.sans, fontSize: 12 }} className="text-stone-500" numberOfLines={1}>
                        {item.email}
                      </Text>
                      <View style={COLS.group}>
                        <GroupCell
                          current={assignment?.group_program_id ?? null}
                          programs={programs ?? []}
                          onPick={(id) => handleAssign(item.id, id)}
                        />
                      </View>
                      <View style={COLS.spc}>
                        <StatusCell
                          label={spcActive ? "Active" : spcAssignment ? "Paused" : "—"}
                          active={spcActive}
                          onToggle={() => handleSpcToggle(item.id, spcActive)}
                          viewHref={spcAssignment ? `/(coach)/spc/${item.id}` : null}
                        />
                      </View>
                      <View style={COLS.nutrition}>
                        <StatusCell
                          label={nutritionActive ? "Active" : nutritionAssignment ? "Paused" : "—"}
                          active={nutritionActive}
                          onToggle={() => handleNutritionToggle(item.id, nutritionActive)}
                          viewHref={nutritionAssignment ? `/(coach)/nutrition/clients/${item.id}` : null}
                        />
                      </View>
                    </View>
                  );
                }}
              />
            </View>
          </ScrollView>
        )}

        <LinkMemberModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleLink} />
      </View>
    </CoachShell>
  );
}
