import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase/client";
import { NUMERIC_DONE_ID } from "../../components/NumericInputAccessory";

// Same reason as register.js — functions.invoke() doesn't parse a non-2xx
// body into `data`, so error.message is always the generic "Edge Function
// returned a non-2xx status code". error.context is the raw Response.
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

// Text-first password reset, with email as the fallback.
//
// SMS leads because that's the route that actually reaches people — the
// invite emails this replaced had real deliverability problems (see
// CLAUDE.md's GHL import section). It reuses register.js's two Edge
// Functions verbatim: verify-registration-code sets the password via the
// Admin API and doesn't care whether the account has been registered
// before, so it doubles as recovery with no server-side change.
//
// The email fallback is NOT decoration. request-registration-code returns
// a uniform { sent: true } whether or not the account exists or has a
// ghl_contact_id (deliberate, anti-enumeration) — so a staff account, or
// anyone whose account has no GHL contact, lands on the code step and
// never gets a text. That's why "Email me a link instead" is offered on
// the code step too, not just the first one: it's the only way out for
// those accounts, and the screen can't detect that case to tell them.
export default function ResetPassword() {
  const [step, setStep] = useState("email"); // "email" | "code" | "emailSent"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // try/finally throughout: functions.invoke rejects outright on a network
  // failure rather than resolving with an { error }, and without this the
  // button spun forever with no message (see login.js).
  const handleSendCode = async () => {
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

  const handleEmailLink = async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://app.kovastrength.com/set-password",
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      setStep("emailSent");
    } catch (err) {
      setErrorMessage(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  // Dimming is an inline style, not Tailwind's `disabled:opacity-50`:
  // NativeWind sets aria-disabled but leaves opacity at 1, so a disabled
  // button renders fully saturated and reads as "tapping does nothing"
  // rather than "you're not done yet" (measured in the browser — the same
  // variant is inert on login.js/register.js too).
  const emailStepDisabled = loading || !email;
  const verifyDisabled = loading || code.length !== 6 || password.length < 8;

  const errorLine = errorMessage ? (
    <Text className="mb-4 text-sm text-red-600" style={{ fontFamily: "Montserrat_400Regular" }}>
      {errorMessage}
    </Text>
  ) : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-white">
      <View className="flex-1 justify-center px-6">
        <Text className="mb-2 text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
          Reset your password
        </Text>

        {step === "emailSent" ? (
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
        ) : step === "email" ? (
          <>
            <Text className="mb-6 text-base text-stone-600" style={{ fontFamily: "Montserrat_400Regular" }}>
              Enter the email your gym has on file. We'll text a code to the phone number on your account.
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="Email"
              className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: "Montserrat_400Regular", fontSize: 16, lineHeight: 22 }}
            />
            {errorLine}
            <Pressable
              onPress={handleSendCode}
              disabled={emailStepDisabled}
              className="items-center rounded-lg bg-primary py-3.5"
              style={{ opacity: emailStepDisabled ? 0.5 : 1 }}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-base text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Text me a code
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleEmailLink}
              disabled={emailStepDisabled}
              className="mt-4 items-center"
              style={{ opacity: emailStepDisabled ? 0.5 : 1 }}
            >
              <Text className="text-sm" style={{ fontFamily: "Montserrat_600SemiBold", color: "#8a5140" }}>
                Email me a link instead
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text className="mb-6 text-base text-stone-600" style={{ fontFamily: "Montserrat_400Regular" }}>
              Enter the code we texted you, and choose a new password.
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              // Explicit, so babel/noAutofillPlugin.js leaves it alone —
              // this field genuinely wants autofill from the SMS.
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              inputAccessoryViewID={NUMERIC_DONE_ID}
              placeholder="6-digit code"
              maxLength={6}
              className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
              style={{ fontFamily: "Montserrat_400Regular", fontSize: 16, lineHeight: 22 }}
            />
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
            {errorLine}
            <Pressable
              onPress={handleVerify}
              disabled={verifyDisabled}
              className="mt-2 items-center rounded-lg bg-primary py-3.5"
              style={{ opacity: verifyDisabled ? 0.5 : 1 }}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-base text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Reset & sign in
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleEmailLink}
              disabled={loading}
              className="mt-4 items-center"
              style={{ opacity: loading ? 0.5 : 1 }}
            >
              <Text className="text-sm" style={{ fontFamily: "Montserrat_600SemiBold", color: "#8a5140" }}>
                Didn't get the text? Email me a link instead
              </Text>
            </Pressable>
            <Pressable onPress={() => setStep("email")} className="mt-3 items-center">
              <Text className="text-sm" style={{ fontFamily: "Montserrat_400Regular", color: "#8a5140" }}>
                Use a different email
              </Text>
            </Pressable>
          </>
        )}

        {/* The emailSent branch above already offers this; the other
            branches had no way out at all. (auth)/_layout.js is a bare
            <Slot/> with no Stack and native runs headerShown:false, so
            there's no back gesture either. */}
        {step === "emailSent" ? null : (
          <Pressable onPress={() => router.replace("/login")} className="mt-6 items-center">
            <Text className="text-sm" style={{ fontFamily: "Montserrat_600SemiBold", color: "#8a5140" }}>
              ‹ Back to sign in
            </Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
