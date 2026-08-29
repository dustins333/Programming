import { Component } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, type } from "../lib/theme";
import { reportClientError } from "../lib/programming/clientErrors";

// Before this existed, ANY uncaught render error anywhere in the app painted a
// silent white screen — no message, nothing logged, nothing a member could
// report beyond "it goes blank". With ~150 clients on the installed PWA and
// the coach almost never standing next to them, that made a whole class of bug
// undiagnosable remotely. This turns a white screen into something a member can
// screenshot and a coach can act on.
//
// Deliberately mounted around AuthProvider (see app/_layout.js) rather than
// around <Slot/> alone, so a crash in the auth layer is caught too — but still
// INSIDE SafeAreaProvider/GestureHandlerRootView, because the fallback below
// needs those contexts to render itself.

const STACK_LINES = 6;

// The component stack is what actually names the screen that blew up
// ("at MyFitness", "at ExerciseCard") — far more useful than the message alone,
// but it can run to dozens of frames and each one drags a full bundler URL
// behind it (".../entry.bundle?platform=web&dev=true&..."), which is noise to
// everyone reading this and pushes the useful names off a phone screen. Keep
// the innermost few frames, names only.
function topOfStack(componentStack) {
  if (!componentStack) return "";
  const frames = [];
  for (const raw of componentStack.split("\n")) {
    const name = raw.trim().split(" (")[0].trim();
    if (!name) continue;
    // React sometimes emits anonymous/internal frames that name nothing useful.
    if (name === "at" || name.endsWith("(<anonymous>)")) continue;
    frames.push(name);
    if (frames.length === STACK_LINES) break;
  }
  return frames.join("\n");
}

function ErrorFallback({ error, componentStack, onRetry }) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const message = error?.message ? String(error.message) : String(error ?? "Unknown error");
  // The production bundle minifies most route components away (MyFitness and
  // MyWeek both become single letters), so the component stack alone can't
  // reliably answer "which screen was she on" — the one thing a coach reading
  // this from across town most needs. The path always survives.
  const where = isWeb && typeof window !== "undefined" ? window.location.pathname : null;
  const details = [where ? `Screen: ${where}` : null, message, topOfStack(componentStack)]
    .filter(Boolean)
    .join("\n\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details);
    } catch {
      // Clipboard can be blocked (permissions, insecure context). A screenshot
      // still works, and the text is on screen and selectable either way.
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: 22,
        paddingTop: insets.top + 28,
        paddingBottom: insets.bottom + 28,
      }}
    >
      <Text
        style={{ fontFamily: fonts.display, fontSize: type.display, color: colors.primaryOnWhite, marginBottom: 10 }}
      >
        This screen didn't load
      </Text>

      <Text
        style={{ fontFamily: fonts.sans, fontSize: type.bodyLg, color: colors.muted, lineHeight: 22, marginBottom: 20 }}
      >
        Something went wrong on our end, not yours. Nothing you've logged has been lost.
      </Text>

      <Pressable
        onPress={onRetry}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 999,
          paddingVertical: 14,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: type.bodyLg, color: "#fff" }}>
          {isWeb ? "Reload the app" : "Try again"}
        </Text>
      </Pressable>

      {isWeb ? (
        <Pressable onPress={copy} style={{ paddingVertical: 11, alignItems: "center", marginBottom: 4 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: type.body, color: colors.primaryOnWhite }}>
            Copy error details
          </Text>
        </Pressable>
      ) : null}

      <Text
        style={{
          fontFamily: fonts.sans,
          fontSize: type.caption,
          color: colors.muted,
          textAlign: "center",
          marginTop: 14,
          marginBottom: 10,
        }}
      >
        Send your coach a screenshot of this — it tells them exactly what broke.
      </Text>

      <View
        style={{
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: "#ece7e1",
          borderRadius: 12,
          padding: 13,
        }}
      >
        <Text
          selectable
          style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.hint, lineHeight: 17 }}
        >
          {details}
        </Text>
      </View>
    </ScrollView>
  );
}

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, componentStack: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ componentStack: errorInfo?.componentStack ?? null });
    // Kept so the real stack is still there if anyone ever does get a console
    // attached to the device (Chrome remote debugging, Safari web inspector).
    console.error("Uncaught render error:", error, errorInfo?.componentStack);
    // Deliberately not awaited: rendering the fallback must not wait on a
    // network call, and reportClientError swallows its own failures so a
    // reporting problem can never compound the crash the member is looking at.
    reportClientError({ error, componentStack: errorInfo?.componentStack });
  }

  handleRetry = () => {
    // On web a full reload is the more reliable recovery: whatever state led
    // here is discarded along with the page. On native there's no equivalent,
    // so clearing the error re-renders the subtree and lets the member retry.
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.reload();
      return;
    }
    this.setState({ error: null, componentStack: null });
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          componentStack={this.state.componentStack}
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}
