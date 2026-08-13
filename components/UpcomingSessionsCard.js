import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { formatDateMD } from "../lib/formatDate";
import { todayInBoise, addDays, dayOfWeekInBoise } from "../lib/boiseDate";
import { fonts, colors } from "../lib/theme";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Sits beside RecentSessionsCard on the client page — what they've done on
// one side, what's coming on the other. Read-only: nothing here is a row in
// the database yet (a session only exists once it's finalized), so there's
// nothing to expand into. See listUpcomingSessionsForUser for where these
// are derived from.
function whenLabel(date, today, fallback) {
  // SPC sessions carry no date at all (a client picks the day), so the
  // source supplies which week it lands in instead.
  if (!date) return fallback ?? "This week";
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return `${WEEKDAY_SHORT[dayOfWeekInBoise(date)]} ${formatDateMD(date)}`;
}

function UpcomingRow({ session, today }) {
  const isToday = session.date === today;
  return (
    <View className="flex-row items-center justify-between border-b border-stone-100 py-3">
      <View className="flex-1 pr-3">
        {/* Same two-line shape as the training-history rows: which session
            on top, the coach's name for it (if any) down with the meta. */}
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13.5 }} className="text-stone-700">
          {session.label}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            {session.meta}
            {session.title ? ` · ${session.title}` : ""}
          </Text>
          {session.isDraft ? (
            <View className="rounded-full" style={{ backgroundColor: "#fdf1de", paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, color: "#92400e", letterSpacing: 0.4 }}>DRAFT</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text
        style={{
          fontFamily: isToday ? fonts.sansBold : fonts.sansMedium,
          fontSize: 12.5,
          color: isToday ? colors.primaryOnWhite : "#78716c",
        }}
      >
        {whenLabel(session.date, today, session.when)}
      </Text>
    </View>
  );
}

export function UpcomingSessionsCard({ sessions, errors = [], initialCount = 3 }) {
  const [expanded, setExpanded] = useState(false);
  const today = todayInBoise();

  // A module that failed is never reported as "nothing scheduled" — the
  // two look identical to a coach otherwise, and that's exactly what made
  // an SPC-only client's empty card read as "they have nothing" when the
  // SPC fetch was actually erroring.
  const errorNote =
    errors.length > 0 ? (
      <Text className="pt-2 text-xs" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
        Couldn't load {errors.map((e) => e.module).join(", ")} — this list may be incomplete.
      </Text>
    ) : null;

  if (sessions.length === 0) {
    return (
      <View>
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
          {errors.length > 0 ? "Couldn't load what's coming up." : "Nothing scheduled from here."}
        </Text>
        {errorNote}
      </View>
    );
  }

  const shown = expanded ? sessions : sessions.slice(0, initialCount);
  const hidden = sessions.length - shown.length;

  return (
    <View>
      {shown.map((session) => (
        <UpcomingRow key={session.id} session={session} today={today} />
      ))}
      {errorNote}
      {hidden > 0 || expanded ? (
        <Pressable onPress={() => setExpanded((prev) => !prev)} className="pt-3" hitSlop={8}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
            {expanded ? "Show fewer" : `Show ${hidden} more`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
