import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listLoggedExercises } from "../../../lib/programming/memberPlan";
import { listDayTimeline } from "../../../lib/history";
import { todayInBoise, addDays } from "../../../lib/boiseDate";
import { formatDateMDY } from "../../../lib/formatDate";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { fonts, colors } from "../../../lib/theme";

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const CHEVRON_COLOR = "#c9c4bd";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };
const EYEBROW_MUTED = { fontFamily: fonts.sansBold, fontSize: 11, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MODES = [
  { key: "day", label: "By Day" },
  { key: "workout", label: "By Workout" },
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

function DayRow({ entry }) {
  const isSession = entry.type === "session";
  return (
    <View
      className="mb-2 flex-row items-center gap-3 rounded-2xl bg-white px-3.5 py-3"
      style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}
    >
      <View
        className="items-center justify-center rounded-full"
        style={{ width: 24, height: 24, backgroundColor: isSession ? "#4d6142" : "#f5f1ec" }}
      >
        <Ionicons name={isSession ? "checkmark" : "restaurant"} size={isSession ? 12 : 12} color={isSession ? "#fff" : colors.primaryOnWhite} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>
          {entry.label}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
          {entry.subtitle}
        </Text>
      </View>
    </View>
  );
}

function ByDayView({ profile }) {
  const [entries, setEntries] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    listDayTimeline(profile.id)
      .then(setEntries)
      .catch((err) => setLoadError(err.message ?? String(err)));
  }, [profile.id]);

  const sections = useMemo(() => (entries ? groupByDay(entries, todayInBoise()) : []), [entries]);

  if (loadError) {
    return (
      <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
        Something went wrong loading your history: {loadError}
      </Text>
    );
  }
  if (!entries) {
    return <ActivityIndicator color={colors.primary} />;
  }
  if (sections.length === 0) {
    return (
      <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
        No history yet — finalized sessions and nutrition days will show up here.
      </Text>
    );
  }

  return (
    <View>
      {sections.map((section) => (
        <View key={section.date} className="mb-1">
          <Text style={EYEBROW_MUTED}>{section.label}</Text>
          {section.items.map((entry) => (
            <DayRow key={`${entry.type}-${entry.id}`} entry={entry} />
          ))}
        </View>
      ))}
    </View>
  );
}

function ByWorkoutView({ profile }) {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    listLoggedExercises(profile.id)
      .then(setRows)
      .catch((err) => setLoadError(err.message ?? String(err)));
  }, [profile.id]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.exercise.name.toLowerCase().includes(q));
  }, [rows, query]);

  if (loadError) {
    return (
      <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
        Something went wrong loading your history: {loadError}
      </Text>
    );
  }
  if (!rows) {
    return <ActivityIndicator color={colors.primary} />;
  }

  return (
    <View>
      <View
        className="mb-4 flex-row items-center gap-2 rounded-xl bg-white px-3.5"
        style={{ height: 44, borderWidth: 1, borderColor: "#d9d4cd" }}
      >
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

      {filtered.length === 0 ? (
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
          {rows.length === 0 ? "No logged results yet — once you log a set, it'll show up here." : "No exercises match your search."}
        </Text>
      ) : (
        filtered.map((item) => (
          <Link key={item.exercise.id} href={`/(member)/history/${item.exercise.id}`} asChild>
            <Pressable
              className="mb-2 flex-row items-center justify-between rounded-2xl bg-white px-3.5 py-3"
              style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>
                  {item.exercise.name}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 2 }}>
                  Last done {formatDateMDY(item.lastDate)}
                  {item.lastReps ? ` · ${item.lastReps} reps` : ""}
                  {item.lastWeight ? ` @ ${item.lastWeight}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={CHEVRON_COLOR} />
            </Pressable>
          </Link>
        ))
      )}
    </View>
  );
}

export default function HistoryIndex() {
  const { profile, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState("day");

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerStyle={{ paddingTop: insets.top + 6, paddingHorizontal: 24, paddingBottom: 32 }}>
      <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
        My History
      </Text>

      <SegmentedControl segments={MODES} activeKey={mode} onSelect={setMode} />

      {mode === "day" ? <ByDayView profile={profile} /> : <ByWorkoutView profile={profile} />}

      <Pressable
        onPress={signOut}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Sign out"
        className="mt-6 self-start rounded-lg border border-stone-300 px-5 py-3"
      >
        <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
          Sign out
        </Text>
      </Pressable>
    </ScrollView>
  );
}
