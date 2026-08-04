import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase/client";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleReset = async () => {
    setErrorMessage(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://app.kovastrength.com/set-password",
    });
    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSent(true);
  };

  return (
    <View className="flex-1 justify-center bg-white px-6">
      <Text className="mb-2 text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
        Reset your password
      </Text>

      {sent ? (
        <>
          <Text className="mb-6 text-base text-stone-600" style={{ fontFamily: "Montserrat_400Regular" }}>
            Check {email} for a link to set a new password.
          </Text>
          <Pressable onPress={() => router.replace("/login")} className="items-center rounded-lg bg-primary py-3.5">
            <Text className="text-base text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              Back to sign in
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text className="mb-6 text-base text-stone-600" style={{ fontFamily: "Montserrat_400Regular" }}>
            Enter your email and we'll send you a link to set or reset your password.
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            className="mb-2 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: "Montserrat_400Regular", fontSize: 16, lineHeight: 22 }}
          />
          {errorMessage ? (
            <Text className="mb-4 text-sm text-red-600" style={{ fontFamily: "Montserrat_400Regular" }}>
              {errorMessage}
            </Text>
          ) : null}
          <Pressable
            onPress={handleReset}
            disabled={loading || !email}
            className="mt-4 items-center rounded-lg bg-primary py-3.5 disabled:opacity-50"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-base text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                Send reset link
              </Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}
