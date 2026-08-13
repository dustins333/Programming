import { View, Text } from "react-native";
import { diffTargets } from "../../lib/nutrition/targets";
import { formatDateMD } from "../../lib/formatDate";
import { fonts } from "../../lib/theme";

// When / what moved / why — the Targets tab's history rail (coach web v2,
// screen 24). Supersedes TargetsHistory, which listed each row's absolute
// numbers: a coach reading history wants to know what CHANGED and on whose
// say-so, and had to diff two rows of macros in her head to get it.
//
// The note column is the one thing here that isn't derivable — it's why the
// numbers moved, and it's coach-only history (never shown to the client).
export function TargetHistoryTable({ history, coachNameById }) {
  if (!history || history.length === 0) {
    return (
      <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
        No targets set yet.
      </Text>
    );
  }

  return (
    <View>
      <View className="flex-row" style={{ paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#ece7e1", gap: 10 }}>
        {["When", "What moved", "Why"].map((label, i) => (
          <Text
            key={label}
            style={{
              width: i === 0 ? 74 : undefined,
              flex: i === 0 ? undefined : 1,
              fontFamily: fonts.sansBold,
              fontSize: 10,
              color: "#a8a29e",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {label}
          </Text>
        ))}
      </View>

      {history.map((target, i) => {
        // `history` is newest-first (listTargets orders descending), so the
        // row that came BEFORE this one in time is the next index along.
        const previous = history[i + 1] ?? null;
        const changes = diffTargets(target, previous);
        return (
          <View key={target.id} className="flex-row" style={{ paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#f6f3ef", gap: 10 }}>
            <View style={{ width: 74 }}>
              <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#2a211c" }}>
                {formatDateMD(target.effective_date)}
              </Text>
              {coachNameById?.[target.set_by] ? (
                <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 1 }}>
                  {coachNameById[target.set_by]}
                </Text>
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              {changes.length === 0 ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>Re-saved, nothing moved</Text>
              ) : (
                changes.map((change) => (
                  <Text key={change.key} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#44403c", marginBottom: 2 }}>
                    {change.text}
                  </Text>
                ))
              )}
            </View>
            <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: target.note ? "#78716c" : "#c9c4bd" }}>
              {target.note || "—"}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
