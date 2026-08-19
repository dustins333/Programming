import { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import { TrueCoachMatchModal } from "./TrueCoachMatchModal";
import { listMyTrueCoachImports } from "../lib/programming/truecoachImports";
import { fonts, colors } from "../lib/theme";

// The persistent, always-available way into the TrueCoach picker, on a lift's
// full-history page. One component, two states:
//   unlinked → "Match TrueCoach data →"
//   linked   → "TrueCoach: DB bench, Dumbbell Bench Press · 14 sessions · Manage"
// The linked state doubles as the per-lift unlink affordance — this page is
// where a wrong match actually gets noticed ("that's not right").
//
// Renders NOTHING for a member with no imports at all (never on TrueCoach,
// nutrition-only): house rule, don't tell her she's missing something.
const CARD_BORDER = "#ece7e1";
const OLIVE = "#4d6142";
const OLIVE_BG = "#eef1e7";

export function TrueCoachLinkRow({ userId, exerciseId, exerciseName, onChanged, fetchImports = listMyTrueCoachImports }) {
  const [imports, setImports] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setImports(await fetchImports(userId));
    } catch {
      // A failure here just hides the row — it's a doorway, not the page.
      setImports([]);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!imports || imports.length === 0) return null;

  const linked = imports.filter((i) => i.linked_exercise_id === exerciseId);
  const sessions = linked.reduce((n, i) => n + (i.session_count ?? 0), 0);

  return (
    <>
      {linked.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: OLIVE_BG,
            borderWidth: 1,
            borderColor: "#dbe8cf",
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 14,
          }}
        >
          <Ionicons name="git-merge-outline" size={18} color={OLIVE} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 13, color: "#44403c" }}>
              <Text style={{ fontFamily: fonts.sansSemiBold }}>TrueCoach: </Text>
              {linked.map((i) => i.lift_name).join(", ")}
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 1 }}>
              {sessions} session{sessions === 1 ? "" : "s"} matched
            </Text>
          </View>
          <PressFade onPress={() => setOpen(true)} hitSlop={8} accessibilityLabel="Manage TrueCoach matches" style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 4 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.primaryOnWhite }}>Manage</Text>
          </PressFade>
        </View>
      ) : (
        <PressFade
          onPress={() => setOpen(true)}
          accessibilityLabel="Match TrueCoach data"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            backgroundColor: "#fff",
            borderWidth: 1,
            borderColor: CARD_BORDER,
            borderRadius: 14,
            paddingHorizontal: 12,
            minHeight: 46,
            marginBottom: 14,
          }}
        >
          <Ionicons name="git-merge-outline" size={18} color={colors.primaryOnWhite} />
          <Text style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.primaryOnWhite }}>Match TrueCoach data</Text>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: colors.primaryOnWhite }}>›</Text>
        </PressFade>
      )}
      <TrueCoachMatchModal
        visible={open}
        onClose={() => setOpen(false)}
        userId={userId}
        exerciseId={exerciseId}
        exerciseName={exerciseName}
        fetchImports={fetchImports}
        onChanged={() => {
          load();
          onChanged?.();
        }}
      />
    </>
  );
}
