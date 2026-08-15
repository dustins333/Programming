import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { todayInBoise, addDays } from "../../../lib/boiseDate";
import { useNutritionAccess } from "../../../lib/nutrition/useNutritionAccess";
import { NutritionAccessMessage } from "../../../components/nutrition/NutritionAccessMessage";
import { listLogs } from "../../../lib/nutrition/dailyLog";
import { getCurrentTarget, deriveCalories } from "../../../lib/nutrition/targets";
import { currentCalendarWeek, summarizeWeek } from "../../../lib/nutrition/weekCycle";
import { MacroDial } from "../../../components/nutrition/MacroDial";
import { StatTile } from "../../../components/nutrition/StatTile";
import { RatingSquares } from "../../../components/nutrition/RatingSquares";
import { NutritionTabHeader } from "../../../components/nutrition/NutritionTabHeader";
import { formatDateMD } from "../../../lib/formatDate";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors } from "../../../lib/theme";
import { useRefreshOnFocus } from "../../../lib/useRefreshOnFocus";

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const DIVIDER = "#f4efe9";
const HERO_DARK = "#33251f";
const HERO_CREAM = "#f7f3ee";
const HERO_SAND = "#beac95";
const HERO_OCHRE = "#e0b070";
const CLAY = "#a46a57";
const OLIVE = "#4d6142";
const DASHED_EMPTY = "#ddd6cd";
const TRACK = "#f0ece6";
const DATA_GOOD = "#5b7f52";
const DATA_NEAR = "#c68a3e";
const DATA_BAD = "#c0492e";
const MISSED_DOT = "#f0ddd2";
const TODAY_BG = "#fdf6f2";
// 8 weeks back is what the weight-trend stat is measured over; the week
// stepper can walk further back than that, it just stops having a trend
// number to compare against.
const TREND_WEEKS = 8;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Three-band version of colorForTarget: on target / near / off. The ±10%
// "on target" band is the same one the rest of the nutrition module uses;
// the middle band exists only so a bar that's close doesn't read as
// identically wrong as one that's miles off.
function bandColor(actual, target) {
  if (actual === null || actual === undefined || !target) return null;
  const diff = Math.abs(actual - target) / target;
  if (diff <= 0.1) return DATA_GOOD;
  if (diff <= 0.2) return DATA_NEAR;
  return DATA_BAD;
}

function fmt(value, digits = 0) {
  if (value === null || value === undefined) return "–";
  return Number(value).toFixed(digits);
}

function Eyebrow({ children, color = "#a8a29e", style }) {
  return (
    <Text
      maxFontSizeMultiplier={1.1}
      style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", color, ...style }}
    >
      {children}
    </Text>
  );
}

// The dark averages band. The logged-count chip is the caveat that
// qualifies every number beside it — three logged days make a "week
// average" that isn't really one.
function AveragesBand({ title, loggedCount, averages, weightTrend }) {
  const stats = [
    { label: "Weight", value: fmt(averages.weight, 1) },
    { label: "Steps", value: averages.steps != null ? Math.round(averages.steps).toLocaleString() : "–" },
    { label: "Sleep", value: fmt(averages.sleep_hours, 1) },
    {
      label: `${TREND_WEEKS}-wk lb`,
      value: weightTrend !== null ? `${weightTrend > 0 ? "+" : ""}${weightTrend}` : "–",
      color: HERO_OCHRE,
    },
  ];
  return (
    <View style={{ backgroundColor: HERO_DARK, borderRadius: 20, padding: 16, marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
        <Eyebrow color={HERO_SAND} style={{ flexShrink: 1 }}>
          {title} | Averages
        </Eyebrow>
        <View style={{ backgroundColor: "rgba(198,138,62,0.2)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.7, color: HERO_OCHRE }}>
            {loggedCount} OF 7 LOGGED
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row" }}>
        {stats.map((s) => (
          <View key={s.label} style={{ flex: 1 }}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 24, color: s.color ?? HERO_CREAM }}>
              {s.value}
            </Text>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: fonts.sansBold, fontSize: 8.5, letterSpacing: 0.7, textTransform: "uppercase", color: "rgba(247,243,238,0.5)", marginTop: 2 }}
            >
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Macro average vs goal — 2×2 of label / value-over-goal / bar.
function MacroAverageCard({ averages, target }) {
  const metrics = [
    { key: "protein_g", label: "Protein", goal: target?.protein_g },
    { key: "carb_g", label: "Carb", goal: target?.carb_g },
    { key: "fat_g", label: "Fat", goal: target?.fat_g },
    { key: "fiber_g", label: "Fiber", goal: target?.fiber_g },
  ];
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10 }}>
        <Eyebrow>Macro average vs goal</Eyebrow>
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e" }}>
          week average
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {metrics.map((m, i) => {
          const value = averages[m.key];
          const color = bandColor(value, m.goal) ?? "#d6d3cd";
          const pct = value != null && m.goal ? Math.max(0, Math.min(1, value / m.goal)) : 0;
          return (
            <View key={m.key} style={{ width: "50%", paddingRight: i % 2 === 0 ? 10 : 0, marginBottom: 12 }}>
              <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: "#57534e" }}>
                {m.label}
              </Text>
              <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#44403c", marginTop: 1 }}>
                {value != null ? Math.round(value) : "–"}
                <Text style={{ fontFamily: fonts.sans, color: "#a8a29e" }}> / {m.goal ?? "–"}</Text>
              </Text>
              <View style={{ height: 8, borderRadius: 999, backgroundColor: TRACK, marginTop: 6, overflow: "hidden" }}>
                <View style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 999, backgroundColor: color }} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// One day's four macro bars — height is the share of goal, fixed P·C·F·Fi
// order so the shape of a day is comparable at a glance down the list.
function MacroBars({ log, target }) {
  const metrics = [
    { key: "protein_g", goal: target?.protein_g },
    { key: "carb_g", goal: target?.carb_g },
    { key: "fat_g", goal: target?.fat_g },
    { key: "fiber_g", goal: target?.fiber_g },
  ];
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 22 }}>
      {metrics.map((m) => {
        const value = log?.[m.key];
        const pct = value != null && m.goal ? Math.max(0.08, Math.min(1, value / m.goal)) : 0;
        const color = bandColor(value, m.goal);
        return (
          <View
            key={m.key}
            style={{
              width: 5,
              height: value != null ? 22 * pct : 22,
              borderRadius: 2,
              backgroundColor: color ?? "transparent",
              borderWidth: color ? 0 : 1,
              borderStyle: "dashed",
              borderColor: DASHED_EMPTY,
            }}
          />
        );
      })}
    </View>
  );
}

// Read-only mirror of the Today entry screen for one past day — same dials,
// same tiles, same scales, so a member reads a past day exactly the way
// they entered it.
function ExpandedDay({ log, target }) {
  const str = (v) => (v === null || v === undefined ? "" : String(v));
  return (
    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: DIVIDER }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <MacroDial readOnly label="Protein" value={str(log?.protein_g)} goal={target?.protein_g} />
        <MacroDial readOnly label="Carb" value={str(log?.carb_g)} goal={target?.carb_g} />
        <MacroDial readOnly label="Fat" value={str(log?.fat_g)} goal={target?.fat_g} />
        <MacroDial readOnly label="Fiber" value={str(log?.fiber_g)} goal={target?.fiber_g} />
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        <StatTile readOnly eyebrow="Weight" value={str(log?.weight)} unit="lb" />
        <StatTile
          readOnly
          eyebrow="Sleep"
          value={str(log?.sleep_hours)}
          unit="hrs"
          footer={<RatingSquares readOnly compact label="quality" size={20} value={str(log?.sleep_quality)} />}
        />
      </View>
      <View style={{ marginTop: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansMedium, fontSize: 13.5, color: "#44403c" }}>
            Steps
          </Text>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 17, color: log?.steps != null ? "#44403c" : "#c9c4bd" }}>
            {log?.steps != null ? Number(log.steps).toLocaleString() : "–"}
          </Text>
        </View>
        <RatingSquares readOnly label="Hunger" value={str(log?.hunger)} />
        <RatingSquares readOnly label="Energy" value={str(log?.energy)} />
      </View>
      {log?.client_note ? (
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12, color: "#57534e", marginTop: 12, fontStyle: "italic" }}>
          {log.client_note}
        </Text>
      ) : null}
    </View>
  );
}

function DayRow({ date, label, log, target, expanded, onToggle, onLogPress, onLayout }) {
  const logged = !!log;
  const calories = logged ? Math.round(deriveCalories({ protein_g: log.protein_g ?? 0, carb_g: log.carb_g ?? 0, fat_g: log.fat_g ?? 0 })) : null;
  const meta = logged
    ? [log.weight != null ? `${Number(log.weight).toFixed(1)} lb` : null, calories ? `${calories} cal` : null, log.steps != null ? `${Number(log.steps).toLocaleString()} steps` : null]
        .filter(Boolean)
        .join(" | ") || "Logged"
    : "Not logged";
  return (
    <View
      onLayout={onLayout}
      style={{
        backgroundColor: logged ? "#fff" : "transparent",
        borderRadius: 16,
        borderWidth: expanded ? 1.5 : logged ? 1 : 1.5,
        borderStyle: logged ? "solid" : "dashed",
        borderColor: expanded ? CLAY : logged ? CARD_BORDER : DASHED_EMPTY,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 8,
        ...(expanded
          ? { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 2 }
          : null),
      }}
    >
      <Pressable
        onPress={logged ? onToggle : onLogPress}
        accessibilityLabel={logged ? `${label}, ${expanded ? "collapse" : "expand"}` : `${label}, not logged — open entry form`}
        style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: logged ? "#44403c" : "#a8a29e" }}>
            {label}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 2 }}>
            {logged ? meta : "Not logged | tap to fill it in"}
          </Text>
        </View>
        <MacroBars log={log} target={target} />
        {logged ? (
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color="#c9c4bd" />
        ) : (
          <Ionicons name="chevron-forward" size={16} color="#c9c4bd" />
        )}
      </Pressable>
      {expanded && logged ? <ExpandedDay log={log} target={target} /> : null}
    </View>
  );
}

export default function NutritionWeekly() {
  // Tabs keep this screen mounted, so a mount-only load never re-runs
  // on a return visit — see lib/useRefreshOnFocus.js.
  const focusKey = useRefreshOnFocus();

  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const today = todayInBoise();
  const access = useNutritionAccess(profile.id);
  useFocusEffect(useCallback(() => access.refetch(), [access.refetch]));

  const [logs, setLogs] = useState(null);
  const [target, setTarget] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  // 0 = the current calendar week; each step back is one week earlier. The
  // arrows move the whole screen together — band, macro averages and day
  // list — which is what replaced the old "Prior weeks" list.
  const [weekOffset, setWeekOffset] = useState(0);
  const [expandedDate, setExpandedDate] = useState(null);
  const scrollViewRef = useRef(null);
  const rowOffsets = useRef({});

  const week = useMemo(() => {
    const current = currentCalendarWeek(today);
    const start = addDays(current.start, -7 * weekOffset);
    return { start, end: addDays(start, 6) };
  }, [today, weekOffset]);

  useEffect(() => {
    if (access.status !== "active") return;
    setLoadError(null);
    (async () => {
      try {
        const [logRows, targetRow] = await Promise.all([listLogs(profile.id, { limit: 200 }), getCurrentTarget(profile.id, week.end)]);
        setLogs(logRows);
        setTarget(targetRow);
      } catch (err) {
        setLoadError(err.message ?? String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.status, profile.id, week.end, retryKey, focusKey]);

  // Collapse whatever was open when the week changes — an expanded row from
  // the previous week has nothing to do with the one now on screen.
  useEffect(() => {
    setExpandedDate(null);
  }, [week.start]);

  if (access.status !== "active") {
    return <NutritionAccessMessage status={access.status} error={access.error} onRetry={access.refetch} />;
  }

  if (loadError) {
    return (
      <View className="flex-1" style={{ backgroundColor: CANVAS }}>
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 24 }}>
          <NutritionTabHeader activeKey="weekly" />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="mb-3 text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading your weekly averages: {loadError}
          </Text>
          <Pressable onPress={() => setRetryKey((k) => k + 1)} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!logs) return <NutritionAccessMessage status="loading" />;

  const summary = summarizeWeek(logs, week.start, week.end);
  const logsByDate = Object.fromEntries(summary.days.map((d) => [d.date, d]));

  // 8-week weight trend, always measured back from today rather than from
  // whichever week is on screen — it's a "where am I overall" number, not a
  // property of the week being viewed.
  const trendWeeks = Array.from({ length: TREND_WEEKS }, (_, i) => {
    const current = currentCalendarWeek(today);
    const start = addDays(current.start, -7 * i);
    return summarizeWeek(logs, start, addDays(start, 6)).averages.weight;
  }).filter((w) => w != null);
  const weightTrend = trendWeeks.length >= 2 ? Math.round((trendWeeks[0] - trendWeeks[trendWeeks.length - 1]) * 10) / 10 : null;

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(week.start, i);
    return { date, name: DAY_NAMES[i], log: logsByDate[date] ?? null, isToday: date === today, isFuture: date > today };
  });

  const handleChipPress = (date) => {
    const day = days.find((d) => d.date === date);
    if (!day || day.isFuture) return;
    if (!day.log) {
      router.push({ pathname: "/(member)/nutrition", params: { date } });
      return;
    }
    setExpandedDate(date);
    const y = rowOffsets.current[date];
    if (y != null) scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true });
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      className="flex-1"
      style={{ backgroundColor: CANVAS }}
      contentContainerClassName="px-6 pb-8"
      contentContainerStyle={{ paddingTop: insets.top + 6 }}
    >
      <NutritionTabHeader activeKey="weekly" />

      <AveragesBand
        title={weekOffset === 0 ? "This week" : `${formatDateMD(week.start)} – ${formatDateMD(week.end)}`}
        loggedCount={summary.days.length}
        averages={summary.averages}
        weightTrend={weightTrend}
      />

      <MacroAverageCard averages={summary.averages} target={target} />

      {/* Week stepper — the arrows move band, averages and day list
          together. Forward stops at the current week; there's nothing
          logged in the future to look at. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <PressFade
          onPress={() => setWeekOffset((o) => o + 1)}
          accessibilityLabel="Previous week"
          pressedOpacity={0.6}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: CARD_BORDER,
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",

          }}
        >
          <Ionicons name="chevron-back" size={16} color="#57534e" />
        </PressFade>
        <View style={{ flex: 1, flexDirection: "row", gap: 4 }}>
          {days.map((day) => {
            const selected = expandedDate === day.date;
            const dotColor = day.log ? OLIVE : day.isFuture ? "transparent" : MISSED_DOT;
            return (
              <PressFade
                key={day.date}
                onPress={() => handleChipPress(day.date)}
                disabled={day.isFuture}
                accessibilityLabel={`${day.name} ${formatDateMD(day.date)}`}
                pressedOpacity={0.6}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 8,
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: selected ? CLAY : day.isToday ? TODAY_BG : "transparent",
                  borderWidth: day.isToday && !selected ? 1.5 : 0,
                  borderColor: CLAY,
            opacity: day.isFuture ? 0.4 : 1,
          }}
              >
                <Text
                  maxFontSizeMultiplier={1}
                  style={{ fontFamily: fonts.sansBold, fontSize: 9.5, color: selected ? "#fff" : "#a8a29e" }}
                >
                  {day.name.slice(0, 1)}
                </Text>
                <Text
                  maxFontSizeMultiplier={1}
                  style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: selected ? "#fff" : "#44403c" }}
                >
                  {Number(day.date.slice(8, 10))}
                </Text>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: selected ? "rgba(255,255,255,0.85)" : dotColor,
                    borderWidth: day.isToday && !day.log && !selected ? 1.5 : 0,
                    borderColor: CLAY,
                  }}
                />
              </PressFade>
            );
          })}
        </View>
        <PressFade
          onPress={() => setWeekOffset((o) => Math.max(0, o - 1))}
          disabled={weekOffset === 0}
          accessibilityLabel="Next week"
          pressedOpacity={0.6}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: CARD_BORDER,
            backgroundColor: "#fff",
            alignItems: "center",
            justifyContent: "center",
            opacity: weekOffset === 0 ? 0.35 : 1,
          }}
        >
          <Ionicons name="chevron-forward" size={16} color="#57534e" />
        </PressFade>
      </View>

      <Eyebrow style={{ marginBottom: 10 }}>Day by day</Eyebrow>
      {days
        .filter((day) => !day.isFuture)
        .map((day) => (
          <DayRow
            key={day.date}
            label={`${day.name} ${formatDateMD(day.date)}${day.isToday ? " | Today" : ""}`}
            log={day.log}
            target={target}
            expanded={expandedDate === day.date}
            onToggle={() => setExpandedDate((d) => (d === day.date ? null : day.date))}
            onLogPress={() => router.push({ pathname: "/(member)/nutrition", params: { date: day.date } })}
            onLayout={(e) => {
              rowOffsets.current[day.date] = e.nativeEvent.layout.y;
            }}
          />
        ))}
    </ScrollView>
  );
}
