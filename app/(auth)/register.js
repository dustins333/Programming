import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, Linking } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase/client";
import { NUMERIC_DONE_ID } from "../../components/NumericInputAccessory";

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

  // Dimming is inline, not Tailwind's `disabled:opacity-50` — NativeWind
  // sets aria-disabled but leaves opacity at 1, so a disabled button
  // rendered fully saturated and read as "tapping does nothing" rather
  // than "you're not done yet" (measured in the browser).
  const requestDisabled = loading || !email;
  const verifyDisabled = loading || code.length !== 6 || password.length < 8;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-white">
      <View className="flex-1 justify-center px-6">
        <Text className="mb-2 text-2xl text-primary" style={{ fontFamily: "ProtestStrike_400Regular" }}>
          Set up your account
        </Text>

        {step === "email" ? (
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
            {errorMessage ? (
              <Text className="mb-4 text-sm text-red-600" style={{ fontFamily: "Montserrat_400Regular" }}>
                {errorMessage}
              </Text>
            ) : null}
            <Pressable
              onPress={handleRequestCode}
              disabled={requestDisabled}
              className="items-center rounded-lg bg-primary py-3.5"
              style={{ opacity: requestDisabled ? 0.5 : 1 }}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-base text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Send code
                </Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text className="mb-6 text-base text-stone-600" style={{ fontFamily: "Montserrat_400Regular" }}>
              Enter the code we texted you, and choose a password.
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              // Explicit, so babel/noAutofillPlugin.js leaves it alone — this
              // is the one field in the app that genuinely wants autofill
              // from the SMS we just sent.
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
            {errorMessage ? (
              <Text className="mb-4 text-sm text-red-600" style={{ fontFamily: "Montserrat_400Regular" }}>
                {errorMessage}
              </Text>
            ) : null}
            <Pressable
              onPress={handleVerify}
              disabled={verifyDisabled}
              className="items-center rounded-lg bg-primary py-3.5"
              style={{ opacity: verifyDisabled ? 0.5 : 1 }}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-base text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                  Verify & sign in
                </Text>
              )}
            </Pressable>
            <Pressable onPress={() => setStep("email")} className="mt-4 items-center">
              <Text className="text-sm" style={{ fontFamily: "Montserrat_400Regular", color: "#8a5140" }}>
                Use a different email
              </Text>
            </Pressable>
          </>
        )}

        {/* (auth)/_layout.js is a bare <Slot/> with no Stack, and native
            runs headerShown:false — without this there is no back gesture,
            no header, and no way out of this screen at all. */}
        <Pressable onPress={() => router.replace("/login")} className="mt-6 items-center">
          <Text className="text-sm" style={{ fontFamily: "Montserrat_600SemiBold", color: "#8a5140" }}>
            ‹ Back to sign in
          </Text>
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
