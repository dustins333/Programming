import { useState, useCallback, useContext, useRef } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
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
import { confirmDelete } from "../../../lib/confirmDialog";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";
import { useKeyboardHeight, useScrollToKeyboard, DONE_BAR_HEIGHT } from "../../../lib/scrollToKeyboard";

export default function PayrollNutrition() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";

  const [clients, setClients] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newDayByClient, setNewDayByClient] = useState({});
  const [addingClientId, setAddingClientId] = useState(null);
  const [editingDay, setEditingDay] = useState({});

  // Both the "needs a billing day" list and the assigned-clients list can
  // run long (a coach's whole nutrition roster) — a row's billing-day field
  // near the bottom needs real scroll room, same class of bug as every
  // other list-of-rows-with-a-field file in this pass. Refs are keyed Maps
  // since both lists are dynamic-length.
  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const newDayRowRefs = useRef(new Map());
  const editDayRowRefs = useRef(new Map());
  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const keyboardPadding = Math.max(0, occludedHeight - tabBarHeight);

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

  const handleCheckClient = async (client) => {
    const day = Number(newDayByClient[client.id]);
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      toastError("Billing day must be between 1 and 31");
      return;
    }
    setAddingClientId(client.id);
    try {
      await addNutritionAssignment(profile.id, client, day);
      toastSuccess(`${client.name} added`);
      setNewDayByClient((prev) => {
        const next = { ...prev };
        delete next[client.id];
        return next;
      });
      await load();
    } catch (err) {
      toastError("Failed to add", err);
    } finally {
      setAddingClientId(null);
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
    // Was confirmRemoveQuestion — the dialog literally asked "Remove this
    // question?" about a person's name.
    const confirmed = await confirmDelete(
      `Stop billing for ${assignment.client_name}? Their 1:1 Nutrition line won't appear in future finalizations.`,
      "Remove billing client?"
    );
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
      <ScrollView
        ref={scrollViewRef}
        style={{ backgroundColor: colors.canvas }}
        className="flex-1 px-8 pt-8"
        contentContainerStyle={{ paddingBottom: 40 + keyboardPadding }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {Platform.OS !== "web" ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/payroll/entries"))} className="mb-4 self-start">
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
              <View className="mb-8 max-w-xl">
                <Text className="mb-3 text-sm text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                  Needs a billing day
                </Text>
                {unassignedClients.map((c) => {
                  const day = newDayByClient[c.id] ?? "";
                  const validDay = Number.isFinite(Number(day)) && Number(day) >= 1 && Number(day) <= 31;
                  return (
                    <View
                      key={c.id}
                      ref={(el) => {
                        if (el) newDayRowRefs.current.set(c.id, el);
                      }}
                      className="mb-2 flex-row items-center justify-between rounded-xl bg-white px-4 py-3"
                      style={{ borderWidth: 1, borderColor: "#ece7e1" }}
                    >
                      <Text className="flex-1 pr-3" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
                        {c.name}
                      </Text>
                      <TextInput
                        value={day}
                        onChangeText={(v) => setNewDayByClient((prev) => ({ ...prev, [c.id]: v }))}
                        onFocus={() => scrollFieldIntoView(newDayRowRefs.current.get(c.id))}
                        placeholder="Day"
                        keyboardType="decimal-pad"
                        inputAccessoryViewID={NUMERIC_DONE_ID}
                        className="mr-3 rounded-lg border border-stone-300 px-2.5 py-1.5"
                        style={{ fontFamily: fonts.sans, width: 56, textAlign: "center" }}
                      />
                      <Pressable
                        onPress={() => validDay && handleCheckClient(c)}
                        disabled={!validDay || addingClientId === c.id}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={addingClientId === c.id ? "hourglass-outline" : "checkbox-outline"}
                          size={22}
                          color={validDay ? colors.primary : "#d6d3d1"}
                        />
                      </Pressable>
                    </View>
                  );
                })}
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
                <View
                  key={a.id}
                  ref={(el) => {
                    if (el) editDayRowRefs.current.set(a.id, el);
                  }}
                  className="mb-2 max-w-xl flex-row items-center justify-between rounded-xl border border-stone-200 p-4"
                >
                  <View className="flex-1 pr-3">
                    <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{a.client_name}</Text>
                    {editingDay[a.id] !== undefined ? (
                      <View className="mt-1.5 flex-row items-center gap-2">
                        <TextInput
                          value={editingDay[a.id]}
                          onChangeText={(v) => setEditingDay((prev) => ({ ...prev, [a.id]: v }))}
                          onFocus={() => scrollFieldIntoView(editDayRowRefs.current.get(a.id))}
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
