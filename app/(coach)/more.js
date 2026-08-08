import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { CoachShell } from "../../components/CoachShell";
import { getMessagingSettings } from "../../lib/programming/messagingSettings";
import { fonts, colors } from "../../lib/theme";

export default function More() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === "admin";
  // Admin kill switch (lib/programming/messagingSettings.js) — mirrors
  // CoachShell's own web sidebar gating for this same row.
  const [messagingEnabled, setMessagingEnabled] = useState(true);

  useEffect(() => {
    getMessagingSettings()
      .then((s) => setMessagingEnabled(s.enabled))
      .catch((err) => console.error("Failed to load messaging settings:", err));
  }, []);

  return (
    <CoachShell>
    <View className="flex-1 bg-white px-6 py-8">
      <Text className="mb-6 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        More
      </Text>

      {isAdmin || profile?.can_view_exercise_library ? (
        <Pressable
          onPress={() => router.push("/(coach)/exercises")}
          className="mb-3 rounded-2xl border border-stone-200 px-5 py-4"
        >
          <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
            Exercise Library
          </Text>
          <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Text + cues
          </Text>
        </Pressable>
      ) : null}

      {messagingEnabled ? (
        <Pressable
          onPress={() => router.push("/(coach)/messages")}
          className="mb-3 rounded-2xl border border-stone-200 px-5 py-4"
        >
          <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
            Messages
          </Text>
          <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Every client conversation, in one place
          </Text>
        </Pressable>
      ) : null}

      {/* No permission gate — every coach logs their own hours here. */}
      <Pressable
        onPress={() => router.push("/(coach)/payroll")}
        className="mb-3 rounded-2xl border border-stone-200 px-5 py-4"
      >
        <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
          Payroll
        </Text>
        <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          Log hours, view your pay
        </Text>
      </Pressable>

      {/* Every coach/admin account is also a real training client — jumps
          into the same member tab experience any client uses, reading this
          account's own program data. The member tabs' staff-only
          "Coaching" tab is the way back. */}
      <Pressable
        onPress={() => router.push("/(member)")}
        className="mb-3 rounded-2xl border border-stone-200 px-5 py-4"
      >
        <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
          Member View
        </Text>
        <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
          Log your own workouts &amp; nutrition
        </Text>
      </Pressable>

      {profile?.role === "admin" ? (
        <Pressable
          onPress={() => router.push("/(coach)/announcements")}
          className="mb-3 rounded-2xl border border-stone-200 px-5 py-4"
        >
          <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
            Announcements
          </Text>
          <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Send a note to clients
          </Text>
        </Pressable>
      ) : null}

      {profile?.role === "admin" ? (
        <Pressable
          onPress={() => router.push("/(coach)/settings")}
          className="mb-3 rounded-2xl border border-stone-200 px-5 py-4"
        >
          <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
            Settings
          </Text>
          <Text className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Admin only
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={signOut}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Sign out"
        className="mt-4 self-start rounded-lg border border-stone-300 px-5 py-3"
      >
        <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
          Sign out
        </Text>
      </Pressable>
    </View>
    </CoachShell>
  );
}
