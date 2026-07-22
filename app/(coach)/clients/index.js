import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, Alert } from "react-native";
import { Link } from "expo-router";
import { listMembers, linkMemberByAuthId, listAssignments, assignProgram } from "../../../lib/programming/clients";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import { listNutritionClients, assignNutritionClient, setNutritionStatus } from "../../../lib/nutrition/clients";
import { listSpcClients, assignSpcClient, setSpcStatus } from "../../../lib/programming/spcClients";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { LinkMemberModal } from "./LinkMemberModal";

export default function Clients() {
  const { profile } = useAuth();
  const [members, setMembers] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [programs, setPrograms] = useState(null);
  const [nutritionClients, setNutritionClients] = useState(null);
  const [spcClients, setSpcClients] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

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

  return (
    <View className="flex-1 bg-white px-6 py-8">
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-2xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
          Clients
        </Text>
        <Pressable onPress={() => setModalVisible(true)} className="rounded-lg bg-primary px-4 py-2.5">
          <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            + Link account
          </Text>
        </Pressable>
      </View>

      {!members ? (
        <ActivityIndicator color="#a46a57" />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <Text className="text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
              No members linked yet.
            </Text>
          }
          renderItem={({ item }) => {
            const assignment = assignmentFor(item.id);
            const nutritionAssignment = nutritionFor(item.id);
            const nutritionActive = nutritionAssignment?.status === "active";
            const spcAssignment = spcFor(item.id);
            const spcActive = spcAssignment && spcAssignment.status !== "paused";
            return (
              <View className="mb-2 rounded-lg border border-neutral-200 px-4 py-3">
                <Text style={{ fontFamily: "Montserrat_500Medium" }}>{item.name}</Text>
                <Text className="mb-2 text-xs text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
                  {item.email}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={() => handleAssign(item.id, null)}
                    className={`rounded-full border px-3 py-1.5 ${
                      !assignment?.group_program_id ? "border-primary bg-primary" : "border-neutral-300"
                    }`}
                  >
                    <Text
                      className={!assignment?.group_program_id ? "text-white" : "text-neutral-700"}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      none
                    </Text>
                  </Pressable>
                  {(programs ?? []).map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => handleAssign(item.id, p.id)}
                      className={`rounded-full border px-3 py-1.5 ${
                        assignment?.group_program_id === p.id ? "border-primary bg-primary" : "border-neutral-300"
                      }`}
                    >
                      <Text
                        className={assignment?.group_program_id === p.id ? "text-white" : "text-neutral-700"}
                        style={{ fontFamily: "Montserrat_400Regular" }}
                      >
                        {p.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View className="mt-3 flex-row items-center gap-3">
                  <Pressable
                    onPress={() => handleNutritionToggle(item.id, nutritionActive)}
                    className={`rounded-full border px-3 py-1.5 ${
                      nutritionActive ? "border-primary bg-primary" : "border-neutral-300"
                    }`}
                  >
                    <Text
                      className={nutritionActive ? "text-white" : "text-neutral-700"}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {nutritionActive
                        ? "nutrition: active"
                        : nutritionAssignment
                          ? "nutrition: paused"
                          : "nutrition: none"}
                    </Text>
                  </Pressable>
                  {nutritionAssignment ? (
                    <Link
                      href={`/(coach)/nutrition/clients/${item.id}`}
                      className="text-accent"
                      style={{ fontFamily: "Montserrat_500Medium" }}
                    >
                      View nutrition
                    </Link>
                  ) : null}
                </View>

                <View className="mt-3 flex-row items-center gap-3">
                  <Pressable
                    onPress={() => handleSpcToggle(item.id, spcActive)}
                    className={`rounded-full border px-3 py-1.5 ${
                      spcActive ? "border-primary bg-primary" : "border-neutral-300"
                    }`}
                  >
                    <Text
                      className={spcActive ? "text-white" : "text-neutral-700"}
                      style={{ fontFamily: "Montserrat_400Regular" }}
                    >
                      {spcActive ? "SPC: active" : spcAssignment ? "SPC: paused" : "SPC: none"}
                    </Text>
                  </Pressable>
                  {spcAssignment ? (
                    <Link
                      href={`/(coach)/spc/${item.id}`}
                      className="text-accent"
                      style={{ fontFamily: "Montserrat_500Medium" }}
                    >
                      View SPC
                    </Link>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}

      <LinkMemberModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleLink} />
    </View>
  );
}
