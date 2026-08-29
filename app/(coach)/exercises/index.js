import { Text, Platform } from "react-native";
import { useRouter } from "expo-router";
import { ExerciseLibraryMobile } from "../../../components/coach/ExerciseLibraryMobile";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors } from "../../../lib/theme";

// Native's Exercise Library. The screen itself is
// components/coach/ExerciseLibraryMobile so index.web.js can render the
// identical thing below the mobile breakpoint — see that component's header
// for why it can't just be imported from here.
export default function Exercises() {
  const router = useRouter();
  return (
    <CoachShell>
      <ExerciseLibraryMobile
        header={
          // The native (coach) Tabs navigator runs headerShown: false, so a
          // pushed route has no back affordance unless it draws one. On web
          // the CoachShell sidebar is the way back.
          Platform.OS === "web" ? null : (
            <PressFade
              onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/more"))}
              hitSlop={10}
              style={{ alignSelf: "flex-start", marginBottom: 8 }}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.primaryOnWhite }}>‹ Back</Text>
            </PressFade>
          )
        }
      />
    </CoachShell>
  );
}
