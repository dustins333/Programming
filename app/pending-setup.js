import { View, Text, Pressable } from "react-native";
import { useAuth } from "../lib/auth/AuthProvider";

export default function PendingSetup() {
  const { signOut } = useAuth();

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
