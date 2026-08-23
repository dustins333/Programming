import { View, Text } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CoachShell } from "../../../components/CoachShell";
import { CoachSpcOverview } from "../../../components/coach/CoachSpcOverview";
import { CoachMessageBubble } from "../../../components/CoachMessageBubble";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors } from "../../../lib/theme";

// An SPC client on native IS the block overview — nothing above it, nothing
// to press first.
//
// This page used to stack seven sections on a phone: status, assigned coach,
// sessions per week, coach notes, recent sessions, the overview, then the
// week × session build grid with its copy mode. All of that still exists on
// web (the .web.js sibling, which shadows this file entirely there), which is
// where a coach actually restructures a block. On a phone the question is
// "what is this client doing" — so that's the whole screen.
//
// What this deliberately gives up on native: editing status, assigned coach
// and sessions-per-week, the coach's notes, the recent-sessions list, and
// building from the grid. Block length, Extend, rolling and past blocks are
// still one tap away below.
export default function SpcClientDetailNative() {
  const router = useRouter();
  const { userId } = useLocalSearchParams();

  return (
    <CoachShell>
      <CoachSpcOverview
        userId={userId}
        showBack
        goalEditable
        backTo="/(coach)/spc"
        footer={
          <View style={{ marginTop: 18, alignItems: "center" }}>
            <PressFade onPress={() => router.push(`/(coach)/spc/history/${userId}`)} hitSlop={10} style={{}}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
                Manage blocks ›
              </Text>
            </PressFade>
          </View>
        }
      />
      <CoachMessageBubble userId={userId} />
    </CoachShell>
  );
}
