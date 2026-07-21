import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";
import { sendPush } from "../../lib/notifications/sendPush";

export default function CoachHome() {
  const { profile, signOut } = useAuth();
  const [sending, setSending] = useState(false);

  const handleSendTestPush = async () => {
    setSending(true);
    try {
      const result = await sendPush({
        userId: profile.id,
        title: "Kova Strength",
        body: "Push notifications are wired up.",
      });
      Alert.alert("Sent", JSON.stringify(result));
    } catch (err) {
      Alert.alert("Failed to send", err.message ?? String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="mb-2 text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
        Welcome, {profile?.name}
      </Text>
      <Text className="mb-8 text-base text-neutral-500" style={{ fontFamily: "Montserrat_400Regular" }}>
        {profile?.role === "admin" ? "Admin" : "Coach"} dashboard
      </Text>
      <Link href="/(coach)/blocks" className="mb-3 text-accent" style={{ fontFamily: "Montserrat_500Medium" }}>
        Group Program Blocks
      </Link>
      <Link href="/(coach)/exercises" className="mb-3 text-accent" style={{ fontFamily: "Montserrat_500Medium" }}>
        Exercise Library
      </Link>
      <Link href="/(coach)/clients" className="mb-3 text-accent" style={{ fontFamily: "Montserrat_500Medium" }}>
        Clients
      </Link>
      {profile?.role === "admin" ? (
        <Link href="/(coach)/settings" className="mb-4 text-accent" style={{ fontFamily: "Montserrat_500Medium" }}>
          Settings
        </Link>
      ) : null}
      <Pressable
        onPress={handleSendTestPush}
        disabled={sending}
        className="mb-4 rounded-lg border border-primary px-5 py-3 disabled:opacity-50"
      >
        <Text style={{ fontFamily: "Montserrat_500Medium", color: "#a46a57" }}>
          {sending ? "Sending…" : "Send test push to myself"}
        </Text>
      </Pressable>
      <Pressable onPress={signOut} className="rounded-lg border border-neutral-300 px-5 py-3">
        <Text style={{ fontFamily: "Montserrat_500Medium" }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
