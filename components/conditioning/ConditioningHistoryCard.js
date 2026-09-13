import { View, Text } from "react-native";
import { feelOption } from "../../lib/programming/conditioning";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

// A client's conditioning sessions for the coach, newest first: date, time,
// heart rate, how it felt, notes. Renders nothing for a client who has never
// logged one, so it can sit under the lift history without an empty box.
export function ConditioningHistoryCard({ logs, error }) {
  if (error) {
    return (
      <Text className="mb-4 text-red-600" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
        Couldn't load conditioning sessions: {error}
      </Text>
    );
  }
  if (!logs || logs.length === 0) return null;

  return (
    <View>
      <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.55 }}>
        Conditioning
      </Text>
      {logs.map((log) => {
        const feel = feelOption(log.feel);
        return (
          <View key={log.id} className="border-b border-stone-100 py-3">
            <View className="flex-row flex-wrap items-center" style={{ gap: 10 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#44403c", width: 92 }}>
                {formatDateMDY(log.performed_on)}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e" }}>{log.duration_minutes} min</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: log.avg_heart_rate != null ? "#57534e" : colors.muted }}>
                {log.avg_heart_rate != null ? `${log.avg_heart_rate} bpm` : "No HR"}
              </Text>
              {feel ? (
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: "#57534e" }}>
                  {feel.emoji} {feel.label}
                </Text>
              ) : null}
            </View>
            {log.notes ? (
              <Text className="mt-1" style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginLeft: 102 }}>
                {log.notes}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
