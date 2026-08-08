import { useState, useCallback } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listClientsForCoach } from "../../../lib/nutrition/clients";
import {
  listOwnNutritionAssignments,
  addNutritionAssignment,
  updateNutritionAssignment,
  removeNutritionAssignment,
} from "../../../lib/payroll/nutritionAssignments";
import { toastError, toastSuccess } from "../../../lib/toast";
import { confirmRemoveQuestion } from "../../../lib/confirmDialog";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";

const isWeb = Platform.OS === "web";

export default function PayrollNutrition() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";

  const [clients, setClients] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [billingDay, setBillingDay] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingDay, setEditingDay] = useState({});

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [clientList, own] = await Promise.all([listClientsForCoach(profile.id), listOwnNutritionAssignments(profile.id)]);
      setClients(clientList);
      setAssignments(own);
    } catch (err) {
      toastError("Failed to load", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (profile && !isAdmin && !profile.can_view_nutrition) {
    return <Redirect href="/(coach)/payroll" />;
  }

  const assignedClientIds = new Set(assignments.map((a) => a.client_id));
  const unassignedClients = clients.filter((c) => !assignedClientIds.has(c.id));

  const handleAdd = async () => {
    const day = Number(billingDay);
    if (!selectedClientId) {
      toastError("Pick a client");
      return;
    }
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      toastError("Billing day must be between 1 and 31");
      return;
    }
    const client = clients.find((c) => c.id === selectedClientId);
    setSubmitting(true);
    try {
      await addNutritionAssignment(profile.id, client, day);
      toastSuccess(`${client.name} added`);
      setSelectedClientId("");
      setBillingDay("");
      await load();
    } catch (err) {
      toastError("Failed to add", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateDay = async (assignment) => {
    const day = Number(editingDay[assignment.id]);
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      toastError("Billing day must be between 1 and 31");
      return;
    }
    try {
      await updateNutritionAssignment(assignment.id, { billing_day_of_month: day });
      toastSuccess("Updated");
      setEditingDay((prev) => {
        const next = { ...prev };
        delete next[assignment.id];
        return next;
      });
      await load();
    } catch (err) {
      toastError("Failed to update", err);
    }
  };

  const handleRemove = async (assignment) => {
    const confirmed = await confirmRemoveQuestion(assignment.client_name);
    if (!confirmed) return;
    try {
      await removeNutritionAssignment(assignment.id);
      await load();
    } catch (err) {
      toastError("Failed to remove", err);
    }
  };

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white px-8 pt-8" contentContainerStyle={{ paddingBottom: 40 }}>
        {Platform.OS !== "web" ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/payroll"))} className="mb-4 self-start">
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Payroll
        </Text>
        <PayrollTabBar active="nutrition" profile={profile} />

        <Text className="mb-5 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Set which day of the month each of your 1:1 Nutrition clients' billing recurs — when finalizing a pay
          period, you'll confirm anyone whose day falls inside it before it's added to your payroll.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            {unassignedClients.length > 0 ? (
              <View className="mb-8 max-w-xl rounded-2xl border border-stone-200 p-5">
                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                  Client
                </Text>
                {isWeb ? (
                  <select
                    value={selectedClientId}
                    onChange={(e) => setSelectedClientId(e.target.value)}
                    style={{ fontFamily: fonts.sans, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: "1px solid #d6d3d1", marginBottom: 12 }}
                  >
                    <option value="">Select a client…</option>
                    {unassignedClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <View className="mb-3 flex-row flex-wrap gap-2">
                    {unassignedClients.map((c) => {
                      const active = c.id === selectedClientId;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => setSelectedClientId(c.id)}
                          className="rounded-full border px-3 py-2"
                          style={{ borderColor: active ? colors.primary : "#d6d3d1", backgroundColor: active ? "#fdf6f2" : "white" }}
                        >
                          <Text style={{ fontFamily: fonts.sansMedium, color: active ? colors.primaryOnWhite : "#57534e", fontSize: 13 }}>{c.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                  Billing day of month
                </Text>
                <TextInput
                  value={billingDay}
                  onChangeText={setBillingDay}
                  placeholder="e.g. 11"
                  keyboardType="decimal-pad"
                  inputAccessoryViewID={NUMERIC_DONE_ID}
                  className="mb-4 rounded-lg border border-stone-300 px-3 py-2.5"
                  style={{ fontFamily: fonts.sans, maxWidth: 120 }}
                />
                <Pressable
                  onPress={handleAdd}
                  disabled={submitting}
                  className="items-center self-start rounded-lg px-5 py-3"
                  style={{ backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }}
                >
                  <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                    {submitting ? "Adding…" : "Add client"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              Your 1:1 Nutrition clients
            </Text>
            {assignments.length === 0 ? (
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                None added yet.
              </Text>
            ) : (
              assignments.map((a) => (
                <View key={a.id} className="mb-2 max-w-xl flex-row items-center justify-between rounded-xl border border-stone-200 p-4">
                  <View className="flex-1 pr-3">
                    <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{a.client_name}</Text>
                    {editingDay[a.id] !== undefined ? (
                      <View className="mt-1.5 flex-row items-center gap-2">
                        <TextInput
                          value={editingDay[a.id]}
                          onChangeText={(v) => setEditingDay((prev) => ({ ...prev, [a.id]: v }))}
                          keyboardType="decimal-pad"
                          inputAccessoryViewID={NUMERIC_DONE_ID}
                          className="rounded-lg border border-stone-300 px-2 py-1.5"
                          style={{ fontFamily: fonts.sans, width: 60 }}
                        />
                        <Pressable onPress={() => handleUpdateDay(a)}>
                          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 12 }}>Save</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={() => setEditingDay((prev) => ({ ...prev, [a.id]: String(a.billing_day_of_month) }))}>
                        <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                          Billing day {a.billing_day_of_month} · tap to edit
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <Pressable onPress={() => handleRemove(a)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color="#a8a29e" />
                  </Pressable>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
