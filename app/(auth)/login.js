import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Link, router } from "expo-router";
import { supabase } from "../../lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSignIn = async () => {
    setErrorMessage(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    router.replace("/");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-white"
    >
      <View className="flex-1 justify-center px-6">
        <Text className="mb-1 text-center text-3xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
          Kova Strength
        </Text>
        <Text className="mb-8 text-center text-base text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
          Sign in to your account
        </Text>

        <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
          Email
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
          style={{ fontFamily: "Montserrat_400Regular", fontSize: 16, lineHeight: 22 }}
        />

        <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
          Password
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          className="mb-2 rounded-lg border border-stone-300 px-4 py-3"
          style={{ fontFamily: "Montserrat_400Regular", fontSize: 16, lineHeight: 22 }}
        />

        <Link
          href="/reset-password"
          className="mb-6 self-end text-sm"
          style={{ fontFamily: "Montserrat_400Regular", color: "#8a5140" }}
        >
          Forgot / set up password?
        </Link>

        {errorMessage ? (
          <Text className="mb-4 text-sm text-red-600" style={{ fontFamily: "Montserrat_400Regular" }}>
            {errorMessage}
          </Text>
        ) : null}

        <Pressable
          onPress={handleSignIn}
          disabled={loading || !email || !password}
          className="items-center rounded-lg bg-primary py-3.5 disabled:opacity-50"
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-base text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              Sign In
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
