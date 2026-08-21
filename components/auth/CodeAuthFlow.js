import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase/client";
import { toastSuccess } from "../../lib/toast";
import { KovaDisc } from "./KovaCoin";
import { AuthField, CodeInput } from "./AuthFields";
import {
  AuthFooter,
  AuthHero,
  AuthScreen,
  BackButton,
  Body,
  ErrorLine,
  Heading,
  HINT_TEXT,
  LinkButton,
  PrimaryButton,
} from "./AuthChrome";
import { fonts } from "../../lib/theme";

// The email -> texted code -> password -> signed in flow, shared by
// /register and /reset-password.
//
// These were two copies of the same screen, and the copies had drifted:
// reset-password picked up an explanation of which email to use, an
// "email me a link instead" fallback and a resend, while register kept the
// original bare version — so the screen a brand-new member meets first was
// the worse of the two. Anything either flow learns now, both get.
//
// Only the words differ between them, so the words are the only prop.

// Mirrors RESEND_COOLDOWN_SECONDS in
// supabase/functions/request-registration-code/index.ts. That function
// returns the same { sent: true } whether it texted a code, found no
// account, or refused as too soon — deliberate, so nobody can probe which
// emails are members. The catch is that a Resend inside the cooldown would
// report success having done nothing, so the button counts down instead of
// letting someone press it and trust it.
const RESEND_COOLDOWN_SECONDS = 45;

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

function Hint({ children, style }) {
  return (
    <Text style={[{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 18, color: HINT_TEXT }, style]}>
      {children}
    </Text>
  );
}

export function CodeAuthFlow({ copy }) {
  const [step, setStep] = useState("email"); // "email" | "code" | "emailSent"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  // The deadline, not a number counting down: browsers throttle timers in a
  // backgrounded tab, so a decrementing counter drifts behind real time and
  // makes someone wait longer than the 45s they actually owe. Elapsed-time
  // arithmetic, so plain Date.now() is right here — this is a duration, not
  // a calendar date, and none of the boiseDate rules apply.
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));

  // setTimeout rather than an interval so it winds itself down and cleans up
  // on unmount without a separate stop condition.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  // try/finally throughout: functions.invoke rejects outright on a network
  // failure rather than resolving with an { error }, and without this the
  // button spun forever with no message (see login.js).
  const sendCode = async ({ resend = false } = {}) => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("request-registration-code", { body: { email } });
      if (error) {
        setErrorMessage(await extractFunctionErrorMessage(error));
        return;
      }
      setNow(Date.now());
      setResendAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      if (resend) toastSuccess("Code sent again.");
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

  // Not decoration, and the reason it's offered on the code step too: a
  // staff account, or anyone whose account has no GHL contact, lands on
  // the code step and never gets a text. The screen can't detect that
  // case — the response is uniform by design — so this is their only way
  // through. Works for a brand-new member as well as a returning one: the
  // account already exists (import-client created it), it just has no
  // password yet.
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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 }}>
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
            Check <Text style={{ fontFamily: fonts.sansBold, color: "#fff" }}>{email}</Text> {copy.emailSentBody}
          </Body>
          <View style={{ width: "100%", marginTop: 32 }}>
            <PrimaryButton label="Back to sign in" onPress={backToSignIn} />
          </View>
        </View>

        <View
          style={{
            paddingHorizontal: 28,
            paddingBottom: 34,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
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
            <Heading style={{ marginBottom: 10 }}>{copy.emailHeading}</Heading>
            {/* Which email, and where the code goes. Without this a member
                guesses at a personal address the gym has never seen, gets
                the same "we sent a code" as everyone else, and waits. */}
            <Body style={{ marginBottom: 26 }}>
              Enter the email your gym has on file. We&apos;ll text a code to the phone number on your account.
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
            onSubmitEditing={emailStepDisabled ? undefined : () => sendCode()}
            style={{ marginBottom: 18 }}
          />

          <ErrorLine message={errorMessage} />

          <PrimaryButton
            label={loading ? "Sending…" : "Text me a code"}
            onPress={() => sendCode()}
            disabled={emailStepDisabled}
          />
          <LinkButton
            label="Email me a link instead"
            onPress={() => handleEmailLink()}
            disabled={emailStepDisabled}
            style={{ marginTop: 14 }}
          />
        </>
      ) : (
        <>
          <AuthHero>
            <Heading style={{ marginBottom: 10 }}>Check your texts.</Heading>
            <Body style={{ marginBottom: 8 }}>{copy.codeBody}</Body>
            {/* Echoed back so a typo is visible here rather than after a
                minute of waiting for a text that was never going to come. */}
            <Body style={{ marginBottom: 26 }}>
              Using <Text style={{ fontFamily: fonts.sansBold, color: "#fff" }}>{email}</Text> — go back to change it.
            </Body>
          </AuthHero>

          <CodeInput value={code} onChangeText={setCode} style={{ marginBottom: 10 }} />

          {/* Honest about where the code went without revealing whether the
              address is a member — the request response is uniform either
              way, so this is the most the screen can truthfully say. */}
          <Hint style={{ marginBottom: 18 }}>
            No code? It goes to the phone number your gym has on file. Check with your coach if that&apos;s changed,
            or email a link instead.
          </Hint>

          <AuthField
            label={copy.passwordLabel}
            value={password}
            onChangeText={setPassword}
            placeholder={copy.passwordPlaceholder}
            secureToggle
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            // Stated, not just enforced by a dimmed button — the rule used
            // to be invisible until you'd already failed it.
            hint="At least 8 characters."
            // The submit button sits below the keyboard while this field is
            // focused (the hero collapses, but not by enough to lift a
            // button that far down), so Go on the keyboard has to work —
            // same as login's password field.
            returnKeyType="go"
            onSubmitEditing={verifyDisabled ? undefined : handleVerify}
            style={{ marginBottom: 18 }}
          />

          <ErrorLine message={errorMessage} />

          <PrimaryButton
            label={loading ? "Signing you in…" : copy.verifyLabel}
            onPress={handleVerify}
            disabled={verifyDisabled}
          />

          <View
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 16 }}
          >
            <Hint>Nothing after a minute? </Hint>
            <LinkButton
              label={resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              onPress={() => sendCode({ resend: true })}
              disabled={loading || resendIn > 0}
              style={{ paddingVertical: 0 }}
            />
          </View>

          <LinkButton
            label="Still nothing? Email me a link instead"
            onPress={() => handleEmailLink()}
            disabled={loading}
            tone="soft"
            style={{ marginTop: 10 }}
          />
        </>
      )}

      <AuthFooter onBack={backToSignIn} />
    </AuthScreen>
  );
}
