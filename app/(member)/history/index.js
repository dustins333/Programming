import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TextInput, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listDayTimeline } from "../../../lib/history";
import { getExerciseStats, biggestJump } from "../../../lib/programming/exerciseStats";
import { todayInBoise, addDays } from "../../../lib/boiseDate";
import { formatDateMDY, formatDateMD } from "../../../lib/formatDate";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { SessionHistoryModal } from "../../../components/SessionHistoryModal";
import { MilestoneDetailModal } from "../../../components/nutrition/MilestoneDetailModal";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors } from "../../../lib/theme";
import { useRefreshOnFocus } from "../../../lib/useRefreshOnFocus";

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const CHEVRON_COLOR = "#c9c4bd";
const OLIVE = "#4d6142";
const CLAY = "#a46a57";
const OCHRE = "#c68a3e";
const OCHRE_TEXT = "#8a5a2e";
const OCHRE_BG = "#fdf8ef";
const OCHRE_BORDER = "#f0e0c4";
const HERO_DARK = "#33251f";
const HERO_CREAM = "#f7f3ee";
const HERO_OCHRE = "#e0b070";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MODES = [
  { key: "day", label: "By Day" },
  { key: "workout", label: "Exercises" },
];

function shortDateLabel(isoDate) {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

// Groups the flat timeline into Today/Yesterday/short-date sections —
// entries are already date-descending from listDayTimeline.
function groupByDay(entries, today) {
  const yesterday = addDays(today, -1);
  const sections = [];
  const byDate = new Map();
  for (const entry of entries) {
    if (!byDate.has(entry.date)) {
      const label = entry.date === today ? "Today" : entry.date === yesterday ? "Yesterday" : shortDateLabel(entry.date);
      const section = { date: entry.date, label, items: [] };
      byDate.set(entry.date, section);
      sections.push(section);
    }
    byDate.get(entry.date).items.push(entry);
  }
  return sections;
}

// Consecutive weeks (counting back from this week) containing at least one
// finalized session. Deliberately weeks, not days — nobody trains daily,
// and a day-streak would break constantly and mean nothing.
function weekStreak(sessionDates, today) {
  if (sessionDates.length === 0) return 0;
  const set = new Set(sessionDates);
  let streak = 0;
  for (let week = 0; week < 260; week += 1) {
    const start = addDays(today, -7 * (week + 1) + 1);
    let found = false;
    for (let d = 0; d < 7; d += 1) {
      if (set.has(addDays(start, d))) {
        found = true;
        break;
      }
    }
    if (found) streak += 1;
    // The current (still-running) week not having a session yet doesn't
    // break a streak — only a fully elapsed empty week does.
    else if (week > 0) break;
  }
  return streak;
}

function StatTile({ value, label, color }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, paddingHorizontal: 14, paddingVertical: 12, ...CARD_SHADOW }}>
      <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 26, color }}>
        {value}
      </Text>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase", color: "#a8a29e", marginTop: 2 }}
      >
        {label}
      </Text>
    </View>
  );
}

// A bar chart small enough to read as a shape, not a chart — rising opacity
// with the newest bar solid, per the handoff.
function Sparkline({ values, color = CLAY, highlightLast }) {
  const real = values.filter((v) => v != null);
  if (real.length < 2) return null;
  const max = Math.max(...real);
  const min = Math.min(...real);
  const span = max - min || 1;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 26 }}>
      {values.map((v, i) => {
        const isLast = i === values.length - 1;
        const pct = v == null ? 0 : 0.25 + ((v - min) / span) * 0.75;
        return (
          <View
            key={i}
            style={{
              width: 5,
              height: Math.max(4, 26 * pct),
              borderRadius: 2,
              backgroundColor: color,
              opacity: highlightLast && isLast ? 1 : 0.25 + (i / Math.max(1, values.length - 1)) * 0.55,
            }}
          />
        );
      })}
    </View>
  );
}

function TimelineRow({ entry, onPress, isLast }) {
  const isSession = entry.type === "session";
  const isMilestone = entry.type === "milestone";
  const isPr = entry.type === "pr";
  const isPressable = isSession || isMilestone;
  const Wrapper = isPressable ? PressFade : View;
  return (
    <Wrapper
      {...(isPressable ? { onPress } : {})}
      style={{
        marginBottom: isLast ? 0 : 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderRadius: 16,
        backgroundColor: isPr ? OCHRE_BG : "#fff",
        borderWidth: 1,
        borderColor: isPr ? OCHRE_BORDER : CARD_BORDER,
        paddingHorizontal: 14,
        paddingVertical: 12,
        ...CARD_SHADOW,
      }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isSession ? OLIVE : isPr ? OCHRE : isMilestone ? "#eef1e7" : "#f5f1ec",
        }}
      >
        {isPr ? (
          <Text maxFontSizeMultiplier={1} style={{ fontSize: 12, color: "#fff" }}>
            ★
          </Text>
        ) : isMilestone ? (
          entry.emoji ? (
            <Text style={{ fontSize: 12 }}>{entry.emoji}</Text>
          ) : (
            <Ionicons name="trophy" size={12} color={OLIVE} />
          )
        ) : (
          <Ionicons name={isSession ? "checkmark" : "restaurant"} size={12} color={isSession ? "#fff" : colors.primaryOnWhite} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: isPr ? fonts.sansBold : fonts.sansSemiBold, fontSize: 13.5, color: isPr ? OCHRE_TEXT : "#44403c" }}>
          {entry.label}
        </Text>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11, color: isPr ? "#a58255" : "#a8a29e", marginTop: 1 }}>
          {entry.subtitle}
        </Text>
      </View>
      {isPressable ? <Ionicons name="chevron-forward" size={16} color={CHEVRON_COLOR} /> : null}
    </Wrapper>
  );
}

function ByDayView({ profile, prEntries, sessionCount, streak, statsError }) {
  // Its own counter — this is a separate component from HistoryIndex
  // below, and the timeline it loads goes stale for the same reason.
  const focusKey = useRefreshOnFocus();

  const [entries, setEntries] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setLoadError(null);
    listDayTimeline(profile.id)
      .then(setEntries)
      .catch((err) => setLoadError(err.message ?? String(err)));
  }, [profile.id, retryKey, focusKey]);

  const sections = useMemo(() => {
    if (!entries) return [];
    const merged = [...entries, ...prEntries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return groupByDay(merged, todayInBoise());
  }, [entries, prEntries]);

  if (loadError) {
    return (
      <View className="items-center py-6">
        <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your history: {loadError}
        </Text>
        <PressFade onPress={() => setRetryKey((k) => k + 1)} style={{ borderRadius: 999, borderWidth: 1, borderColor: CARD_BORDER, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Try again</Text>
        </PressFade>
      </View>
    );
  }
  if (!entries) return <ActivityIndicator color={colors.primary} />;

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>
        {/* "Logged sessions", never just "sessions" — members must not read
            this as attendance from the gym management system. */}
        <StatTile value={statsError ? "—" : sessionCount} label="Logged sessions" color={CLAY} />
        <StatTile value={statsError ? "—" : streak} label="Week streak" color={OLIVE} />
      </View>

      {sections.length === 0 ? (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          No history yet — finalized sessions and nutrition days will show up here.
        </Text>
      ) : (
        <View style={{ position: "relative", paddingLeft: 22 }}>
          {/* Timeline spine — a single rule behind the whole list, with the
              day headings sitting on it as canvas-filled nodes. */}
          <View style={{ position: "absolute", left: 7, top: 6, bottom: 6, width: 2, backgroundColor: CARD_BORDER }} />
          {sections.map((section) => (
            <View key={section.date} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, marginLeft: -22 }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: CANVAS, borderWidth: 2, borderColor: CARD_BORDER, marginRight: 6 }} />
                <Text
                  maxFontSizeMultiplier={1.1}
                  style={{
                    fontFamily: fonts.sansBold,
                    fontSize: 10,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: section.label === "Today" ? CLAY : "#a8a29e",
                  }}
                >
                  {section.label}
                </Text>
              </View>
              {section.items.map((entry, i) => (
                <TimelineRow
                  key={`${entry.type}-${entry.id}`}
                  entry={entry}
                  isLast={i === section.items.length - 1}
                  onPress={() => setSelectedEntry(entry)}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      <SessionHistoryModal
        visible={selectedEntry?.type === "session"}
        onClose={() => setSelectedEntry(null)}
        title={selectedEntry?.label ?? ""}
        date={selectedEntry?.date}
        userId={profile.id}
      />
      <MilestoneDetailModal milestone={selectedEntry?.type === "milestone" ? selectedEntry : null} onClose={() => setSelectedEntry(null)} />
    </View>
  );
}

function ByWorkoutView({ exercises, loadError, onRetry }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!exercises) return [];
    const q = query.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter((r) => r.exercise.name.toLowerCase().includes(q));
  }, [exercises, query]);

  const jump = useMemo(() => (exercises ? biggestJump(exercises) : null), [exercises]);

  if (loadError) {
    return (
      <View className="items-center py-6">
        <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
          Something went wrong loading your history: {loadError}
        </Text>
        <PressFade onPress={onRetry} style={{ borderRadius: 999, borderWidth: 1, borderColor: CARD_BORDER, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Try again</Text>
        </PressFade>
      </View>
    );
  }
  if (!exercises) return <ActivityIndicator color={colors.primary} />;

  return (
    <View>
      <View className="mb-4 flex-row items-center gap-2 rounded-xl bg-white px-3.5" style={{ height: 44, borderWidth: 1, borderColor: "#d9d4cd" }}>
        <Ionicons name="search" size={15} color="#a8a29e" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises…"
          placeholderTextColor="#a8a29e"
          className="flex-1"
          style={{ fontFamily: fonts.sans, fontSize: 14, color: "#44403c" }}
        />
      </View>

      {jump && !query ? (
        <View style={{ backgroundColor: HERO_DARK, borderRadius: 20, padding: 16, marginBottom: 16 }}>
          <Text
            maxFontSizeMultiplier={1.1}
            style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.2, textTransform: "uppercase", color: "#beac95" }}
          >
            Biggest jump this block
          </Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: HERO_CREAM }}>
                {jump.exercise.name}
              </Text>
              <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 18, color: HERO_OCHRE, marginTop: 2 }}>
                +{jump.jump} lb
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Sparkline values={jump.trend} color={HERO_OCHRE} highlightLast />
              <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 9.5, color: "rgba(247,243,238,0.5)", marginTop: 4 }}>
                {formatDateMD(jump.jumpFrom)} – {formatDateMD(jump.jumpTo)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {filtered.length === 0 ? (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          {exercises.length === 0 ? "No logged results yet — once you log a set, it'll show up here." : "No exercises match your search."}
        </Text>
      ) : (
        filtered.map((item) => (
          <PressFade
            key={item.exercise.id}
            onPress={() => router.push(`/(member)/history/${item.exercise.id}`)}
            style={{
              marginBottom: 8,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderRadius: 16,
              backgroundColor: "#fff",
              borderWidth: 1,
              borderColor: CARD_BORDER,
              paddingHorizontal: 14,
              paddingVertical: 12,
              ...CARD_SHADOW,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#44403c" }}>
                {item.exercise.name}
              </Text>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 2 }}>
                Last done {formatDateMDY(item.lastDate)}
                {item.lastReps ? ` | ${item.lastReps} reps` : ""}
                {item.lastWeight ? ` @ ${item.lastWeight}` : ""}
              </Text>
            </View>
            <Sparkline values={item.trend} />
            {item.best != null ? (
              <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
                <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 19, color: OLIVE }}>
                  {item.best}
                </Text>
                <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 8.5, letterSpacing: 0.8, color: "#a8a29e" }}>
                  BEST LB
                </Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={16} color={CHEVRON_COLOR} />
          </PressFade>
        ))
      )}
    </View>
  );
}

export default function HistoryIndex() {
  // Tabs keep this screen mounted, so a mount-only load never re-runs
  // on a return visit — see lib/useRefreshOnFocus.js.
  const focusKey = useRefreshOnFocus();

  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState("day");
  // Shared by both views — By Day needs the PR entries and the session
  // count, Exercises needs the per-exercise series. One query either way.
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setStatsError(null);
    getExerciseStats(profile.id)
      .then(setStats)
      .catch((err) => setStatsError(err.message ?? String(err)));
  }, [profile.id, retryKey, focusKey]);

  const prEntries = useMemo(
    () =>
      (stats?.personalRecords ?? []).map((pr) => ({
        type: "pr",
        id: `${pr.exerciseId}-${pr.date}`,
        date: pr.date,
        label: `New best | ${pr.exerciseName} ${pr.weight} lb`,
        subtitle: pr.previousDate ? `up ${pr.delta} lb since ${shortDateLabel(pr.previousDate)}` : `up ${pr.delta} lb`,
      })),
    [stats]
  );

  const { sessionCount, streak } = useMemo(() => {
    const dates = [...new Set((stats?.exercises ?? []).flatMap((e) => e.sessions.map((s) => s.date)))];
    return { sessionCount: dates.length, streak: weekStreak(dates, todayInBoise()) };
  }, [stats]);

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerStyle={{ paddingTop: insets.top + 6, paddingHorizontal: 24, paddingBottom: 32 }}>
      <View className="mb-4 flex-row items-center" style={{ gap: 12 }}>
        <Text className="flex-1 text-2xl" numberOfLines={1} style={{ fontFamily: fonts.display, color: colors.primary }}>
          My History
        </Text>
        <PressFade onPress={() => router.push("/(member)/settings")} hitSlop={10} accessibilityLabel="Settings" style={{}}>
          <Ionicons name="settings-outline" size={22} color="#78716c" />
        </PressFade>
        <Image source={require("../../../assets/kova-logo.jpg")} style={{ width: 34, height: 34, borderRadius: 17 }} />
      </View>

      <SegmentedControl segments={MODES} activeKey={mode} onSelect={setMode} />

      {mode === "day" ? (
        /* statsError is passed so the tiles can say "—" rather than render
           a confident 0 sessions / 0-week streak when the stats fetch is
           what actually failed. */
        <ByDayView profile={profile} prEntries={prEntries} sessionCount={sessionCount} streak={streak} statsError={statsError} />
      ) : (
        <ByWorkoutView exercises={stats?.exercises ?? null} loadError={statsError} onRetry={() => setRetryKey((k) => k + 1)} />
      )}
    </ScrollView>
  );
}
