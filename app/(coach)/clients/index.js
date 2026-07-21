import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, Alert } from "react-native";
import { listMembers, linkMemberByAuthId, listAssignments, assignProgram } from "../../../lib/programming/clients";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import { LinkMemberModal } from "./LinkMemberModal";

export default function Clients() {
  const [members, setMembers] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [programs, setPrograms] = useState(null);
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

  const assignmentFor = (userId) => assignments?.find((a) => a.user_id === userId);

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
              </View>
            );
          }}
        />
      )}

      <LinkMemberModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleLink} />
    </View>
  );
}
