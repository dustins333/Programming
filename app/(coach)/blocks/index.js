import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { CoachShell } from "../../../components/CoachShell";
import { CoachBlockOverview } from "../../../components/coach/CoachBlockOverview";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors } from "../../../lib/theme";

// Group Programs on native IS the block overview — program pills at the top,
// the block underneath, nothing to press first.
//
// This used to be the calendar grid (still the web build's version, in
// index.web.js): rows of week × session cells with draft dots, copy mode and
// gap-filling "Start new block" slots. That's a build surface, and building
// happens at a desk. On a phone the question is "what is this program doing",
// which is what the member's own block view already answers — so the coach
// gets the same one rather than a squeezed grid.
//
// Block creation, length, Extend, rolling and past blocks all still live on
// the blocks-management screen, one tap away below — a coach on a phone
// shouldn't be locked out of them, just not led with them.
export default function BlocksNative() {
  const router = useRouter();
  return (
    <CoachShell>
      <CoachBlockOverview
        footer={
          <View style={{ marginTop: 18, alignItems: "center" }}>
            <PressFade onPress={() => router.push("/(coach)/blocks/history")} hitSlop={10} style={{}}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
                Manage blocks ›
              </Text>
            </PressFade>
          </View>
        }
      />
    </CoachShell>
  );
}
