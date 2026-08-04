import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Link, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { getOnboardingRoster } from "../../../lib/nutrition/onboarding";
import { supabase } from "../../../lib/supabase/client";
import { formatDateMDY } from "../../../lib/formatDate";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

// Ported from the standalone app's /dashboard/onboarding page — a coach-
// facing pipeline view for every not-yet-approved nutrition client, so
// onboarding stops being a black hole (per direct feedback: the roster's
// generic "Onboarding" badge doesn't say WHICH phase a client is stuck on,
// or whether they've ever even opened the app at all). See
// lib/nutrition/onboarding.js's getOnboardingRoster/describeOnboardingProgress.
export default function NutritionOnboarding() {
  const router = useRouter();
  const [clients, setClients] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [resendingId, setResendingId] = useState(null);

  const load = useCallback(async () => {
    try {
      setClients(await getOnboardingRoster());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Same resend mechanism as this app's own "Forgot / set up password?"
  // flow (app/(auth)/reset-password.js) — Kova has no separate email-invite
  // system for members (a member's auth.users row already exists before
  // nutrition is ever turned on; see lib/programming/clients.js's
  // linkMemberByAuthId), so "resend invite" here really means "send them a
  // fresh link to set their password and get in for the first time," which
  // works regardless of whether they ever completed a first login.
  const handleResend = async (client) => {
    setResendingId(client.id);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(client.email, {
        redirectTo: Linking.createURL("set-password"),
      });
      if (error) throw error;
      Alert.alert("Sent", `A sign-in link was sent to ${client.email}.`);
    } catch (err) {
      Alert.alert("Failed to send", err.message ?? String(err));
    } finally {
      setResendingId(null);
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading the onboarding pipeline: {loadError}
          </Text>
        </View>
      </CoachShell>
    );
  }

  if (!clients) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white" contentContainerClassName="px-6 py-8" contentContainerStyle={{ maxWidth: 900 }}>
        <Link href="/(coach)/nutrition" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 12 }}>
          ‹ Back
        </Link>
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Onboarding
        </Text>
        <Text className="mb-5 text-stone-500" style={{ fontFamily: fonts.sans }}>
          Clients not yet approved for Objective Tracking.
        </Text>

        {clients.length === 0 ? (
          <Text className="py-4 text-center text-stone-500" style={{ fontFamily: fonts.sans }}>
            No clients currently onboarding.
          </Text>
        ) : (
          clients.map((client) => {
            const neverSignedIn = !client.firstLoginAt;
            return (
              <View key={client.id} className="mb-2 flex-row items-center justify-between rounded-2xl border border-stone-200 px-4 py-3.5">
                <Pressable className="flex-1 pr-3" onPress={() => router.push(`/(coach)/nutrition/clients/${client.id}`)}>
                  <View className="flex-row items-center gap-2">
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: client.progress.tone === "done" ? "#4d6142" : "#a8a29e",
                      }}
                    />
                    <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
                      {client.name}
                    </Text>
                  </View>
                  <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                    {client.progress.text}
                    {neverSignedIn ? " · Never signed in" : ""}
                  </Text>
                  <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                    {client.email} · started {formatDateMDY(client.start_date)}
                  </Text>
                </Pressable>
                <View className="flex-row items-center gap-3">
                  {neverSignedIn ? (
                    <Pressable onPress={() => handleResend(client)} disabled={resendingId === client.id} hitSlop={8}>
                      <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                        {resendingId === client.id ? "Sending…" : "Resend invite"}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => router.push(`/(coach)/nutrition/clients/${client.id}`)}>
                    <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#78716c" }}>
                      View
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </CoachShell>
  );
}
