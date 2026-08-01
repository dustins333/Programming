import { View, Text, Pressable } from "react-native";
import { fonts, colors } from "../lib/theme";

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// Lets a coach say exactly which weekday(s) map to each session slot for
// a group program — e.g. Flagship's Session 1 = Mon+Tue, or a 2x/week
// specialty program's Session 1 = Monday only. `value` is an array of
// day-arrays (0=Sun..6=Sat), one entry per session — keep it in sync with
// sessionsPerWeek via resizeSessionDays below as the coach adjusts that
// field, so this never renders more/fewer rows than there are sessions.
export function SessionDayPicker({ sessionsPerWeek, value, onChange }) {
  const toggleDay = (sessionIndex, day) => {
    const next = value.map((days, i) => {
      if (i !== sessionIndex) return days;
      return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
    });
    onChange(next);
  };

  return (
    <View>
      {Array.from({ length: sessionsPerWeek }, (_, i) => i).map((sessionIndex) => (
        <View key={sessionIndex} className="mb-2.5">
          <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
            Session {sessionIndex + 1}
          </Text>
          <View className="flex-row gap-1.5">
            {DAY_LABELS.map((label, day) => {
              const active = (value[sessionIndex] ?? []).includes(day);
              return (
                <Pressable
                  key={day}
                  onPress={() => toggleDay(sessionIndex, day)}
                  className="items-center justify-center rounded-full"
                  style={{
                    width: 34,
                    height: 34,
                    borderWidth: 1.5,
                    borderColor: active ? colors.primary : "#e7e5e4",
                    backgroundColor: active ? colors.primary : "white",
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11, color: active ? "white" : "#78716c" }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

// Keeps a session_days array in sync with sessionsPerWeek — grows by
// padding empty arrays, shrinks by truncating, preserving already-chosen
// days for whichever sessions still exist after the resize.
export function resizeSessionDays(sessionDays, sessionsPerWeek) {
  const next = sessionDays.slice(0, sessionsPerWeek);
  while (next.length < sessionsPerWeek) next.push([]);
  return next;
}
