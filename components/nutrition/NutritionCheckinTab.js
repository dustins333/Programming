import { useEffect, useState } from "react";
import { View, Text, Pressable, Image, ActivityIndicator } from "react-native";
import { MacroRingRow } from "./MacroRingRow";
import { CheckinAnswerList, CheckinMetricStrip } from "./CheckinAnswerList";
import { GamePlan } from "./GamePlan";
import { FocusChecklist } from "./FocusChecklist";
import { pairAnswers, metricDeltas } from "../../lib/nutrition/checkinAnswers";
import { getPhotoSignedUrls, photosForRequirementWeek } from "../../lib/nutrition/photos";
import { checkinMondayForWeek } from "../../lib/nutrition/weekCycle";
import { formatDateMDY } from "../../lib/formatDate";
import { formatDateTimeInBoise } from "../../lib/boiseDate";
import { fonts, colors } from "../../lib/theme";

// The Check-In tab (coach web v2, screen 22): what came in, what it's
// against, and what she said — in that order.
//
// The right rail is ALWAYS live and editable. It used to freeze after a
// check-in was finalized, showing the focus/game-plan copy captured onto
// the response row — dropped per direct feedback: those snapshots were
// never referenced, and seeing a stale copy next to the live one read as
// "wait, I thought I just changed this". The snapshot columns are still
// written (harmless, and the data is there if it's ever wanted back), just
// never displayed.
// Revising the focus items and the game plan is what reviewing a check-in
// actually consists of, so both stay live while the coach works; finalizing
// captures them onto the response (see finalizeCheckin) and the rail switches
// to showing that stored version. So a past week always reads as what was
// agreed that week, and the current one is a working surface.

const ANGLE_LABEL = { front: "front", side: "side", back: "back" };

function Card({ title, headerRight, children, style }) {
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
      {title ? (
        <View className="mb-3 flex-row flex-wrap items-center justify-between" style={{ gap: 8 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {title}
          </Text>
          {headerRight}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function LinkButton({ label, onPress }) {
  return (
    <Pressable onPress={onPress} className="mt-3 items-center rounded-lg py-2.5" style={{ borderWidth: 1, borderColor: "#ddd6cd" }}>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>{label}</Text>
    </Pressable>
  );
}

// At most three thumbnails, signed only for the week actually on screen —
// the same restraint the Photos tab is built around.
function CheckinPhotos({ photos, weekWeight, onOpenPhotos }) {
  const [urls, setUrls] = useState({});

  // Keyed on the joined paths, NOT the array: `photos` is rebuilt on every
  // render by the parent, so a dependency on it re-signs forever. Same
  // failure PhotoCompareRail hit, arrived at from the other direction.
  const pathKey = photos.map((p) => p.storage_path).join(",");
  useEffect(() => {
    if (!pathKey) return;
    let cancelled = false;
    getPhotoSignedUrls(pathKey.split(","))
      .then((next) => {
        if (!cancelled) setUrls(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathKey]);


  return (
    <Card
      title="Photos with this check-in"
      style={{ flex: 1 }}
      headerRight={
        <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
          {formatDateMDY(photos[0].date)}
          {weekWeight !== null && weekWeight !== undefined ? ` · ${weekWeight.toFixed(1)} lb` : ""}
        </Text>
      }
    >
      <View className="flex-row" style={{ gap: 8 }}>
        {photos.map((photo) => (
          <View key={photo.id ?? `${photo.angle}-${photo.date}`} style={{ flex: 1 }}>
            {urls[photo.storage_path] ? (
              <Image
                source={{ uri: urls[photo.storage_path] }}
                style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 8, backgroundColor: "#f1efed" }}
                resizeMode="cover"
              />
            ) : (
              <View className="items-center justify-center rounded-lg" style={{ aspectRatio: 3 / 4, backgroundColor: "#f1efed" }}>
                <ActivityIndicator color={colors.primary} size="small" />
              </View>
            )}
            <Text className="mt-1 text-center" style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>
              {ANGLE_LABEL[photo.angle] ?? photo.angle}
            </Text>
          </View>
        ))}
      </View>
      <LinkButton label="Compare in Photos →" onPress={onOpenPhotos} />
    </Card>
  );
}

export function NutritionCheckinTab({
  userId,
  client,
  checkin,
  priorCheckin,
  templateQuestions,
  selectedWeek,
  weekOffset,
  weekPaging,
  onOlderWeek,
  onNewerWeek,
  summary,
  priorSummary,
  currentTarget,
  photos,
  focusItems,
  isWide,
  onChanged,
  onChangeHighlights,
  onOpenPhotos,
  onOpenTargets,
}) {
  const paired = pairAnswers(checkin?.answers, priorCheckin?.answers, templateQuestions);
  const metrics = metricDeltas(summary, priorSummary);
  const weekPhotos = photosForRequirementWeek(photos, selectedWeek);

  // One per angle, newest wins — a re-shot angle inside the same window
  // shouldn't render twice.
  const byAngle = {};
  for (const photo of weekPhotos.slice().sort((a, b) => (a.date < b.date ? -1 : 1))) byAngle[photo.angle] = photo;
  const shownPhotos = ["front", "side", "back"].map((angle) => byAngle[angle]).filter(Boolean);

  return (
    <View>
      <View className="mb-4 flex-row flex-wrap items-center justify-between" style={{ gap: 10 }}>
        <View className="flex-row flex-wrap items-center" style={{ gap: 10 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {/* Labelled by the check-in Monday, matching the timeline on the
                Settings tab — the two are reachable from the same page, so
                labelling one by its covered week and the other by its
                check-in date would show two dates for the same check-in. */}
            {formatDateMDY(checkinMondayForWeek(selectedWeek.start))} check-in
          </Text>
          {checkin?.submitted_at ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
              submitted {formatDateTimeInBoise(checkin.submitted_at)}
            </Text>
          ) : null}
          {weekPaging ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>
        <View className="flex-row items-center" style={{ gap: 14 }}>
          <Pressable onPress={onOlderWeek} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.primaryOnWhite }}>‹ Older</Text>
          </Pressable>
          <Pressable onPress={onNewerWeek} disabled={weekOffset === 0} hitSlop={8}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: weekOffset === 0 ? "#d6d3d1" : colors.primaryOnWhite }}>
              Newer ›
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: isWide ? "row" : "column", gap: 18 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: isWide ? "row" : "column", gap: 16 }}>
            {/* No photos, no box. An empty "none came in" card beside the
                targets was a whole column spent saying nothing — photos
                aren't policed here, so their absence isn't news. The target
                card takes the full width instead. */}
            {shownPhotos.length > 0 ? (
              <View style={{ flex: 1 }}>
                <CheckinPhotos photos={shownPhotos} weekWeight={summary?.averages?.weight ?? null} onOpenPhotos={onOpenPhotos} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              {/* flex:1 on the Card itself, not just its wrapper — a card only
                  as tall as its own contents left the rings sitting in a short
                  box beside a tall column of photos. The rings then centre in
                  whatever height the photos set. */}
              <Card
                title="Against target this week"
                style={{ flex: 1 }}
                headerRight={
                  <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                    {summary?.days?.length ?? 0} of 7 days
                  </Text>
                }
              >
                <View style={{ flex: 1, justifyContent: "center" }}>
                  <MacroRingRow averages={summary?.averages} target={currentTarget} size={62} stroke={5} />
                </View>
                <LinkButton label="Open Targets →" onPress={onOpenTargets} />
              </Card>
            </View>
          </View>

          <View className="mt-4">
            <Card>
              <CheckinMetricStrip metrics={metrics} />
            </Card>
          </View>

          <View className="mt-4">
            <Card>
              {checkin ? (
                <CheckinAnswerList paired={paired} highlights={checkin.highlights} onChangeHighlights={onChangeHighlights} />
              ) : (
                <Text style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>
                  Nothing submitted for this week.
                </Text>
              )}
            </Card>
          </View>
        </View>

        <View style={{ width: isWide ? 300 : undefined }}>
          <Card title="Notes" style={{ marginBottom: 16 }}>
            <GamePlan userId={userId} initialGamePlan={client.game_plan} />
          </Card>

          <Card title="Focus" style={{ marginBottom: 16 }}>
            <FocusChecklist userId={userId} items={focusItems} onChanged={onChanged} />
          </Card>
        </View>
      </View>
    </View>
  );
}
