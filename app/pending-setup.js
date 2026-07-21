import { View, Text, Pressable } from "react-native";
import { useAuth } from "../lib/auth/AuthProvider";

export default function PendingSetup() {
  const { signOut } = useAuth();

  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="mb-2 text-center text-xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
        Almost there
      </Text>
      <Text className="mb-8 text-center text-base text-neutral-600" style={{ fontFamily: "Montserrat_400Regular" }}>
        Your account is signed in, but a coach or admin still needs to finish setting up your profile. Check back soon.
      </Text>
      <Pressable onPress={signOut} className="rounded-lg border border-neutral-300 px-5 py-3">
        <Text style={{ fontFamily: "Montserrat_500Medium" }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
