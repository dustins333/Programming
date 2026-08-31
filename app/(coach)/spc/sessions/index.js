import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { CoachShell } from "../../../../components/CoachShell";
import { PressFade } from "../../../../components/PressFade";
import { SegmentedControl } from "../../../../components/SegmentedControl";
import { listHubHistory, HISTORY_DEFAULT_DAYS } from "../../../../lib/programming/hubHistory";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { formatTimeInBoise, todayInBoise, addDays } from "../../../../lib/boiseDate";
import { formatDateShort } from "../../../../lib/formatDate";
import { fonts, colors, type } from "../../../../lib/theme";

// Past live boards. Reached from the third segment on SPC Live Sessions, and
// only while nothing is running — mid-board there is exactly one session that
// matters and it isn't in here.
//
// Two days by default, because the thing this exists for is "I ran the noon
// group, let me finish writing it up tonight". Older boards aren't deleted,
// just one tap further away — a window that quietly loses last week would be
// worse than a list that scrolls.

const CARD_BORDER = "#ece7e1";
const INK = "#2a211c";

function dayLabel(date) {
  const today = todayInBoise();
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatDateShort(date);
}

function minutesBetween(a, b) {
  const mins = Math.round((new Date(b) - new Date(a)) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return null;
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function SessionRow({ session, onPress }) {
  const names = session.clients.map((c) => (c.client_name ?? "").split(" ")[0]).filter(Boolean);
  const length = minutesBetween(session.startedAt, session.endedAt);
  return (
    <PressFade
      onPress={onPress}
      style={{
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 14,
        paddingVertical: 13,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 15, color: INK }}>
            {formatTimeInBoise(session.startedAt)}
          </Text>
          {session.coachName ? (
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
              {session.coachName}
            </Text>
          ) : null}
        </View>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansMedium, fontSize: 13.5, color: "#44403c", marginTop: 3 }}>
          {names.join(" | ")}
        </Text>
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 3 }}>
          {session.loggedSets} set{session.loggedSets === 1 ? "" : "s"} logged{length ? ` | ${length}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#c9c4bd" />
    </PressFade>
  );
}

export default function SpcSessionHistory() {
  const { profile } = useAuth();
  const [scope, setScope] = useState("all"); // "all" | "mine"
  const [days, setDays] = useState(HISTORY_DEFAULT_DAYS);
  const [sessions, setSessions] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(() => {
    setLoadError(null);
    listHubHistory({ days, coachId: scope === "mine" ? profile?.id : null })
      .then(setSessions)
      .catch((e) => setLoadError(e.message ?? "Something went wrong."));
  }, [days, scope, profile?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Grouped by the day the board actually ran, not by created_at's UTC date —
  // an 8pm session would otherwise land under tomorrow.
  const byDay = [];
  for (const s of sessions ?? []) {
    const last = byDay[byDay.length - 1];
    if (last && last.date === s.date) last.rows.push(s);
    else byDay.push({ date: s.date, rows: [s] });
  }

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: "#fff" }} contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 28, flexGrow: 1 }}>
        <PressFade
          onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/spc/live"))}
          style={{ marginBottom: 6 }}
        >
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
        </PressFade>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.1} className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Past sessions
        </Text>
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 4, marginBottom: 14 }}>
          Open one to see what your girls lifted and add notes.
        </Text>

        <SegmentedControl
          segments={[
            { key: "all", label: "All coaches" },
            { key: "mine", label: "Just mine" },
          ]}
          activeKey={scope}
          onSelect={setScope}
          dense
        />

        {loadError ? (
          <View style={{ paddingVertical: 24 }}>
            <Text style={{ fontFamily: fonts.sans, color: "#b23a22" }}>Couldn't load past sessions: {loadError}</Text>
            <PressFade onPress={load} style={{ marginTop: 10 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
            </PressFade>
          </View>
        ) : sessions === null ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : sessions.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, paddingVertical: 24 }}>
            {scope === "mine"
              ? `You haven't run a board in the last ${days} days.`
              : `No boards were run in the last ${days} days.`}
          </Text>
        ) : (
          <View style={{ gap: 18, marginTop: 4 }}>
            {byDay.map((group) => (
              <View key={group.date} style={{ gap: 8 }}>
                <Text
                  maxFontSizeMultiplier={1.15}
                  style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: "#a8a29e" }}
                >
                  {dayLabel(group.date).toUpperCase()}
                </Text>
                {group.rows.map((s) => (
                  <SessionRow key={s.id} session={s} onPress={() => router.push(`/(coach)/spc/sessions/${s.id}`)} />
                ))}
              </View>
            ))}
          </View>
        )}

        {sessions !== null && !loadError ? (
          <PressFade onPress={() => setDays((d) => d + 7)} style={{ alignSelf: "flex-start", marginTop: 22 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: colors.primaryOnWhite }}>
              Show older ({days} days shown) →
            </Text>
          </PressFade>
        ) : null}
      </ScrollView>
    </CoachShell>
  );
}
