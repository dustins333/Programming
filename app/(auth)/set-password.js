import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase/client";

export default function SetPassword() {
  const { token_hash: tokenHash, type } = useLocalSearchParams();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSetPassword = async () => {
    setErrorMessage(null);
    setLoading(true);

    // The invite/recovery email link carries a token_hash, not a live
    // session — exchange it first, same two-step flow as the web app's
    // /auth/confirm route.
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type === "invite" ? "invite" : "recovery",
    });
    if (verifyError) {
      setErrorMessage(verifyError.message);
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setErrorMessage(updateError.message);
      return;
    }
    router.replace("/");
  };

  return (
    <View className="flex-1 justify-center bg-white px-6">
      <Text className="mb-2 text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
        Set your password
      </Text>
      <Text className="mb-6 text-base text-stone-600" style={{ fontFamily: "Montserrat_400Regular" }}>
        Choose a password for your Kova Strength account.
      </Text>

      {!tokenHash ? (
        <Text className="text-sm text-red-600" style={{ fontFamily: "Montserrat_400Regular" }}>
          This link is missing or invalid. Request a new one from the sign-in screen.
        </Text>
      ) : (
        <>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="New password"
            className="mb-2 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: "Montserrat_400Regular", fontSize: 16, lineHeight: 22 }}
          />
          {errorMessage ? (
            <Text className="mb-4 text-sm text-red-600" style={{ fontFamily: "Montserrat_400Regular" }}>
              {errorMessage}
            </Text>
          ) : null}
          <Pressable
            onPress={handleSetPassword}
            disabled={loading || password.length < 8}
            className="mt-4 items-center rounded-lg bg-primary py-3.5 disabled:opacity-50"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-base text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                Set password
              </Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}
