import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { MacroRingRow } from "./MacroRingRow";
import { TrendChart } from "../TrendChart";
import { MetricSparkTiles } from "./MetricSparkTiles";
import { FocusChecklist } from "./FocusChecklist";
import { GamePlan } from "./GamePlan";
import { MilestoneSlots } from "./MilestoneSlots";
import { rollingWeekWindows, summarizeWeek } from "../../lib/nutrition/weekCycle";
import { addDays } from "../../lib/boiseDate";
import { fonts } from "../../lib/theme";

// The client Dashboard (coach web v2, screen 19). Absorbs what used to be a
// separate Trends tab: a coach looking at a weight trend is already asking
// "and what were the macros doing", and making that a tab switch meant the
// two were never on screen together.
//
// ONE range control governs the weight chart and all four small charts
// (handoff data note 8). The macro rings deliberately stay pinned to the
// last 7 days whatever the range says — a 6-month macro average is not a
// number anyone should act on, and putting it under the same picker would
// invite exactly that.

const RANGES = [
  { key: 7, label: "W" },
  { key: 30, label: "1m" },
  { key: 90, label: "3m" },
  { key: 180, label: "6m" },
  { key: 365, label: "1y" },
];

function Card({ children, style }) {
  return (
    <View
      className="rounded-2xl p-5"
      style={[
        {
          borderWidth: 1,
          borderColor: "#ece7e1",
          backgroundColor: "white",
          shadowColor: "#44403c",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function RailCard({ title, headerRight, children }) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <View className="mb-3 flex-row items-center justify-between">
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title}
        </Text>
        {headerRight}
      </View>
      {children}
    </Card>
  );
}

export function NutritionDashboardTab({ userId, coachId, client, logs, currentTarget, focusItems, milestones, today, isWide, onChanged }) {
  const [range, setRange] = useState(30);
  // Measured, not derived from window width. An SVG needs a real pixel width,
  // and computing one from useWindowDimensions means subtracting the sidebar,
  // the page padding and the rail by hand — which was both wrong (the sidebar
  // is 232px, not the 320 that was guessed) and capped, so the chart stayed
  // put while the card behind it kept growing. onLayout gives the actual box.
  const [chartWidth, setChartWidth] = useState(0);

  const { recent } = rollingWeekWindows(today);
  const weekSummary = useMemo(() => summarizeWeek(logs, recent.start, recent.end), [logs, recent.start, recent.end]);

  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? "";
  const cutoff = addDays(today, -range);
  const rangeLogs = useMemo(
    () =>
      logs
        .filter((log) => log.date >= cutoff)
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [logs, cutoff]
  );
  const weightPoints = rangeLogs.map((log) => ({ date: log.date, value: log.weight }));

  const firstWeight = weightPoints.find((p) => p.value !== null && p.value !== undefined)?.value ?? null;
  const lastWeight = [...weightPoints].reverse().find((p) => p.value !== null && p.value !== undefined)?.value ?? null;
  const weightChange = firstWeight !== null && lastWeight !== null ? lastWeight - firstWeight : null;

  return (
    <View style={{ flexDirection: isWide ? "row" : "column", gap: 18 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Card style={{ marginBottom: 16 }}>
          <View className="mb-4 flex-row flex-wrap items-baseline justify-between" style={{ gap: 8 }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Macro average · last 7 days
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
              {weekSummary.days.length} of 7 days logged
            </Text>
          </View>
          <MacroRingRow
            averages={weekSummary.averages}
            target={currentTarget}
            days={{ logged: weekSummary.days.length, of: 7 }}
          />
        </Card>

        <View className="mb-3 flex-row flex-wrap items-center justify-between" style={{ gap: 10 }}>
          <View className="flex-row flex-wrap items-baseline" style={{ gap: 8 }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Trends
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#c9c4bd" }}>weight and the four below, same window</Text>
          </View>
          <View className="flex-row rounded-full p-1" style={{ backgroundColor: "#f1ede8" }}>
            {RANGES.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => setRange(r.key)}
                className="rounded-full px-3.5 py-1"
                style={{ backgroundColor: range === r.key ? "white" : "transparent" }}
              >
                <Text
                  style={{ fontFamily: range === r.key ? fonts.sansSemiBold : fonts.sans, fontSize: 12, color: range === r.key ? "#2a211c" : "#8a8279" }}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Card style={{ marginBottom: 16 }}>
          <View className="mb-2 flex-row flex-wrap items-baseline" style={{ gap: 10 }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Weight
            </Text>
            <Text style={{ fontFamily: fonts.display, fontSize: 22, color: "#2a211c" }}>
              {lastWeight !== null ? lastWeight.toFixed(1) : "–"}
            </Text>
            {weightChange !== null ? (
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: weightChange < 0 ? "#4d6142" : weightChange > 0 ? "#8a5a2e" : "#78716c" }}>
                {weightChange > 0 ? "+" : ""}
                {weightChange.toFixed(1)} lb over {rangeLabel === "W" ? "the week" : rangeLabel}
              </Text>
            ) : null}
          </View>
          {/* The line goes clay from the current target's start date — the
              stretch measured against the numbers she is on right now. */}
          <View onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
            {chartWidth > 0 ? (
              <TrendChart
                points={weightPoints}
                width={chartWidth}
                height={260}
                unit="lb"
                sinceDate={currentTarget?.effective_date ?? null}
                emptyMessage="No weigh-ins in this range yet."
              />
            ) : (
              // One frame with nothing in it, rather than a wrong-width chart
              // that visibly resizes after mount.
              <View style={{ height: 260 }} />
            )}
          </View>
        </Card>

        <MetricSparkTiles logs={rangeLogs} rangeLabel={rangeLabel} />
      </View>

      <View style={{ width: isWide ? 320 : undefined }}>
        <RailCard title="Focus">
          <FocusChecklist userId={userId} items={focusItems} onChanged={onChanged} />
        </RailCard>

        <RailCard title="Notes">
          <GamePlan userId={userId} initialGamePlan={client.game_plan} />
        </RailCard>

        <RailCard title="Milestones">
          <MilestoneSlots userId={userId} coachId={coachId} milestones={milestones} onChanged={onChanged} />
        </RailCard>
      </View>
    </View>
  );
}
