import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, Platform, View } from "react-native";
import { useAuth } from "../../lib/auth/AuthProvider";
import { colors } from "../../lib/theme";

// The gym-floor wall display's route group. Only the dedicated display
// account (core.users.is_gym_display, migration 0071) gets in — everyone
// else bounces back to "/" and lands in their normal member/coach world.
// Deliberately no tabs and none of the member chrome (announcement popups,
// message bubbles): the TV is one screen, the live session board.
export default function DisplayLayout() {
  const { session, profile, ready } = useAuth();

  // Make the wall behave like an appliance rather than a web page. A long
  // press on a touchscreen pops Chromium's context menu, and a dragged
  // finger paints the board's text blue — neither is harmful, both look
  // like something has gone wrong to whoever is stood in front of it.
  // Text inputs are exempted (the lift note field is a real one), and the
  // rule is scoped to this route group, so nothing here reaches the member
  // or coach apps. Above every early return below: this hook has to run on
  // the same renders each time.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const style = document.createElement("style");
    style.textContent =
      "* { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }" +
      "input, textarea { -webkit-user-select: text; user-select: text; }";
    document.head.appendChild(style);
    const blockContextMenu = (e) => e.preventDefault();
    document.addEventListener("contextmenu", blockContextMenu);
    return () => {
      style.remove();
      document.removeEventListener("contextmenu", blockContextMenu);
    };
  }, []);

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  if (!profile) return <Redirect href="/pending-setup" />;
  if (!profile.is_gym_display) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
