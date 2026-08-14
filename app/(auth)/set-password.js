import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase/client";
import { KovaDisc } from "../../components/auth/KovaCoin";
import { AuthField } from "../../components/auth/AuthFields";
import {
  AuthFooter,
  AuthScreen,
  Body,
  ErrorLine,
  Heading,
  PrimaryButton,
} from "../../components/auth/AuthChrome";

// Not one of the handoff's seven frames, but it's where "Email me a link
// instead" actually lands — the fallback the other two screens offer ends
// here, so leaving it on the old white treatment put a seam at the end of
// the one flow the redesign exists to support. Same shell as the code step
// it mirrors.
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
    // See login.js — a rejection here used to leave the button spinning.
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type === "invite" ? "invite" : "recovery",
      });
      if (verifyError) {
        setErrorMessage(verifyError.message);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setErrorMessage(updateError.message);
        return;
      }
      router.replace("/");
    } catch (err) {
      setErrorMessage(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || password.length < 8;

  return (
    <AuthScreen contentStyle={{ paddingHorizontal: 28 }}>
      <View style={{ paddingTop: 44, marginBottom: 24 }}>
        <KovaDisc />
      </View>

      <Heading style={{ marginBottom: 10 }}>Set your password.</Heading>
      <Body style={{ marginBottom: 26 }}>Choose a password for your Kova Strength account.</Body>

      {!tokenHash ? (
        <ErrorLine message="This link is missing or invalid. Request a new one from the sign-in screen." />
      ) : (
        <>
          <AuthField
            label="NEW PASSWORD"
            value={password}
            onChangeText={setPassword}
            placeholder="New password"
            secureToggle
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            hint="At least 8 characters."
            returnKeyType="go"
            onSubmitEditing={disabled ? undefined : handleSetPassword}
            style={{ marginBottom: 18 }}
          />

          <ErrorLine message={errorMessage} />

          <PrimaryButton
            label={loading ? "Saving…" : "Set password"}
            onPress={handleSetPassword}
            disabled={disabled}
          />
        </>
      )}

      <AuthFooter onBack={() => router.replace("/login")} />
    </AuthScreen>
  );
}
