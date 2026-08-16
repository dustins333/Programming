import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase/client";
import { KovaDisc } from "../../components/auth/KovaCoin";
import { AuthField, CodeInput } from "../../components/auth/AuthFields";
import {
  AuthFooter,
  AuthHero,
  AuthScreen,
  BackButton,
  Body,
  ErrorLine,
  Heading,
  PrimaryButton,
} from "../../components/auth/AuthChrome";

// On a non-2xx response, supabase-js's functions.invoke() returns
// { data: null, error: FunctionsHttpError } — it does NOT parse the JSON
// body into `data`. Both Edge Functions here return a real, useful message
// (e.g. "Invalid or expired code") in a 400 body, but reading only
// error.message gives the generic "Edge Function returned a non-2xx status
// code" for every single failure. error.context is the raw Response for a
// FunctionsHttpError — this reads the actual body back out.
async function extractFunctionErrorMessage(error) {
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch {
      // context wasn't JSON, or was already consumed — fall through
    }
  }
  return error?.message ?? String(error);
}

// Email -> SMS code (via GHL, using the account's stored ghl_contact_id —
// see import-client) -> set password -> signed in. For members created
// ahead of time by the GHL "won" webhook, who've never opened the app or
// set a password before. See CLAUDE.md's GHL import section for the full
// design and why this doesn't use email links (spam deliverability) or
// store a phone number itself (GHL stays the source of truth for that).
export default function Register() {
  const [step, setStep] = useState("email"); // "email" | "code"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Both handlers use try/finally: functions.invoke rejects outright on a
  // network failure rather than resolving with an { error }, and without
  // this the button spun forever with no message (see login.js).
  const handleRequestCode = async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("request-registration-code", { body: { email } });
      if (error) {
        setErrorMessage(await extractFunctionErrorMessage(error));
        return;
      }
      setStep("code");
    } catch (err) {
      setErrorMessage(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-registration-code", {
        body: { email, code, password },
      });
      if (error) {
        setErrorMessage(await extractFunctionErrorMessage(error));
        return;
      }
      if (data?.error) {
        setErrorMessage(data.error);
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setErrorMessage(signInError.message);
        return;
      }
      router.replace("/");
    } catch (err) {
      setErrorMessage(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  const requestDisabled = loading || !email;
  const verifyDisabled = loading || code.length !== 6 || password.length < 8;
  const isEmailStep = step === "email";
  const backToSignIn = () => router.replace("/login");

  return (
    <AuthScreen contentStyle={{ paddingHorizontal: 28 }}>
      <View style={{ paddingTop: 14, marginBottom: 30 }}>
        {/* One step back, not all the way out — on the code step this is
            what "use a different email" used to be. */}
        <BackButton onPress={isEmailStep ? backToSignIn : () => setStep("email")} />
      </View>

      {isEmailStep ? (
        <>
          <AuthHero>
            <View style={{ marginBottom: 24 }}>
              <KovaDisc />
            </View>
            <Heading style={{ marginBottom: 10 }}>Set up your account.</Heading>
            <Body style={{ marginBottom: 26 }}>Enter your email and we'll text you a code.</Body>
          </AuthHero>

          <AuthField
            label="EMAIL"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="go"
            onSubmitEditing={requestDisabled ? undefined : handleRequestCode}
            style={{ marginBottom: 18 }}
          />

          <ErrorLine message={errorMessage} />

          <PrimaryButton
            label={loading ? "Sending…" : "Send code"}
            onPress={handleRequestCode}
            disabled={requestDisabled}
          />
        </>
      ) : (
        <>
          <AuthHero>
            <Heading style={{ marginBottom: 10 }}>One code, one password.</Heading>
            <Body style={{ marginBottom: 26 }}>Enter the code we texted you, and choose a password.</Body>
          </AuthHero>

          <CodeInput value={code} onChangeText={setCode} style={{ marginBottom: 18 }} />

          <AuthField
            label="PASSWORD"
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureToggle
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            // Stated, not just enforced by a dimmed button.
            hint="At least 8 characters."
            // The Verify button sits below the keyboard while this field is
            // focused (the hero collapses, but not by enough to lift a
            // button that far down), so Go on the keyboard has to work —
            // same as login's password field.
            returnKeyType="go"
            onSubmitEditing={verifyDisabled ? undefined : handleVerify}
            style={{ marginBottom: 18 }}
          />

          <ErrorLine message={errorMessage} />

          <PrimaryButton
            label={loading ? "Signing you in…" : "Verify & sign in"}
            onPress={handleVerify}
            disabled={verifyDisabled}
          />
        </>
      )}

      <AuthFooter onBack={backToSignIn} />
    </AuthScreen>
  );
}
