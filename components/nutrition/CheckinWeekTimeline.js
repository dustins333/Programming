import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { computeWeekWindows, enumerateUpcomingWeeks, deriveCheckinStatus, checkinMondayForWeek } from "../../lib/nutrition/weekCycle";
import { enumerateRecentWeeks } from "./WeekList";
import { isPhotoRequirementWeek, hasAllAngles, photosForRequirementWeek } from "../../lib/nutrition/photos";
import { reopenCheckin } from "../../lib/nutrition/checkin";
import { addDays, formatDateTimeInBoise } from "../../lib/boiseDate";
import { formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";
import { toastError } from "../../lib/toast";

const PAST_WEEKS = 6;
const UPCOMING_WEEKS = 3;

const STATUS_STYLE = {
  completed: { label: "Completed", color: "#4d6142" },
  ready: { label: "Awaiting review", color: "#b3843a" },
  missed: { label: "Missed", color: "#b23a22" },
  reopened: { label: "Reopened", color: "#8a5a2e" },
  notDue: { label: "Not due yet", color: "#a8a29e" },
};

// Labeled by the Monday the coach picks the check-in up and reviews it, not
// by the Mon-Sun range it covers. That range is what's stored and what every
// requirement check works in, but it isn't how a coach thinks about a
// check-in — and showing two adjacent dates for one check-in was the
// confusing part. See checkinMondayForWeek in weekCycle.js.
function weekLabel(start) {
  return `${formatDateMDY(checkinMondayForWeek(start))} check-in`;
}

function Row({ week, isCurrent, isUpcoming, checkin, client, photos, userId, coachId, today, reopen, onChanged }) {
  const [busy, setBusy] = useState(false);
  const required = isPhotoRequirementWeek(client, week.start);
  const weekPhotos = photosForRequirementWeek(photos, week);
  const photosOk = required ? hasAllAngles(weekPhotos) : null;
  const isMissed = !isCurrent && !isUpcoming && !checkin;
  const reopenActive = !!reopen && reopen.expires_at >= today;

  let status = null;
  if (!isUpcoming) {
    if (checkin) status = STATUS_STYLE[deriveCheckinStatus(checkin) === "ready" ? "ready" : "completed"];
    else if (isCurrent) status = STATUS_STYLE.notDue;
    else status = reopenActive ? STATUS_STYLE.reopened : STATUS_STYLE.missed;
  }

  const handleReopen = async () => {
    setBusy(true);
    try {
      await reopenCheckin(userId, week.start, coachId, today);
      await onChanged();
    } catch (err) {
      toastError("Failed to reopen check-in", err);
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
          {weekLabel(week.start)}
          {isCurrent ? "  · current" : ""}
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
          ) : reopenActive ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>until {formatDateMDY(reopen.expires_at)}</Text>
          ) : null}
        </View>
      ) : null}

      {isMissed && !reopenActive ? (
        <Pressable onPress={handleReopen} disabled={busy} hitSlop={6}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: colors.primaryOnWhite }}>{busy ? "…" : "Reopen"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Per-client check-in status timeline — answers "which weeks completed, when
// pictures came in, when new ones are required, what did he miss" in one
// place instead of coach guesswork. Upcoming (next 3) / This week / Past
// (last 5) — enumerateRecentWeeks includes the current week as its own
// index 0, so it's split off from the rest here.
export function CheckinWeekTimeline({ userId, coachId, client, checkins, reopens = [], photos, today, onChanged }) {
  const { currentWeek } = computeWeekWindows(today);
  const recent = enumerateRecentWeeks(currentWeek, addDays, PAST_WEEKS);
  const upcoming = enumerateUpcomingWeeks(currentWeek, addDays, UPCOMING_WEEKS);
  const checkinsByWeek = Object.fromEntries(checkins.map((c) => [c.week_start, c]));
  // Several reopen rows can exist historically for the same week (an
  // earlier one that already expired, say) — most-recently-opened wins,
  // matching listCheckinReopensSince's own newest-first ordering.
  const reopensByWeek = {};
  for (const r of reopens) if (!(r.week_start in reopensByWeek)) reopensByWeek[r.week_start] = r;

  const rowProps = (week, isCurrent, isUpcoming) => ({
    week,
    isCurrent,
    isUpcoming,
    checkin: checkinsByWeek[week.start] ?? null,
    reopen: reopensByWeek[week.start] ?? null,
    client,
    photos,
    userId,
    coachId,
    today,
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
        Current
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
