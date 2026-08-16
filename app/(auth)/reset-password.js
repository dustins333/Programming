import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase/client";
import { toastSuccess } from "../../lib/toast";
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
  LinkButton,
  PrimaryButton,
} from "../../components/auth/AuthChrome";
import { fonts } from "../../lib/theme";

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

  const handleEmailLink = async ({ resend = false } = {}) => {
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
      if (resend) toastSuccess("Link sent again.");
      setStep("emailSent");
    } catch (err) {
      setErrorMessage(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  const emailStepDisabled = loading || !email;
  const verifyDisabled = loading || code.length !== 6 || password.length < 8;
  const backToSignIn = () => router.replace("/login");

  if (step === "emailSent") {
    return (
      <AuthScreen>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
        >
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: "rgba(250,248,246,0.96)",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 26,
              shadowColor: "#2a211c",
              shadowOpacity: 0.22,
              shadowRadius: 15,
              shadowOffset: { width: 0, height: 12 },
              elevation: 5,
            }}
          >
            <Text allowFontScaling={false} style={{ fontSize: 34, color: "#4d6142" }}>
              ✓
            </Text>
          </View>
          <Heading style={{ fontSize: 32, lineHeight: 35, textAlign: "center", marginBottom: 10 }}>
            Link sent.
          </Heading>
          <Body style={{ textAlign: "center", maxWidth: 275 }}>
            Check <Text style={{ fontFamily: fonts.sansBold, color: "#fff" }}>{email}</Text> for a link to set a
            new password.
          </Body>
          <View style={{ width: "100%", marginTop: 32 }}>
            <PrimaryButton label="Back to sign in" onPress={backToSignIn} />
          </View>
        </View>

        <View style={{ paddingHorizontal: 28, paddingBottom: 34, alignItems: "center", flexDirection: "row", justifyContent: "center" }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>
            Nothing after a minute?{" "}
          </Text>
          <LinkButton
            label="Resend"
            onPress={() => handleEmailLink({ resend: true })}
            disabled={loading}
            style={{ paddingVertical: 0 }}
          />
        </View>
      </AuthScreen>
    );
  }

  const isEmailStep = step === "email";

  return (
    <AuthScreen contentStyle={{ paddingHorizontal: 28 }}>
      <View style={{ paddingTop: 14, marginBottom: 30 }}>
        {/* One step back, not all the way out — on the code step this is
            what "use a different email" used to be. `‹ Back to sign in`
            below is the exit. */}
        <BackButton onPress={isEmailStep ? backToSignIn : () => setStep("email")} />
      </View>

      {isEmailStep ? (
        <>
          <AuthHero>
            <View style={{ marginBottom: 24 }}>
              <KovaDisc />
            </View>
            <Heading style={{ marginBottom: 10 }}>Reset your password.</Heading>
            <Body style={{ marginBottom: 26 }}>
              Enter the email your gym has on file. We'll text a code to the phone number on your account.
            </Body>
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
            onSubmitEditing={emailStepDisabled ? undefined : handleSendCode}
            style={{ marginBottom: 18 }}
          />

          <ErrorLine message={errorMessage} />

          <PrimaryButton
            label={loading ? "Sending…" : "Text me a code"}
            onPress={handleSendCode}
            disabled={emailStepDisabled}
          />
          <LinkButton
            label="Email me a link instead"
            onPress={handleEmailLink}
            disabled={emailStepDisabled}
            style={{ marginTop: 14 }}
          />
        </>
      ) : (
        <>
          <AuthHero>
            <Heading style={{ marginBottom: 10 }}>Check your texts.</Heading>
            <Body style={{ marginBottom: 26 }}>
              Enter the 6-digit code we sent, then pick a new password.
            </Body>
          </AuthHero>

          <CodeInput value={code} onChangeText={setCode} style={{ marginBottom: 18 }} />

          <AuthField
            label="NEW PASSWORD"
            value={password}
            onChangeText={setPassword}
            placeholder="New password"
            secureToggle
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            // Stated, not just enforced by a dimmed button — the rule used
            // to be invisible until you'd already failed it.
            hint="At least 8 characters."
            // The submit button sits below the keyboard while this field is
            // focused, so Go on the keyboard has to work (see register.js).
            returnKeyType="go"
            onSubmitEditing={verifyDisabled ? undefined : handleVerify}
            style={{ marginBottom: 18 }}
          />

          <ErrorLine message={errorMessage} />

          <PrimaryButton
            label={loading ? "Signing you in…" : "Reset & sign in"}
            onPress={handleVerify}
            disabled={verifyDisabled}
          />
          <LinkButton
            label="Didn't get the text? Email me a link instead"
            onPress={handleEmailLink}
            disabled={loading}
            style={{ marginTop: 14 }}
          />
        </>
      )}

      <AuthFooter onBack={backToSignIn} />
    </AuthScreen>
  );
}
