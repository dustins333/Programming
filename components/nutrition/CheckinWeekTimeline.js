import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { computeWeekWindows, enumerateUpcomingWeeks, deriveCheckinStatus, checkinMondayForWeek, enumerateRecentWeeks } from "../../lib/nutrition/weekCycle";

import { isPhotoRequirementWeek, hasAllAngles, photosForRequirementWeek } from "../../lib/nutrition/photos";
import { reopenCheckin, closeOutCheckin, undoCheckinCloseout } from "../../lib/nutrition/checkin";
import { addDays, dateInBoise, formatDateTimeInBoise } from "../../lib/boiseDate";
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
  closedOut: { label: "Closed out", color: "#78716c" },
  notDue: { label: "Not due yet", color: "#a8a29e" },
};

// A quiet inline action. Several can sit on one row (a missed week can be
// both reopened and closed out), so they share a size and a separator
// rather than each inventing its own.
function RowAction({ label, onPress, busy, tone = colors.primaryOnWhite }) {
  return (
    <Pressable onPress={onPress} disabled={busy} hitSlop={6} style={{ opacity: busy ? 0.5 : 1 }}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: tone }}>{busy ? "…" : label}</Text>
    </Pressable>
  );
}

// Labeled by the Monday the coach picks the check-in up and reviews it, not
// by the Mon-Sun range it covers. That range is what's stored and what every
// requirement check works in, but it isn't how a coach thinks about a
// check-in — and showing two adjacent dates for one check-in was the
// confusing part. See checkinMondayForWeek in weekCycle.js.
function weekLabel(start) {
  return `${formatDateMDY(checkinMondayForWeek(start))} check-in`;
}

function Row({ week, isCurrent, isUpcoming, checkin, client, photos, userId, coachId, today, reopen, closeout, onChanged, onSelect, selected }) {
  const [busy, setBusy] = useState(null);
  const required = isPhotoRequirementWeek(client, week.start);
  const weekPhotos = photosForRequirementWeek(photos, week);
  const photosOk = required ? hasAllAngles(weekPhotos) : null;
  const isMissed = !isCurrent && !isUpcoming && !checkin;
  const reopenActive = !!reopen && reopen.expires_at >= today;
  // A real submission always wins over a close-out, so a client who files
  // late un-closes her own week with nothing for the coach to undo.
  const closedOut = !checkin && !!closeout;

  let status = null;
  if (!isUpcoming) {
    if (checkin) status = STATUS_STYLE[deriveCheckinStatus(checkin) === "ready" ? "ready" : "completed"];
    else if (closedOut) status = STATUS_STYLE.closedOut;
    else if (isCurrent) status = STATUS_STYLE.notDue;
    else status = reopenActive ? STATUS_STYLE.reopened : STATUS_STYLE.missed;
  }

  const run = async (key, fn, failureMessage) => {
    setBusy(key);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      toastError(failureMessage, err);
    } finally {
      setBusy(null);
    }
  };

  const handleReopen = () => run("reopen", () => reopenCheckin(userId, week.start, coachId, today), "Failed to reopen check-in");
  const handleCloseOut = () => run("close", () => closeOutCheckin(userId, week.start, coachId), "Failed to close out check-in");
  const handleUndoCloseOut = () => run("undo", () => undoCheckinCloseout(userId, week.start), "Failed to reopen this week");

  // Pressable only when the caller wants selection (the week picker on the
  // Check-In tab). As a plain status list — its original job on the Settings
  // tab — rows stay inert, so nothing there gains a tap target that goes
  // nowhere. The Reopen control below is a nested Pressable and still wins
  // its own taps.
  const Wrapper = onSelect ? Pressable : View;
  const wrapperProps = onSelect ? { onPress: () => onSelect(week) } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className="flex-row items-center justify-between border-b border-stone-100 py-2.5"
      style={
        selected
          ? { backgroundColor: "#fdf6f2", marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "#f0ddd2" }
          : isCurrent
            ? { backgroundColor: "#faf8f6", marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 8 }
            : undefined
      }
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
          ) : closedOut ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>by you {formatDateMDY(dateInBoise(new Date(closeout.closed_at)))}</Text>
          ) : reopenActive ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>until {formatDateMDY(reopen.expires_at)}</Text>
          ) : null}
        </View>
      ) : null}

      {/* Actions, quietest-first. A week that's been closed out offers only
          the way back out of it — "Reopen" there would mean two different
          things at once (undo the close-out, or grant a late-filing window),
          and the close-out is what's actually on screen. */}
      {!isUpcoming && !checkin ? (
        <View className="flex-row items-center" style={{ gap: 10 }}>
          {closedOut ? (
            <RowAction label="Undo" onPress={handleUndoCloseOut} busy={busy === "undo"} />
          ) : (
            <>
              {isMissed && !reopenActive ? <RowAction label="Reopen" onPress={handleReopen} busy={busy === "reopen"} /> : null}
              <RowAction label="Close out" onPress={handleCloseOut} busy={busy === "close"} tone="#78716c" />
            </>
          )}
        </View>
      ) : null}
    </Wrapper>
  );
}

// Her onboarding sits at the bottom of the list as the oldest entry, because
// that is what it is: her first check-in. It is deliberately NOT mapped onto
// the calendar week containing her start date — it has no week_start of its
// own, and inventing one would collide with a real check-in filed that same
// week for anyone who started mid-cycle.
function OnboardingRow({ onSelect, selected, submittedAt }) {
  return (
    <Pressable
      onPress={onSelect}
      className="flex-row items-center justify-between py-2.5"
      style={
        selected
          ? { backgroundColor: "#fdf6f2", marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: "#f0ddd2" }
          : undefined
      }
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>Onboarding</Text>
        <Text className="mt-0.5" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
          Questionnaire, starting photos and tracking days
        </Text>
      </View>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: submittedAt ? "#4d6142" : "#a8a29e" }}>
        {submittedAt ? "Submitted" : "Nothing in"}
      </Text>
    </Pressable>
  );
}

// Per-client check-in status timeline — answers "which weeks completed, when
// pictures came in, when new ones are required, what did he miss" in one
// place instead of coach guesswork. Upcoming (next 3) / This week / Past
// (last 5) — enumerateRecentWeeks includes the current week as its own
// index 0, so it's split off from the rest here.
//
// A week nobody is going to file can be CLOSED OUT from here (migration
// 0111) — the roster stops reading it as an outstanding check-in, without
// fabricating a response that never happened. It's undoable, and a real
// submission supersedes it on its own.
//
// Doubles as the week picker on the Check-In tab: pass onSelectWeek to make
// the rows navigable, selectedWeekStart to mark where the coach currently
// is, and onboardingEntry to hang her onboarding off the end of the list.
// Without those it renders exactly as it always did on the Settings tab.
export function CheckinWeekTimeline({
  userId,
  coachId,
  client,
  checkins,
  reopens = [],
  closeouts = [],
  photos,
  today,
  onChanged,
  onSelectWeek,
  selectedWeekStart,
  pastWeeks = PAST_WEEKS,
  onboardingEntry,
}) {
  const { currentWeek } = computeWeekWindows(today);
  // Stop at the client's own start date. Enumerating a flat N weeks back
  // renders every week before she existed as a MISSED check-in, complete
  // with a Reopen button — a client who started nine days ago showed four
  // of them. A week counts as hers if it ENDS on or after her start date,
  // matching the Weeks tab's "the week containing the start date is week 1"
  // rule, so the two screens agree on where her history begins.
  const allRecent = enumerateRecentWeeks(currentWeek, addDays, pastWeeks);
  const submittedWeeks = new Set(checkins.map((c) => c.week_start));
  const recent = client?.start_date
    // A check-in she actually filed always shows, whatever the dates say —
    // hiding one because it predates her recorded start date would lose real
    // work over a data oddity.
    ? allRecent.filter((w) => w.end >= client.start_date || submittedWeeks.has(w.start))
    : allRecent;
  const upcoming = enumerateUpcomingWeeks(currentWeek, addDays, UPCOMING_WEEKS);
  const checkinsByWeek = Object.fromEntries(checkins.map((c) => [c.week_start, c]));
  // Several reopen rows can exist historically for the same week (an
  // earlier one that already expired, say) — most-recently-opened wins,
  // matching listCheckinReopensSince's own newest-first ordering.
  const reopensByWeek = {};
  for (const r of reopens) if (!(r.week_start in reopensByWeek)) reopensByWeek[r.week_start] = r;
  const closeoutsByWeek = Object.fromEntries((closeouts ?? []).map((c) => [c.week_start, c]));

  const rowProps = (week, isCurrent, isUpcoming) => ({
    week,
    isCurrent,
    isUpcoming,
    checkin: checkinsByWeek[week.start] ?? null,
    reopen: reopensByWeek[week.start] ?? null,
    closeout: closeoutsByWeek[week.start] ?? null,
    client,
    photos,
    userId,
    coachId,
    today,
    onChanged,
    onSelect: onSelectWeek,
    selected: !!selectedWeekStart && week.start === selectedWeekStart,
  });

  return (
    <View>
      <Text className="mb-1.5 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
        Upcoming
      </Text>
      {upcoming.map((w) => (
        <Row key={w.start} {...rowProps(w, false, true)} />
      ))}

      {/* enumerateRecentWeeks puts the current week at index 0, so the
          start-date filter above can legitimately empty this list out for
          someone who joined mid-week. */}
      {recent.length > 0 ? (
        <>
          <Text className="mb-1.5 mt-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
            Current
          </Text>
          <Row {...rowProps(recent[0], true, false)} />
        </>
      ) : null}

      {recent.length > 1 ? (
        <>
          <Text className="mb-1.5 mt-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
            Past
          </Text>
          {recent.slice(1).map((w) => (
            <Row key={w.start} {...rowProps(w, false, false)} />
          ))}
        </>
      ) : null}

      {onboardingEntry ? (
        <>
          <Text className="mb-1.5 mt-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
            Starting point
          </Text>
          <OnboardingRow
            onSelect={onboardingEntry.onSelect}
            selected={onboardingEntry.selected}
            submittedAt={onboardingEntry.submittedAt}
          />
        </>
      ) : null}
    </View>
  );
}
