import { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { Link, router } from "expo-router";
import { supabase } from "../../lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const passwordRef = useRef(null);

  const handleSignIn = async () => {
    if (!email || !password) return;
    setErrorMessage(null);
    setLoading(true);
    // try/finally, not a bare await: these calls normally resolve with an
    // { error }, but a network failure (and anything going through
    // functions.invoke) rejects instead — and setLoading(false) never ran,
    // so the button spun forever with nothing on screen to explain it.
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      router.replace("/");
    } catch (err) {
      setErrorMessage(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
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
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
          className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
          style={{ fontFamily: "Montserrat_400Regular", fontSize: 16, lineHeight: 22 }}
        />

        <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
          Password
        </Text>
        <TextInput
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleSignIn}
          className="mb-2 rounded-lg border border-stone-300 px-4 py-3"
          style={{ fontFamily: "Montserrat_400Regular", fontSize: 16, lineHeight: 22 }}
        />

        <Link
          href="/reset-password"
          className="mb-2 self-end text-sm"
          style={{ fontFamily: "Montserrat_400Regular", color: "#8a5140" }}
        >
          Forgot / set up password?
        </Link>

        <Link
          href="/register"
          className="mb-6 self-end text-sm"
          style={{ fontFamily: "Montserrat_400Regular", color: "#8a5140" }}
        >
          New here? Set up your account
        </Link>

        {errorMessage ? (
          <Text className="mb-4 text-sm text-red-600" style={{ fontFamily: "Montserrat_400Regular" }}>
            {errorMessage}
          </Text>
        ) : null}

        {/* Dimming is inline, not Tailwind's `disabled:opacity-50` —
            NativeWind sets aria-disabled but leaves opacity at 1, so the
            button rendered fully saturated while inert and read as "tapping
            does nothing" instead of "fill both fields in". */}
        <Pressable
          onPress={handleSignIn}
          disabled={loading || !email || !password}
          className="items-center rounded-lg bg-primary py-3.5"
          style={{ opacity: loading || !email || !password ? 0.5 : 1 }}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-base text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
              Sign In
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => Linking.openURL("https://kovastrength.com/privacy-policy/")}
          className="mt-6 items-center"
        >
          <Text className="text-xs text-stone-400" style={{ fontFamily: "Montserrat_400Regular" }}>
            Privacy Policy
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
