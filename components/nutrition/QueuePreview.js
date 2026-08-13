import { useEffect, useState } from "react";
import { View, Text, Pressable, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { MacroRingRow, LoggingDots } from "./MacroRingRow";
import { getQueuePreview, weekOnProgramme, weekDates } from "../../lib/nutrition/queue";
import { metricDeltas } from "../../lib/nutrition/checkinAnswers";
import { deriveCalories } from "../../lib/nutrition/targets";
import { formatDateMD } from "../../lib/formatDate";
import { formatDateTimeInBoise } from "../../lib/boiseDate";
import { fonts, colors } from "../../lib/theme";

// The Nutrition queue's right-hand pane (coach web v2, screen 17): enough of
// a check-in to decide whether it needs opening, without opening it.
//
// Everything here is a read. There is no finalize button — completing a
// check-in means reading her answers first, and a one-click "done" sitting
// next to a summary is an invitation to clear the queue without doing that.

const PREVIEW_METRICS = ["sleep_hours", "hunger", "energy", "steps"];
const METRIC_LABEL = { sleep_hours: "Sleep", hunger: "Hunger", energy: "Energy", steps: "Steps" };

function Card({ title, headerRight, children, style }) {
  return (
    <View
      className="rounded-xl p-4"
      style={[{ borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white" }, style]}
    >
      {title ? (
        <View className="mb-2.5 flex-row flex-wrap items-center justify-between" style={{ gap: 8 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {title}
          </Text>
          {headerRight}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function fmt(value, digits = 1) {
  if (value === null || value === undefined) return "–";
  const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
  return rounded >= 1000 ? rounded.toLocaleString() : String(rounded);
}

// Seven bars — the week's weigh-ins, with the days she didn't weigh left as
// gaps rather than interpolated through.
function WeightStrip({ days, dates }) {
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  const weights = dates.map((date) => byDate[date]?.weight ?? null).map((w) => (w === null || w === undefined ? null : Number(w)));
  const present = weights.filter((w) => w !== null);
  if (present.length === 0) {
    return (
      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#c9c4bd" }}>No weigh-ins this week.</Text>
    );
  }
  const min = Math.min(...present);
  const max = Math.max(...present);
  const range = max - min || 1;

  return (
    <View className="flex-row items-end" style={{ height: 28, gap: 4 }}>
      {weights.map((weight, i) => (
        <View
          key={dates[i]}
          style={{
            flex: 1,
            height: weight === null ? 6 : 10 + 18 * ((weight - min) / range),
            borderRadius: 3,
            backgroundColor: weight === null ? "#f0ece6" : i === weights.length - 1 || weight === present[present.length - 1] ? "#a46a57" : "#e7e0d8",
          }}
        />
      ))}
    </View>
  );
}

function DayTable({ summary, dates, target }) {
  const byDate = Object.fromEntries(summary.days.map((d) => [d.date, d]));
  const rows = [
    { key: "weight", label: "Weight", digits: 1, target: null },
    { key: "calories", label: "Calories", digits: 0, target: target ? Math.round(deriveCalories(target)) : null },
    { key: "protein_g", label: "Protein", digits: 0, target: target?.protein_g ?? null, unit: " g" },
    { key: "carb_g", label: "Carbs", digits: 0, target: target?.carb_g ?? null, unit: " g" },
    { key: "fat_g", label: "Fat", digits: 0, target: target?.fat_g ?? null, unit: " g" },
  ];
  const dayLabels = dates.map((date) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }));

  return (
    <View>
      <View className="flex-row items-center" style={{ paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>
        <Text style={{ width: 68, fontFamily: fonts.sansBold, fontSize: 9.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Macro
        </Text>
        {dayLabels.map((label, i) => (
          <Text
            key={dates[i]}
            style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 9.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}
          >
            {label}
          </Text>
        ))}
        <Text style={{ width: 52, textAlign: "right", fontFamily: fonts.sansBold, fontSize: 9.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Avg
        </Text>
        <Text style={{ width: 56, textAlign: "right", fontFamily: fonts.sansBold, fontSize: 9.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Target
        </Text>
      </View>

      {rows.map((row) => (
        <View key={row.key} className="flex-row items-center" style={{ paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#f6f3ef" }}>
          <Text style={{ width: 68, fontFamily: fonts.sansMedium, fontSize: 12, color: "#44403c" }}>{row.label}</Text>
          {dates.map((date) => (
            <Text key={date} style={{ flex: 1, textAlign: "center", fontFamily: fonts.sans, fontSize: 11.5, color: byDate[date] ? "#57534e" : "#d6d3d1" }}>
              {byDate[date] ? fmt(byDate[date][row.key], row.digits) : "—"}
            </Text>
          ))}
          <Text style={{ width: 52, textAlign: "right", fontFamily: fonts.sansBold, fontSize: 12, color: "#2a211c" }}>
            {fmt(summary.averages[row.key], row.digits)}
          </Text>
          <Text style={{ width: 56, textAlign: "right", fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
            {row.target === null ? "—" : `${fmt(row.target, 0)}${row.unit ?? ""}`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Photos({ photos, missingAngles }) {
  return (
    <View className="flex-row" style={{ gap: 8 }}>
      {photos.map(({ angle, photo, url }) => (
        <View key={angle} style={{ flex: 1 }}>
          {!photo ? (
            <View
              className="items-center justify-center rounded-lg border border-dashed"
              style={{ aspectRatio: 3 / 4, borderColor: "#ddd6cd", backgroundColor: "#faf8f6" }}
            >
              <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#c9c4bd", textAlign: "center" }}>{angle}{"\n"}missing</Text>
            </View>
          ) : url ? (
            <Image source={{ uri: url }} style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 8, backgroundColor: "#f1efed" }} resizeMode="cover" />
          ) : (
            <View className="items-center justify-center rounded-lg" style={{ aspectRatio: 3 / 4, backgroundColor: "#f1efed" }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
          {photo ? (
            <Text className="mt-1 text-center" style={{ fontFamily: fonts.sans, fontSize: 10, color: "#a8a29e" }}>
              {angle}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function QueuePreview({ client, today }) {
  const router = useRouter();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setError(null);
    getQueuePreview(client.userId, today)
      .then((next) => {
        if (!cancelled) setPreview(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client.userId, today]);

  const href = `/(coach)/nutrition/clients/${client.userId}`;
  const weekNumber = weekOnProgramme(client.startDate, today);

  if (error) {
    return (
      <View className="items-center justify-center rounded-2xl p-10" style={{ borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white" }}>
        <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center" }}>Couldn&apos;t load {client.name}&apos;s week: {error}</Text>
      </View>
    );
  }

  if (!preview) {
    return (
      <View className="items-center justify-center rounded-2xl p-16" style={{ borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const dates = weekDates(preview.week);
  const metrics = metricDeltas(preview.summary, preview.priorSummary).filter((m) => PREVIEW_METRICS.includes(m.key));
  const weights = preview.summary.days.map((d) => d.weight).filter((w) => w !== null && w !== undefined).map(Number);
  const latestWeight = weights.length > 0 ? weights[weights.length - 1] : null;
  const priorWeights = preview.priorSummary.days.map((d) => d.weight).filter((w) => w !== null && w !== undefined).map(Number);
  const weekWeightDelta =
    preview.summary.averages.weight !== null && preview.priorSummary.averages.weight !== null
      ? preview.summary.averages.weight - preview.priorSummary.averages.weight
      : null;

  return (
    <View className="rounded-2xl p-5" style={{ borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white" }}>
      <View className="mb-4 flex-row flex-wrap items-start justify-between" style={{ gap: 12 }}>
        <View className="flex-1 flex-row items-center" style={{ gap: 12, minWidth: 220 }}>
          <View className="items-center justify-center rounded-full" style={{ width: 40, height: 40, backgroundColor: "#fdf6f2" }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>
              {(client.name ?? "").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 21, color: "#2a211c" }}>{client.name}</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 1 }}>
              {weekNumber ? `Week ${weekNumber}` : "New client"}
              {preview.checkin?.submitted_at ? ` · check-in submitted ${formatDateTimeInBoise(preview.checkin.submitted_at)}` : " · no check-in in yet"}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => router.push(href)} hitSlop={8}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Open full profile →</Text>
        </Pressable>
      </View>

      <View className="mb-3 flex-row flex-wrap" style={{ gap: 12 }}>
        <Card title="Weight" style={{ flex: 1, minWidth: 220 }}>
          <View className="mb-2 flex-row flex-wrap items-baseline" style={{ gap: 8 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 22, color: "#2a211c" }}>{fmt(latestWeight, 1)}</Text>
            {weekWeightDelta !== null ? (
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: weekWeightDelta < 0 ? "#4d6142" : weekWeightDelta > 0 ? "#8a5a2e" : "#78716c" }}>
                {weekWeightDelta > 0 ? "+" : ""}
                {weekWeightDelta.toFixed(1)} this week
              </Text>
            ) : priorWeights.length === 0 ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>no week to compare yet</Text>
            ) : null}
          </View>
          <WeightStrip days={preview.summary.days} dates={dates} />
        </Card>

        <Card title="Logging" style={{ flex: 1, minWidth: 220 }}>
          <View className="mb-2 flex-row flex-wrap items-baseline" style={{ gap: 6 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 22, color: "#2a211c" }}>{preview.daysLogged}</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>of 7 days</Text>
          </View>
          <LoggingDots dates={dates} loggedDates={preview.summary.days.map((d) => d.date)} />
        </Card>
      </View>

      <View className="mb-3 flex-row flex-wrap" style={{ gap: 12 }}>
        <Card
          title="Her check-in"
          style={{ flex: 2, minWidth: 320 }}
          headerRight={
            <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e" }}>
              {preview.checkin ? `${(preview.checkin.answers ?? []).length} questions` : "not submitted"}
            </Text>
          }
        >
          <View className="mb-3 flex-row flex-wrap" style={{ gap: 8 }}>
            {metrics.map((metric) => (
              <View key={metric.key} className="rounded-lg px-3 py-2" style={{ flex: 1, minWidth: 84, backgroundColor: "#faf8f6" }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {METRIC_LABEL[metric.key]}
                </Text>
                <View className="mt-0.5 flex-row flex-wrap items-baseline" style={{ gap: 4 }}>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#8a5140" }}>{fmt(metric.value, metric.digits)}</Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>
                    {metric.delta === null || metric.delta === 0
                      ? "—"
                      : `${metric.delta > 0 ? "+" : ""}${Math.round(metric.delta * 10 ** metric.digits) / 10 ** metric.digits}`}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <Text className="mb-2" style={{ fontFamily: fonts.sansBold, fontSize: 9.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Macro average · this week
          </Text>
          <MacroRingRow averages={preview.summary.averages} target={preview.target} size={56} stroke={4.5} />

          <View className="mt-3 flex-row flex-wrap items-center justify-between" style={{ gap: 8 }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
              Averaged over the {preview.daysLogged} day{preview.daysLogged === 1 ? "" : "s"} she logged
            </Text>
            <Pressable onPress={() => router.push(`${href}?tab=checkin`)} hitSlop={8}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>Read the full form →</Text>
            </Pressable>
          </View>
        </Card>

        <Card
          title="Photos"
          style={{ flex: 1, minWidth: 200 }}
          headerRight={
            <Pressable onPress={() => router.push(`${href}?tab=photos`)} hitSlop={8}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.primaryOnWhite }}>Compare</Text>
            </Pressable>
          }
        >
          <Photos photos={preview.photos} missingAngles={preview.missingAngles} />
        </Card>
      </View>

      <Card title={`Last 7 days · ${formatDateMD(preview.week.start)}–${formatDateMD(preview.week.end)}`}>
        <DayTable summary={preview.summary} dates={dates} target={preview.target} />
      </Card>
    </View>
  );
}
