import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase/client";
import { KovaCoin } from "../../components/auth/KovaCoin";
import { AuthField } from "../../components/auth/AuthFields";
import {
  AuthScreen,
  ErrorLine,
  LinkButton,
  PrimaryButton,
  AuthFooter,
} from "../../components/auth/AuthChrome";
import { fonts } from "../../lib/theme";

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

  // The coin at 110px/1.1s IS the loading state — this app's only spinner.
  // Email/password live above this early return, so an error lands back on
  // a filled-in form rather than an empty one.
  if (loading) return <SigningIn />;

  return (
    <AuthScreen>
      {/* flexGrow, not `flex: 1` — the mark centres itself in whatever room
          is spare, but keeps its natural height when the keyboard shrinks
          the viewport, so the form below scrolls into reach rather than the
          coin collapsing over it. */}
      <View
        style={{
          flexGrow: 1,
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 32,
          paddingBottom: 8,
        }}
      >
        <KovaCoin size={140} />
        <Text
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.display, fontSize: 40, lineHeight: 42, letterSpacing: -0.4, color: "#fff", marginTop: 26 }}
        >
          KOVA
        </Text>
        <Text
          maxFontSizeMultiplier={1.1}
          style={{
            fontFamily: fonts.sansBold,
            fontSize: 10,
            letterSpacing: 3.2,
            color: "rgba(255,255,255,0.7)",
            marginTop: 9,
          }}
        >
          STRENGTH
        </Text>
      </View>

      <View style={{ paddingHorizontal: 28 }}>
        <AuthField
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          blurOnSubmit={false}
          style={{ marginBottom: 12 }}
        />
        <AuthField
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureToggle
          autoCapitalize="none"
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleSignIn}
          style={{ marginBottom: 18 }}
        />

        <ErrorLine message={errorMessage} />

        <PrimaryButton label="Sign in" onPress={handleSignIn} disabled={!email || !password} />

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <LinkButton
            label="Forgot password?"
            tone="soft"
            onPress={() => router.push("/reset-password")}
            style={{ alignItems: "flex-start" }}
          />
          <LinkButton
            label="New here?"
            onPress={() => router.push("/register")}
            style={{ alignItems: "flex-end" }}
          />
        </View>
      </View>

      <AuthFooter />
    </AuthScreen>
  );
}

function SigningIn() {
  return (
    <AuthScreen scroll={false}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <KovaCoin size={110} duration={1100} bob={false} shadow={false} />
        <Text
          maxFontSizeMultiplier={1.2}
          style={{
            fontFamily: fonts.sansSemiBold,
            fontSize: 12.5,
            letterSpacing: 0.5,
            color: "rgba(255,255,255,0.8)",
            marginTop: 30,
          }}
        >
          Signing you in…
        </Text>
      </View>
      <View style={{ alignItems: "center", paddingBottom: 34 }}>
        <Text
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.45)" }}
        >
          KOVA STRENGTH
        </Text>
      </View>
    </AuthScreen>
  );
}
