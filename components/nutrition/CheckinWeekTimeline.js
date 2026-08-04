import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { computeWeekWindows, enumerateUpcomingWeeks, deriveCheckinStatus } from "../../lib/nutrition/weekCycle";
import { enumerateRecentWeeks } from "./WeekList";
import { isPhotoRequirementWeek, hasAllAngles, requirePhotosNextCheckin, clearPhotosNextCheckin } from "../../lib/nutrition/photos";
import { addDays, formatDateTimeInBoise } from "../../lib/boiseDate";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

const PAST_WEEKS = 6;
const UPCOMING_WEEKS = 3;

const STATUS_STYLE = {
  completed: { label: "Completed", color: "#4d6142" },
  ready: { label: "Awaiting review", color: "#b3843a" },
  missed: { label: "Missed", color: "#b23a22" },
  notDue: { label: "Not due yet", color: "#a8a29e" },
};

function weekLabel(start, end) {
  return `${formatDateMDY(start)} – ${formatDateMDY(end)}`;
}

function Row({ week, isCurrent, isUpcoming, checkin, client, photos, userId, onChanged }) {
  const [busy, setBusy] = useState(false);
  const required = isPhotoRequirementWeek(client, week.start);
  const isOneOff = client.photo_requirement_next_checkin === week.start;
  const weekPhotos = photos.filter((p) => p.date >= week.start && p.date <= week.end);
  const photosOk = required ? hasAllAngles(weekPhotos) : null;

  let status = null;
  if (!isUpcoming) {
    if (checkin) status = STATUS_STYLE[deriveCheckinStatus(checkin) === "ready" ? "ready" : "completed"];
    else status = isCurrent ? STATUS_STYLE.notDue : STATUS_STYLE.missed;
  }

  const toggleRequirement = async () => {
    setBusy(true);
    try {
      if (isOneOff) await clearPhotosNextCheckin(userId);
      else await requirePhotosNextCheckin(userId, week.start);
      await onChanged();
    } catch (err) {
      Alert.alert("Failed to update", err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      className="flex-row items-center justify-between border-b border-stone-100 py-2.5"
      style={isCurrent ? { backgroundColor: "#faf8f6", marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 8 } : undefined}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: isCurrent ? fonts.sansSemiBold : fonts.sans, fontSize: 13 }}>
          {weekLabel(week.start, week.end)}
          {isCurrent ? "  · this week" : ""}
        </Text>
        {required ? (
          <Text className="mt-0.5" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: photosOk ? "#4d6142" : "#b23a22" }}>
            {photosOk ? "✓ Photos submitted" : isUpcoming ? "Photos required" : "⚠ Photos missing"}
          </Text>
        ) : null}
      </View>

      {status ? (
        <View className="mr-3 items-end">
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: status.color }}>
            {status.label}
          </Text>
          {checkin?.submitted_at ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>{formatDateTimeInBoise(checkin.submitted_at)}</Text>
          ) : null}
        </View>
      ) : null}

      {(isCurrent || isUpcoming) && (
        <Pressable onPress={toggleRequirement} disabled={busy} hitSlop={6}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: isOneOff ? "#78716c" : colors.primaryOnWhite }}>
            {busy ? "…" : isOneOff ? "✓ Required — remove" : "+ Require photos"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// Per-client check-in status timeline — answers "which weeks completed, when
// pictures came in, when new ones are required, what did he miss" in one
// place instead of coach guesswork. Upcoming (next 3) / This week / Past
// (last 5) — enumerateRecentWeeks includes the current week as its own
// index 0, so it's split off from the rest here.
export function CheckinWeekTimeline({ userId, client, checkins, photos, today, onChanged }) {
  const { currentWeek } = computeWeekWindows(today);
  const recent = enumerateRecentWeeks(currentWeek, addDays, PAST_WEEKS);
  const upcoming = enumerateUpcomingWeeks(currentWeek, addDays, UPCOMING_WEEKS);
  const checkinsByWeek = Object.fromEntries(checkins.map((c) => [c.week_start, c]));

  const rowProps = (week, isCurrent, isUpcoming) => ({
    week,
    isCurrent,
    isUpcoming,
    checkin: checkinsByWeek[week.start] ?? null,
    client,
    photos,
    userId,
    onChanged,
  });

  return (
    <View>
      <Text className="mb-1.5 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
        Upcoming
      </Text>
      {upcoming.map((w) => (
        <Row key={w.start} {...rowProps(w, false, true)} />
      ))}

      <Text className="mb-1.5 mt-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
        This week
      </Text>
      <Row {...rowProps(recent[0], true, false)} />

      <Text className="mb-1.5 mt-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
        Past
      </Text>
      {recent.slice(1).map((w) => (
        <Row key={w.start} {...rowProps(w, false, false)} />
      ))}
    </View>
  );
}
