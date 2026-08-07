import { View, Text, Pressable } from "react-native";
import { useAuth } from "../lib/auth/AuthProvider";

export default function PendingSetup() {
  const { signOut, profileError, retryProfile } = useAuth();

  // A fetch that genuinely failed (network blip, transient 5xx) looks
  // identical to "no profile row exists yet" unless distinguished — see
  // AuthProvider's profileError. A legitimate signed-in user hitting a
  // network hiccup deserves a Retry, not a screen whose only action signs
  // them out.
  if (profileError) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="mb-2 text-center text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
          Couldn't check your account
        </Text>
        <Text className="mb-8 text-center text-base text-stone-600" style={{ fontFamily: "Montserrat_400Regular" }}>
          {profileError}
        </Text>
        <Pressable
          onPress={retryProfile}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="mb-3 rounded-lg px-5 py-3"
          style={{ backgroundColor: "#a46a57" }}
        >
          <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>Retry</Text>
        </Pressable>
        <Pressable
          onPress={signOut}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Sign out"
          className="rounded-lg border border-stone-300 px-5 py-3"
        >
          <Text style={{ fontFamily: "Montserrat_500Medium" }}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="mb-2 text-center text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
        Almost there
      </Text>
      <Text className="mb-8 text-center text-base text-stone-600" style={{ fontFamily: "Montserrat_400Regular" }}>
        Your account is signed in, but a coach or admin still needs to finish setting up your profile. Check back soon.
      </Text>
      <Pressable
        onPress={signOut}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Sign out"
        className="rounded-lg border border-stone-300 px-5 py-3"
      >
        <Text style={{ fontFamily: "Montserrat_500Medium" }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
