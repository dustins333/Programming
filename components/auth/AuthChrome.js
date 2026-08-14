import { Linking, Platform, ScrollView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressFade } from "../PressFade";
import { fonts } from "../../lib/theme";

// Shared shell for every (auth) screen: full-bleed clay, the two overlay
// blobs, and a light status bar (the root layout sets `dark`, which is
// unreadable on this ground — expo-status-bar's last-mounted instance wins,
// so this only applies while an auth screen is on top).

export const CLAY = "#a46a57";
export const CREAM = "#faf8f6";
export const ON_CLAY = "#8a5140";

export const FIELD_BG = "rgba(255,255,255,0.14)";
export const FIELD_BORDER = "rgba(255,255,255,0.32)";
export const FIELD_BORDER_FOCUS = "#ffffff";
export const BODY_TEXT = "rgba(255,255,255,0.82)";
export const LABEL_TEXT = "rgba(255,255,255,0.6)";
export const HINT_TEXT = "rgba(255,255,255,0.65)";

// Error copy has to clear the clay ground — the red-600 used on the old
// white screens sits at roughly 2:1 against #a46a57 and effectively
// disappears. This is the same cream the CTA uses, which does read.
export const ERROR_TEXT = "#ffe4d8";

export function AuthScreen({ children, contentStyle, scroll = true }) {
  const insets = useSafeAreaInsets();

  const body = (
    <View style={[{ flex: 1, paddingTop: insets.top }, contentStyle]}>{children}</View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: CLAY }}>
      <StatusBar style="light" />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -120,
          left: -90,
          width: 340,
          height: 340,
          borderRadius: 170,
          backgroundColor: "rgba(255,255,255,0.06)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: -140,
          right: -110,
          width: 320,
          height: 320,
          borderRadius: 160,
          backgroundColor: "rgba(42,33,28,0.08)",
        }}
      />
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          // iOS-only; Android resizes the window (adjustResize) and web
          // shrinks the visual viewport, so flexGrow handles both there.
          // This replaces the KeyboardAvoidingView these screens used to
          // wrap in — a KAV inside a ScrollView fights the scroll instead
          // of helping it.
          automaticallyAdjustKeyboardInsets
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </View>
  );
}

export function BackButton({ onPress }) {
  return (
    <PressFade
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={10}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.34)",
        backgroundColor: "rgba(255,255,255,0.12)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text allowFontScaling={false} style={{ color: "#fff", fontSize: 17, lineHeight: 20 }}>
        ←
      </Text>
    </PressFade>
  );
}

export function Heading({ children, style }) {
  return (
    <Text
      maxFontSizeMultiplier={1.2}
      style={[{ fontFamily: fonts.display, fontSize: 34, lineHeight: 37, color: "#fff" }, style]}
    >
      {children}
    </Text>
  );
}

export function Body({ children, style }) {
  return (
    <Text
      style={[{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 21, color: BODY_TEXT, maxWidth: 300 }, style]}
    >
      {children}
    </Text>
  );
}

export function FieldLabel({ children }) {
  return (
    <Text
      maxFontSizeMultiplier={1.2}
      style={{
        fontFamily: fonts.sansBold,
        fontSize: 9.5,
        letterSpacing: 1.1,
        color: LABEL_TEXT,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

// The CTA inverts on the clay ground. Dimming is an inline style, not
// Tailwind's `disabled:opacity-50` — NativeWind sets aria-disabled and
// leaves opacity at 1, so a disabled button renders fully saturated and
// reads as "tapping does nothing" (house rule, see CLAUDE.md).
export function PrimaryButton({ label, onPress, disabled, loading, style }) {
  const off = Boolean(disabled || loading);
  return (
    <PressFade
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      pressedOpacity={0.85}
      style={{
        height: 56,
        borderRadius: 14,
        backgroundColor: CREAM,
        alignItems: "center",
        justifyContent: "center",
        opacity: off ? 0.5 : 1,
        shadowColor: "#2a211c",
        shadowOpacity: 0.22,
        shadowRadius: 13,
        shadowOffset: { width: 0, height: 10 },
        elevation: 4,
        ...style,
      }}
    >
      {/* No ActivityIndicator here — the coin is this app's only spinner
          (handoff), and every screen that can be busy shows the full-screen
          `Signing you in…` state instead. */}
      <Text
        maxFontSizeMultiplier={1.2}
        numberOfLines={1}
        style={{ fontFamily: fonts.sansBold, fontSize: 15.5, color: ON_CLAY }}
      >
        {label}
      </Text>
    </PressFade>
  );
}

export function LinkButton({ label, onPress, disabled, tone = "strong", style }) {
  return (
    <PressFade
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{ alignItems: "center", paddingVertical: 6, opacity: disabled ? 0.5 : 1, ...style }}
    >
      <Text
        style={{
          fontFamily: fonts.sansSemiBold,
          fontSize: 13,
          textAlign: "center",
          color: tone === "strong" ? "#fff" : "rgba(255,255,255,0.85)",
        }}
      >
        {label}
      </Text>
    </PressFade>
  );
}

export function ErrorLine({ message, style }) {
  if (!message) return null;
  return (
    <Text
      style={[
        { fontFamily: fonts.sansMedium, fontSize: 12.5, lineHeight: 18, color: ERROR_TEXT, marginBottom: 14 },
        style,
      ]}
    >
      {message}
    </Text>
  );
}

// `‹ Back to sign in` + Privacy Policy, pinned to the bottom of the screen.
// (auth)/_layout.js is a bare <Slot/> with headerShown:false, so this is the
// only way out of any of these screens.
export function AuthFooter({ onBack, privacy = true, style }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ marginTop: "auto", paddingBottom: Math.max(insets.bottom, 12) + 18, alignItems: "center" }, style]}>
      {onBack ? <LinkButton label="‹ Back to sign in" onPress={onBack} tone="soft" /> : null}
      {privacy ? (
        <PressFade
          onPress={() => Linking.openURL("https://kovastrength.com/privacy-policy/")}
          accessibilityRole="link"
          style={{ marginTop: 8, paddingVertical: 4 }}
        >
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            Privacy Policy
          </Text>
        </PressFade>
      ) : null}
    </View>
  );
}

export const PAGE_PADDING = { paddingHorizontal: 28 };
export const IS_IOS = Platform.OS === "ios";
