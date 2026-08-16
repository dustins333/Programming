import { Linking, Platform, ScrollView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressFade } from "../PressFade";
import { useKeyboardInset } from "../../lib/useKeyboardInset";
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

  // flexGrow (not `flex: 1`) so this fills the screen when the content fits
  // but is free to exceed it when the keyboard shrinks the viewport. With
  // `flex: 1` the basis is 0 and shrink is on, so the wrapper was pinned to
  // the container's height and any overflow spilled out invisibly instead of
  // adding to scrollHeight — i.e. the ScrollView could never scroll.
  const body = (
    <View style={[{ flexGrow: 1, flexShrink: 0, paddingTop: insets.top }, contentStyle]}>
      {children}
    </View>
  );

  return (
    // overflow hidden clips the two decorative blobs below, which are
    // deliberately positioned past the edges — unclipped, the bottom-right
    // one pushed the document's scrollWidth to 486 against a 375 viewport
    // (measured), and a page wider than the screen is one iOS will let you
    // pan sideways, so the layout visibly drifts off-centre.
    <View style={{ flex: 1, backgroundColor: CLAY, overflow: "hidden" }}>
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
          // iOS-native only. Android resizes the window itself
          // (adjustResize); on web this prop does not exist at all
          // (react-native-web's ScrollView never reads it) — the keyboard
          // there is handled by components/WebKeyboardViewport.js, which
          // shrinks the root to the visual viewport so this content can
          // scroll. This replaces the KeyboardAvoidingView these screens
          // used to wrap in — a KAV inside a ScrollView fights the scroll
          // instead of helping it.
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

// Wraps the decorative top of an auth screen — the mark, the big heading,
// the explainer line — and drops it while the keyboard is up.
//
// This is the ONLY safe way to get a low-sitting field out from behind the
// keyboard on the web build, and it is worth understanding why the obvious
// alternative is not available. WebKeyboardViewport shrinks the root to the
// visible strip, which makes the screen scrollable, but nothing then scrolls
// the focused field into view: on iOS ANY programmatic scroll while the
// keyboard is open blurs the field and closes it. That was measured twice —
// once from a focusin handler, and once from a 300ms-debounced scroll long
// after the focus gesture, which still produced `focusout` 308ms after the
// keyboard opened. Deferring does not help; there is no safe moment.
//
// So the field has to already be inside the strip, which means the content
// above it has to shrink. On /register's code step the visible strip is
// 377pt while the password field sat at 429-477pt — entirely below it —
// and dropping the heading and explainer reclaims ~152pt, which is what
// brings it back on screen.
//
// Native returns a 0 inset from this hook and keeps its hero, because it
// has real keyboard-aware scrolling and never needed any of this.
export function AuthHero({ children }) {
  // Deliberately NOT the hook's own `keyboardInset`, which subtracts
  // vv.offsetTop because a bottom sheet has to know where the strip sits.
  // Safari pans the visual viewport as well as shrinking it, and once
  // offsetTop is large that subtraction reads as "no keyboard" — measured
  // on device, the hero popped back mid-typing and the layout oscillated.
  // Comparing the visible height against the layout viewport is exactly
  // WebKeyboardViewport's own test, including the 80px floor, so the two
  // cannot disagree about whether a keyboard is up.
  const { visibleHeight } = useKeyboardInset();
  const open =
    Platform.OS === "web" && visibleHeight != null && visibleHeight < window.innerHeight - 80;
  // Fragment, not a bare `children` — these call sites pass several
  // siblings, and returning the raw array asks React for keys it has no
  // reason to need.
  return open ? null : <>{children}</>;
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
