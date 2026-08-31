import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import { readSections, writeSection, SCREEN_MY_WEEK } from "../../lib/screenCache";
import { todayInBoise, dayOfWeekInBoise, dateInBoise, addDays } from "../../lib/boiseDate";
import { currentWeekNumber, calendarWeekNumber, sessionNumberForDate, formatSessionDays, blockLengthWeeks } from "../../lib/programming/schedule";
import { listMyAssignments, getCurrentBlock, listWorkoutsForWeek, listLogsForSession } from "../../lib/programming/memberPlan";
import { getNextBlockPreview, isFinalWeekOfBlock, nextBlockPreviewIsDue } from "../../lib/programming/nextBlockPreview";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { getSpcClient, isSpcActive } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listSpcWorkoutsForWeek } from "../../lib/programming/spcBlocks";
import { listSpcWorkoutExercises, listSpcWarmups } from "../../lib/programming/spcWorkouts";
import {
  listGroupCompletionDetailsForWorkouts,
  listSpcCompletionDetailsForWorkouts,
  finalizeGroupSession,
  getGroupCompletion,
  getSpcCompletion,
  getOneOffCompletion,
  startNewSpcSessionInstance,
} from "../../lib/programming/sessionCompletions";
import { listWeekOneOffWorkoutsForUser, listOneOffWarmups, listOneOffExercises } from "../../lib/programming/oneOffWorkouts";
import { hasUnreadMessages } from "../../lib/programming/messages";
import { listLiveEventsForUser, listMyResponses } from "../../lib/programming/events";
import { isMessagingEnabledForUser } from "../../lib/programming/messagingSettings";
import { listLogsForDateRange } from "../../lib/nutrition/dailyLog";
import { getClient as getNutritionClient } from "../../lib/nutrition/clients";
import { retryOnce } from "../../lib/retry";
import { formatDateMDY } from "../../lib/formatDate";
import { SessionSheet } from "../../components/SessionSheet";
import { MakeupSessionSheet } from "../../components/session/MakeupSessionSheet";
import { NextBlockSheet } from "../../components/NextBlockSheet";
import { ProgressRing } from "../../components/ProgressRing";
import { PressFade } from "../../components/PressFade";
import { fonts, colors, type } from "../../lib/theme";
import { Eyebrow } from "../../components/Eyebrow";
import { showToast } from "../../lib/toast";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["M", "T", "W", "Th", "F", "Sa", "Su"]; // Monday..Sunday

// design_handoff_member_mobile_v5 tokens. No new colors — every value here
// is already in lib/theme.js or tailwind.config.js.
const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const CARD_BORDER_DONE = "#dbe8cf";
const OLIVE = "#4d6142";
const CLAY = "#a46a57";
const BRAND_TEXT = "#8a5140";
const INK = "#44403c";
const INK_SECONDARY = "#78716c";
const INK_MUTED = colors.muted;
const DASHED_EMPTY = "#ddd6cd";
const HERO_DARK = "#33251f";
const HERO_CREAM = "#f7f3ee";
const HERO_SAND = "#beac95";
const HERO_OCHRE = "#e0b070";
const QUIET_HERO_BG = "#efeae4";
const URGENT = "#b23a22";
const URGENT_BG = "#fdece5";
const TODAY_BG = "#fdf6f2";
const SKELETON = "#f0ece6";
const SKELETON_ALT = "#f5f1ec";
const HITSLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const CARD_SHADOW = {
  shadowColor: "#44403c",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.045,
  shadowRadius: 14,
  elevation: 2,
};
const HERO_SHADOW = {
  shadowColor: HERO_DARK,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.28,
  shadowRadius: 26,
  elevation: 6,
};

function formatToday() {
  const today = todayInBoise();
  const [, month, day] = today.split("-").map(Number);
  return `${WEEKDAYS[dayOfWeekInBoise(today)]}, ${MONTHS[month - 1]} ${day}`;
}

// "Session 2 opens Wednesday" — the first weekday a session is scheduled on.
// session_days is an array of arrays of weekday ints (0=Sun..6=Sat), one
// entry per session (migration 0011).
function firstDayName(days) {
  if (!Array.isArray(days) || days.length === 0) return null;
  return WEEKDAYS[days[0]] ?? null;
}

// logs → exerciseId → [{ reps, weight }] by set number, padded to the
// prescribed set count so a set she never did shows as the missed box rather
// than quietly shortening the row. Shared by all three session openers.
function setsByExercise(logs, exerciseRows) {
  const byExercise = new Map();
  if (!logs) return byExercise;
  for (const ex of exerciseRows) {
    const exerciseId = ex.exercises?.id ?? ex.exercise_id;
    const rows = logs.filter((l) => l.exercise_id === exerciseId);
    if (rows.length === 0) {
      byExercise.set(exerciseId, []);
      continue;
    }
    const highest = Math.max(ex.sets ?? 0, ...rows.map((r) => r.set_number ?? 1));
    byExercise.set(
      exerciseId,
      Array.from({ length: highest }, (_, i) => {
        const row = rows.find((r) => (r.set_number ?? 1) === i + 1);
        if (!row || (row.reps == null && row.weight == null)) return null;
        return { reps: row.reps, weight: row.weight };
      })
    );
  }
  return byExercise;
}

// The dark hero — the one object on this screen with real weight, answering
// "what am I doing today" before anything else. Precedence (README 1a):
// today's group session if incomplete → else SPC's next incomplete → else a
// quiet state. No second program is ever mentioned here; the cards below
// carry the rest of the week.
function SessionHero({ eyebrow, chip, title, meta, ctaLabel, onStart, onPreview }) {
  return (
    <View
      style={{
        backgroundColor: HERO_DARK,
        borderRadius: 26,
        padding: 20,
        marginBottom: 22,
        overflow: "hidden",
        ...HERO_SHADOW,
      }}
    >
      {/* Decorative circle bleeding off the top-right corner. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -46,
          right: -38,
          width: 150,
          height: 150,
          borderRadius: 75,
          backgroundColor: "rgba(190,172,149,0.12)",
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.1}
            style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 1.2, textTransform: "uppercase", color: HERO_SAND }}
          >
            {eyebrow}
          </Text>
        </View>
        {chip ? (
          <View style={{ backgroundColor: "rgba(198,138,62,0.2)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
            <Text
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 0.8, color: HERO_OCHRE }}
            >
              {chip}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: HERO_CREAM, marginTop: 8 }}
      >
        {title}
      </Text>
      {meta ? (
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "rgba(247,243,238,0.62)", marginTop: 4 }}>
          {meta}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18 }}>
        <PressFade
          onPress={onStart}
          pressedOpacity={0.8}
          style={{
            flex: 1,
            backgroundColor: HERO_CREAM,
            borderRadius: 14,
            paddingVertical: 13,
            alignItems: "center",

          }}
        >
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: HERO_DARK }}>
            {ctaLabel}
          </Text>
        </PressFade>
        <PressFade
          onPress={onPreview}
          accessibilityLabel="Preview this session"
          pressedOpacity={0.6}
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "rgba(247,243,238,0.25)",
            alignItems: "center",
            justifyContent: "center",

          }}
        >
          <Ionicons name="chevron-forward" size={20} color={HERO_CREAM} />
        </PressFade>
      </View>
    </View>
  );
}

// Sibling of the hero for every non-startable state (7a/7b): already trained
// today's pair, week complete, rest day, unassigned. Keeps the hero's slot
// so the screen never collapses, but reads as settled rather than urgent —
// and never says anything about a product the member isn't enrolled in.
function QuietHero({ eyebrow, title, titleColor = OLIVE, meta, ctaLabel, onPress }) {
  return (
    <View
      style={{
        backgroundColor: QUIET_HERO_BG,
        borderRadius: 26,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: DASHED_EMPTY,
        paddingVertical: 26,
        paddingHorizontal: 20,
        marginBottom: 22,
        alignItems: "center",
      }}
    >
      {eyebrow ? <Eyebrow color={INK_MUTED}>{eyebrow}</Eyebrow> : null}
      <Text
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: titleColor, marginTop: 6, textAlign: "center" }}
      >
        {title}
      </Text>
      {meta ? (
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: INK_SECONDARY, marginTop: 6, textAlign: "center" }}>
          {meta}
        </Text>
      ) : null}
      {ctaLabel ? (
        <PressFade
          onPress={onPress}
          pressedOpacity={0.8}
          style={{
            marginTop: 16,
            alignSelf: "stretch",
            backgroundColor: CLAY,
            borderRadius: 14,
            paddingVertical: 13,
            alignItems: "center",

            shadowColor: CLAY,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 16,
          }}
        >
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#fff" }}>
            {ctaLabel}
          </Text>
        </PressFade>
      ) : null}
    </View>
  );
}

// One session of a program week. The stripe itself is 11px, but the whole
// column is the tap target and carries ≥44pt of height (house rule 6).
// Dashed = not published (house rule 1), untappable.
// `isToday` brings back the "which one is today" marker the bubble layout
// used to carry and the stripe rework dropped. Two signals, not one: a small
// TODAY label above the stripe, and today's stripe at full clay instead of
// the 31%-opacity upcoming tint. The label's row is rendered (empty) on
// every stripe whether or not it's today — sibling columns are stretched to
// equal height, so leaving it out on the others would push their stripes and
// captions to a different vertical position, which is the exact alignment
// bug the old session bubbles hit.
//
// That reserved row needs an EXPLICIT height, not a " " placeholder string.
// numberOfLines={1} makes react-native-web emit `white-space: nowrap`, which
// collapses a whitespace-only text node away entirely — measured in a
// browser: the "TODAY" label rendered 10px tall while every " " sibling
// rendered 0, dropping today's stripe 10px below the rest of its row. The
// height/lineHeight pair below makes the slot exist whatever's in it.
// `sessionLabel` ("S1", "S2", …) shares that same reserved row, per
// design_handoff_member_block_v1: without it the stripe says WED / THU and the
// sheet it opens says "Session 2", with nothing linking the two. Today's
// stripe carries both, as "S2 | TODAY".
function SessionStripe({ completed, published, caption, isToday, sessionLabel, onPress, accessibilityLabel }) {
  const label = [sessionLabel, isToday ? "TODAY" : null].filter(Boolean).join(" | ");
  return (
    <PressFade
      onPress={published ? onPress : () => showToast("Not published yet — check back soon.")}
      accessibilityLabel={accessibilityLabel}
      pressedOpacity={0.6}
      style={{
        flex: 1,
        paddingTop: 9,
        paddingBottom: 8,

      }}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1}
        style={{
          fontFamily: fonts.sansBold,
          fontSize: type.eyebrow,
          lineHeight: 14,
          height: 14,
          letterSpacing: 0.7,
          color: isToday ? BRAND_TEXT : INK_MUTED,
          textAlign: "center",
          marginBottom: 5,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          height: 11,
          borderRadius: 999,
          backgroundColor: published ? (completed ? OLIVE : isToday ? CLAY : "rgba(164,106,87,0.31)") : "transparent",
          borderWidth: published ? 0 : 1.5,
          borderStyle: published ? "solid" : "dashed",
          borderColor: DASHED_EMPTY,
        }}
      />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.1}
        style={{
          fontFamily: fonts.sansBold,
          fontSize: type.eyebrow,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: published ? (isToday ? BRAND_TEXT : INK_MUTED) : INK_MUTED,
          textAlign: "center",
          marginTop: 7,
        }}
      >
        {published ? caption || " " : "Not published"}
      </Text>
    </PressFade>
  );
}

// A program's week: dot + name + "View full block ›" left, progress ring
// right, session stripes below. Replaces the count pill (house rule 2).
function ProgramCard({ title, rows, target, completedCount, onNavigate, navigateLabel, onViewBlock, footer }) {
  const isDone = target > 0 && completedCount >= target;
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: isDone ? CARD_BORDER_DONE : CARD_BORDER,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 12,
        ...CARD_SHADOW,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={onNavigate}
          accessibilityLabel={navigateLabel ?? `Go to ${title} in My Fitness`}
          hitSlop={{ top: 8, bottom: 8 }}
          style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: CLAY }} />
          <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: INK, flexShrink: 1 }}>
            {title}
          </Text>
        </Pressable>
        {onViewBlock ? (
          <Pressable onPress={onViewBlock} hitSlop={HITSLOP}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: type.caption, color: BRAND_TEXT }}>
              View full block ›
            </Text>
          </Pressable>
        ) : null}
        <ProgressRing completed={completedCount} target={target} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        {rows.map((row) => (
          <SessionStripe
            key={row.key}
            completed={row.completed}
            published={row.published}
            caption={row.caption}
            isToday={row.isToday}
            sessionLabel={row.sessionLabel}
            onPress={row.onPress}
            accessibilityLabel={`Preview ${row.label}${row.title && row.title !== "Untitled session" ? `, ${row.title}` : ""}`}
          />
        ))}
      </View>
      {footer}
    </View>
  );
}

// The one-off "your next block is ready" row, below the stripes. It only
// exists on the final day of a block (see nextBlockPreview.js), so it reads
// as an event rather than another permanent control competing with "View
// full block ›" in the header.
function NextBlockButton({ onPress }) {
  return (
    <PressFade
      onPress={onPress}
      accessibilityLabel="Preview next block"
      style={{
        marginTop: 12,
        backgroundColor: TODAY_BG,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#f0ddd2",
        paddingHorizontal: 12,
        paddingVertical: 11,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <Ionicons name="sparkles-outline" size={15} color={CLAY} />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: BRAND_TEXT, flex: 1, minWidth: 0 }}
      >
        Preview next block
      </Text>
      <Text maxFontSizeMultiplier={1} style={{ fontSize: 16, color: BRAND_TEXT }}>
        ›
      </Text>
    </PressFade>
  );
}

// A nudge toward the Events tab, not a second copy of it. Only appears when
// a live event is actually waiting on this member — sign-ups and orders,
// which have a deadline worth missing. Read-only notices are left to the
// tab (and the announcement that already went out).
function EventsTeaser({ events, onOpen }) {
  const single = events.length === 1 ? events[0] : null;
  return (
    <PressFade
      onPress={onOpen}
      style={{
        marginBottom: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#f0ddd2",
        backgroundColor: "#fdf6f2",
        paddingVertical: 14,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Ionicons name="calendar" size={22} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
          {single ? single.title : `${events.length} things need a response`}
        </Text>
        <Text className="mt-0.5 text-xs" style={{ fontFamily: fonts.sans, color: INK_MUTED }}>
          {single
            ? single.response_type === "order"
              ? "Put in your order"
              : "Let us know if you're coming"
            : "Tap to take a look"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.primary} />
    </PressFade>
  );
}

// One-offs have no fixed session grid and no day-of-week mapping, so their
// stripes are captioned with the workout's own name instead.
function OneOffsSection({ items, onNavigate }) {
  return (
    <ProgramCard
      title="Extras"
      rows={items.map((item) => ({ ...item, caption: item.label }))}
      target={items.length}
      completedCount={items.filter((i) => i.completed).length}
      onNavigate={onNavigate}
      navigateLabel="Go to Extras in My Fitness"
    />
  );
}

// Mid-onboarding version of the Nutrition card — same shell, but where the
// 7 day circles would be there's a single button into the hub. Deliberately
// no progress numbers and no "not set up yet" copy: nothing on My Week
// should read like something's missing.
function OnboardingNutritionCard({ onNavigate }) {
  return (
    <Pressable
      onPress={onNavigate}
      accessibilityLabel="Go to nutrition onboarding"
      style={{
        backgroundColor: "#fff",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 12,
        ...CARD_SHADOW,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: INK }}>
          Nutrition
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#c9c4bd" />
      </View>
      <View
        style={{
          alignItems: "center",
          borderRadius: 14,
          paddingVertical: 12,
          backgroundColor: CLAY,
          shadowColor: CLAY,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 16,
        }}
      >
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#fff" }}>
          Onboarding
        </Text>
      </View>
    </Pressable>
  );
}

// 7-day consistency strip. Ring reads logged ÷ days elapsed, not ÷ 7
// (house rule 3) — Wednesday with 3 of 3 logged is 3/3 and olive. Today is
// never a miss until the day is over.
function NutritionCard({ days, elapsed, loggedCount, onNavigate, onDayPress }) {
  const today = todayInBoise();
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
        ...CARD_SHADOW,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable
          onPress={onNavigate}
          accessibilityLabel="Go to My Nutrition"
          hitSlop={{ top: 8, bottom: 8 }}
          style={{ flex: 1, minWidth: 0 }}
        >
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: INK }}>
            Nutrition
          </Text>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: INK_SECONDARY, marginTop: 2 }}>
            Tap a day to log it
          </Text>
        </Pressable>
        <ProgressRing completed={loggedCount} target={elapsed} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        {days.map((day) => {
          const isPastOrToday = day.date <= today;
          const missed = isPastOrToday && !day.isToday && !day.finalized;
          const todayOpen = day.isToday && !day.finalized;
          const Wrapper = isPastOrToday ? Pressable : View;
          return (
            <Wrapper
              key={day.date}
              style={{ alignItems: "center", paddingVertical: 8, paddingHorizontal: 7, gap: 6 }}
              {...(isPastOrToday
                ? {
                    onPress: () => onDayPress(day.date),
                    accessibilityLabel: `Log ${day.label} in My Nutrition`,
                  }
                : {})}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: day.finalized ? OLIVE : missed ? URGENT_BG : todayOpen ? TODAY_BG : "transparent",
                  borderWidth: day.finalized ? 0 : todayOpen ? 2 : 1.5,
                  borderColor: todayOpen ? CLAY : missed ? "#e6b6a5" : "#e0dad2",
                }}
              />
              <Text
                maxFontSizeMultiplier={1.1}
                style={{
                  fontFamily: day.isToday ? fonts.sansBold : fonts.sans,
                  fontSize: type.caption,
                  color: day.isToday ? BRAND_TEXT : INK_MUTED,
                }}
              >
                {day.label}
              </Text>
            </Wrapper>
          );
        })}
      </View>
    </View>
  );
}

// Per-program load failure (7b) — the old branch rendered bare red text with
// no way to recover.
function ProgramErrorCard({ programName, message, onRetry }) {
  return (
    <View
      style={{
        backgroundColor: TODAY_BG,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: URGENT,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 12,
      }}
    >
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: URGENT }}>
        Something went wrong loading {programName ?? "your plan"}
      </Text>
      {message ? (
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: INK_SECONDARY, marginTop: 4 }}>
          {message}
        </Text>
      ) : null}
      <PressFade
        onPress={onRetry}
        pressedOpacity={0.6}
        style={{
          alignSelf: "flex-start",
          marginTop: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: URGENT,
          paddingHorizontal: 14,
          paddingVertical: 7,

        }}
      >
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansBold, fontSize: 12, color: URGENT }}>
          Try again
        </Text>
      </PressFade>
    </View>
  );
}

// Plain card for a program with nothing scheduled — no dashed treatment,
// no ring, nothing that implies the member did something wrong.
function NoBlockCard({ programName }) {
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        paddingHorizontal: 16,
        paddingVertical: 16,
        marginBottom: 12,
        ...CARD_SHADOW,
      }}
    >
      <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: INK }}>
        {programName}
      </Text>
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12, color: INK_SECONDARY, marginTop: 4 }}>
        No active {programName} block right now.
      </Text>
    </View>
  );
}

// Card-shaped first paint (7b) instead of a bare centered spinner.
function SkeletonBlock({ width, height, radius = 999, color = SKELETON, style }) {
  return <View style={{ width, height, borderRadius: radius, backgroundColor: color, ...style }} />;
}

function MyWeekSkeleton() {
  return (
    <View>
      <View style={{ backgroundColor: SKELETON, borderRadius: 26, height: 196, marginBottom: 22 }} />
      <SkeletonBlock width={78} height={9} style={{ marginBottom: 12 }} />
      {[0, 1].map((i) => (
        <View
          key={i}
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
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {/* No `flex: 0` here — react-native-web compiles that to
                `flex: 0 1 0%`, whose 0% basis collapses an explicit width
                to nothing. Same class of RNW flex footgun as the builder
                sidebar's ScrollView width. */}
            <SkeletonBlock width={120} height={12} style={{ flexGrow: 0, flexShrink: 0 }} />
            <View style={{ flex: 1 }} />
            <SkeletonBlock width={38} height={38} color={SKELETON_ALT} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
            {[0, 1, 2].map((j) => (
              <View key={j} style={{ flex: 1 }}>
                <SkeletonBlock width="100%" height={11} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const CACHE_SECTIONS = ["groups", "spc", "nutrition", "oneOffs", "messaging", "events"];

export default function MemberHome() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState([]); // one entry per group program membership
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [spc, setSpc] = useState(null); // null = not enrolled
  const [nutrition, setNutrition] = useState(null);
  const [nutritionEnrolled, setNutritionEnrolled] = useState(false);
  const [oneOffs, setOneOffs] = useState([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [messagingEnabled, setMessagingEnabled] = useState(false);
  // Live events this member hasn't answered yet. The Events tab is where
  // they live; this is just the nudge on the screen people actually open.
  const [pendingEvents, setPendingEvents] = useState([]);
  const [heroExerciseCount, setHeroExerciseCount] = useState(null);
  const [preview, setPreview] = useState(null); // see the three open*Preview builders below
  // Which group membership's next block is open in the look-ahead sheet.
  const [nextBlockFor, setNextBlockFor] = useState(null);
  const [savingBacklog, setSavingBacklog] = useState(false);
  // The make-up chooser (design_handoff_spc_rework_v1, 1f) — set when an
  // already-logged sessions-format SPC session is tapped.
  const [makeup, setMakeup] = useState(null);
  const [makeupBusy, setMakeupBusy] = useState(false);

  // Tabs stay mounted, and useFocusEffect below re-runs load() on every
  // focus — flipping tabs quickly (or any slow network response) can leave
  // two load() calls in flight at once. Without this guard, an older call's
  // response can resolve after a newer one and overwrite good data with
  // whatever that older, possibly-incomplete fetch saw, which reads as
  // titles/rows randomly disappearing even though nothing actually changed
  // server-side. Same "cancelled" convention plan.js's SPC-detail effect
  // already uses, applied here to the whole multi-section load().
  const requestIdRef = useRef(0);

  // Whether this screen has ever had real content on it (from cache or from
  // the network). Gates the skeleton: without it, every refocus replaced a
  // fully-rendered week with a skeleton while the fan-out re-ran.
  const hasPaintedRef = useRef(false);

  // Every section below is cached under this screen name, keyed by the member
  // and by today's Boise date. The date is part of the key on purpose: this is
  // a "this week, and which day am I on" screen (isToday, dayPassed, the
  // nutrition strip's elapsed count), so an entry written yesterday must never
  // be painted today. That costs the first open of each day a cache miss,
  // which is the right trade — a wrong-day paint is worse than a slow one.
  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isStale = () => requestIdRef.current !== requestId;
    const today = todayInBoise();

    // Only fall back to the skeleton when there is genuinely nothing on
    // screen. Tabs stay mounted and useFocusEffect re-runs this on every
    // focus, so unconditionally flipping to loading meant flipping away from
    // My Nutrition and back replaced a fully-rendered week with a skeleton
    // for the length of the whole fan-out.
    if (!hasPaintedRef.current) setGroupsLoading(true);

    // Paint last-known state first. This read is local storage, single-digit
    // milliseconds against a fan-out measured in seconds, and every section
    // below still fetches and overwrites — the cache decides what's on screen
    // while that happens, never what's true.
    const cached = await readSections(SCREEN_MY_WEEK, profile.id, today, CACHE_SECTIONS);
    if (isStale()) return;
    // `in` rather than truthiness throughout: a cached null is a real answer
    // ("not enrolled"), not a miss.
    if ("groups" in cached) {
      setGroups(cached.groups);
      hasPaintedRef.current = true;
      setGroupsLoading(false);
    }
    if ("spc" in cached) setSpc(cached.spc);
    if ("nutrition" in cached) {
      setNutritionEnrolled(cached.nutrition?.enrolled ?? false);
      setNutrition(cached.nutrition?.data ?? null);
    }
    if ("oneOffs" in cached) setOneOffs(cached.oneOffs);
    if ("messaging" in cached) {
      setMessagingEnabled(cached.messaging?.enabled ?? false);
      setHasUnread(cached.messaging?.unread ?? false);
    }
    if ("events" in cached) setPendingEvents(cached.events);

    // On a failed refresh the display-only sections below keep whatever was
    // painted from cache instead of blanking themselves. Before caching, a
    // blip showed a skeleton and then an empty section; now it would show
    // real content and then take it away, which reads as "my data is gone".
    // Slightly stale beats vanished — the same reasoning retryOnce already
    // encodes. Deliberately NOT applied to groups/spc: those have real error
    // UI with a Retry, and silently hiding a persistent failure behind stale
    // content would be worse than showing it.
    //
    // Fire-and-forget by design — a cache write must never delay a render.
    const save = (section, value) => {
      void writeSection(SCREEN_MY_WEEK, profile.id, today, section, value);
    };

    // The six sections run concurrently. They were already fully independent
    // (own try/catch, own state, own retryOnce) — they were just awaited one
    // after another, which made the screen's cost the SUM of six chains
    // (~15 round trips, ~2s at the 124ms per-request latency measured
    // 2026-08-23) instead of the longest single one (~4). allSettled rather
    // than all: every section already catches its own failures, and this
    // guarantees that stays true even if a future edit throws outside one.
    // Nothing here is cached on the error paths — a failed section keeps
    // whatever was last known good rather than persisting the failure.
    await Promise.allSettled([
      // Each membership loads independently — a client can hold several
      // group program memberships at once (e.g. Flagship plus a specialty
      // program), and one program's failure shouldn't hide another's, same
      // reasoning as group-vs-SPC-vs-nutrition below. Each section is wrapped
      // in retryOnce: a transient failure on the very first request batch
      // right after a page reload (cold connections, browser resource
      // contention from many parallel fetches firing at once) used to get
      // swallowed by the plain catch below and render identically to "no data
      // here" — indistinguishable from genuinely not being enrolled, and only
      // "fixed" by navigating away and back (which re-triggers load() via
      // useFocusEffect, giving it a second, now-successful attempt). One
      // retry covers that blip without masking a real, persistent failure.
      (async () => {
        try {
          const results = await retryOnce(async () => {
            const assignments = await listMyAssignments(profile.id);
            return Promise.all(
              assignments.map(async (assignment) => {
                const program = assignment.group_programs;
                try {
                  const block = await getCurrentBlock(program.id, today);
                  if (!block) return { groupProgramId: program.id, programName: program.name, status: "no_block" };

                  const weekNumber = currentWeekNumber(block.block_start_date, blockLengthWeeks(block, program), today);
                  const workouts = await listWorkoutsForWeek(block.id, weekNumber);
                  const workoutIds = workouts.map((w) => w.id);
                  // The details variant (a Map of id -> completed_at) rather than the
                  // plain id Set: the session sheet's "LOGGED {date}" pill needs the
                  // day it happened, and .has() reads identically for the counts.
                  const completedIds = await listGroupCompletionDetailsForWorkouts(profile.id, workoutIds);

                  // Every program owns its own session count and day-of-week map
                  // now (migrations 0010/0011) — Flagship/BWA's 3-sessions-
                  // Mon/Tue-Wed/Thu-Fri/Sat shape is just this program's data,
                  // not a rule every group program follows. sessionsPerWeek is
                  // the per-client *target* (how many the member is expected to
                  // attend), not a restriction on which slots they're allowed to
                  // see — a 1x/week client can still attend whichever of the
                  // week's sessions fits their schedule, they just only need to
                  // do one of them. So every session slot for the program still
                  // gets its own stripe with its own real day-of-week caption,
                  // regardless of the client's target.
                  const sessionsPerWeek = assignment.sessions_per_week ?? program.sessions_per_week;
                  const todaysSessionNumber = sessionNumberForDate(today, program.session_days);
                  const rows = Array.from({ length: program.sessions_per_week }, (_, i) => i + 1).map((sessionNumber) => {
                    const workout = workouts.find((w) => w.session_number === sessionNumber) ?? null;
                    return {
                      key: `session-${sessionNumber}`,
                      sessionNumber,
                      workout,
                      published: !!workout,
                      label: `Session ${sessionNumber}`,
                      sessionLabel: `S${sessionNumber}`,
                      title: workout?.title || "Untitled session",
                      caption: formatSessionDays(program.session_days?.[sessionNumber - 1]),
                      dayName: firstDayName(program.session_days?.[sessionNumber - 1]),
                      completed: workout ? completedIds.has(workout.id) : false,
                      completedAt: workout ? completedIds.get(workout.id) ?? null : null,
                      isToday: sessionNumber === todaysSessionNumber,
                      // Both of this session's days are behind us in the current
                      // week — so tapping it is a back-log, not a "log today".
                      // Weekday ints are 0=Sun..6=Sat but the week runs Mon-Sun
                      // here, so both sides shift to a Monday-based index first.
                      dayPassed: (() => {
                        const days = program.session_days?.[sessionNumber - 1];
                        if (!Array.isArray(days) || days.length === 0) return false;
                        const monBased = (d) => (d + 6) % 7;
                        return Math.max(...days.map(monBased)) < monBased(dayOfWeekInBoise(today));
                      })(),
                    };
                  });

                  // What's coming after this block, but only worth a round
                  // trip during its final week — see nextBlockPreview.js. Its
                  // own try/catch: a look-ahead that fails must never take
                  // down the week she's actually training.
                  let nextBlock = null;
                  if (isFinalWeekOfBlock(weekNumber, blockLengthWeeks(block, program))) {
                    try {
                      nextBlock = await getNextBlockPreview({ program, block });
                    } catch (err) {
                      console.error("My Week: couldn't load the next block preview", err);
                    }
                  }

                  return {
                    groupProgramId: program.id,
                    programName: program.name,
                    status: "ready",
                    weekNumber,
                    blockLengthWeeks: blockLengthWeeks(block, program),
                    blockEndDate: block.block_end_date,
                    sessionsPerWeek,
                    nextBlock,
                    rows,
                  };
                } catch (err) {
                  return { groupProgramId: program.id, programName: program.name, status: "error", message: err.message ?? String(err) };
                }
              })
            );
          });
          if (!isStale()) {
            setGroups(results);
            // A per-membership error object is a legitimate cached value (the
            // member really does have a program that failed to resolve), but
            // caching a whole-screen failure is not — see the catch below.
            save("groups", results);
          }
        } catch (err) {
          console.error("My Week: failed to load group programs", err);
          if (!isStale()) setGroups([{ status: "error", message: err.message ?? String(err) }]);
        } finally {
          if (!isStale()) {
            hasPaintedRef.current = true;
            setGroupsLoading(false);
          }
        }
      })(),

      (async () => {
        try {
          const spcResult = await retryOnce(async () => {
            const spcClient = await getSpcClient(profile.id);
            if (!isSpcActive(spcClient)) return { status: "inactive" };

            const block = await getCurrentSpcBlock(profile.id, today);
            if (!block) return { status: "no_block" };

            // Sessions-format runs (0102) have no authored week grid: the week
            // is uncapped calendar arithmetic — a lapsed or ongoing run keeps
            // counting, and completions file under that same uncapped number,
            // so the clamped legacy math would stop matching them the week the
            // run outlived its planned length.
            const weekNumber =
              block.format === "sessions"
                ? calendarWeekNumber(block.block_start_date, today)
                : currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
            const workouts = await listSpcWorkoutsForWeek(block.id, weekNumber, block);
            if (workouts.length === 0) return { status: "not_published" };

            const sessionsPerWeek = spcClient.sessions_per_week;
            const workoutIds = workouts.map((w) => w.id);
            const completedIds = await listSpcCompletionDetailsForWorkouts(profile.id, workoutIds);

            const rows = Array.from({ length: sessionsPerWeek }, (_, i) => i + 1).map((sessionNumber) => {
              const workout = workouts.find((w) => w.session_number === sessionNumber) ?? null;
              return {
                key: `spc-session-${sessionNumber}`,
                sessionNumber,
                workout,
                published: !!workout,
                label: `Session ${sessionNumber}`,
                sessionLabel: `S${sessionNumber}`,
                title: workout?.title || "Untitled session",
                completed: workout ? completedIds.has(`${workout.id}:${weekNumber}`) : false,
                completedAt: workout ? completedIds.get(`${workout.id}:${weekNumber}`) ?? null : null,
              };
            });

            return { status: "ready", weekNumber, blockLengthWeeks: block.block_length_weeks, sessionsPerWeek, rows, block };
          });
          if (!isStale()) {
            const value = spcResult.status === "inactive" ? null : spcResult;
            setSpc(value);
            save("spc", value);
          }
        } catch (err) {
          console.error("My Week: failed to load SPC", err);
          // A genuine fetch failure is not the same as "not enrolled" — setting
          // spc to null here made a failed SPC fetch indistinguishable from a
          // client who was never on SPC at all, which fed straight into the
          // "not assigned to a program yet" message below even for an SPC-only
          // member. An error-status object still fails every ready/no_block/
          // not_published render check below, but `!spc` is now false, so the
          // false claim is suppressed.
          if (!isStale()) setSpc({ status: "error", message: err.message ?? String(err) });
        }
      })(),

      // Monday-Sunday of the current week, regardless of which day "today"
      // falls on — dayOfWeekInBoise is 0=Sunday..6=Saturday, so Sunday needs
      // its own offset (Monday was 6 days ago) rather than 1 - day.
      (async () => {
        try {
          // enrolled comes back alongside the strip rather than being set from
          // inside retryOnce, so a retried attempt can't set it twice and a
          // total failure leaves the last known value alone instead of
          // half-applying this run.
          const result = await retryOnce(async () => {
            const nutritionClient = await getNutritionClient(profile.id);
            // Enrollment (any active row, approved or not) is tracked
            // separately from the strip — it gates the "not assigned to a
            // program" message below, which used to fire for nutrition-only
            // members.
            const enrolled = nutritionClient?.status === "active";
            if (!nutritionClient || nutritionClient.status !== "active") return { enrolled, data: null };

            // Mid-onboarding (sent, not yet approved): My Week still shows a
            // normal-looking Nutrition card with an "Onboarding" button where
            // the day circles will eventually be.
            if (!nutritionClient.objective_tracking_approved_at) {
              return { enrolled, data: nutritionClient.onboarding_sent_at ? { status: "onboarding" } : null };
            }

            const dow = dayOfWeekInBoise(today);
            const weekStart = addDays(today, dow === 0 ? -6 : 1 - dow);
            const weekEnd = addDays(weekStart, 6);
            const logs = await listLogsForDateRange(profile.id, weekStart, weekEnd);
            const finalizedDates = new Set(logs.filter((l) => l.finalized_at).map((l) => l.date));
            const days = Array.from({ length: 7 }, (_, i) => {
              const date = addDays(weekStart, i);
              return { date, label: DAY_LABELS[i], finalized: finalizedDates.has(date), isToday: date === today };
            });
            // Adherence is measured against days elapsed, not 7 (house rule 3).
            const elapsed = days.filter((d) => d.date <= today).length;
            const loggedCount = days.filter((d) => d.date <= today && d.finalized).length;
            return { enrolled, data: { status: "ready", days, elapsed, loggedCount } };
          });
          if (!isStale()) {
            setNutritionEnrolled(result.enrolled);
            setNutrition(result.data);
            save("nutrition", result);
          }
        } catch (err) {
          console.error("My Week: failed to load nutrition", err);
          if (!isStale() && !("nutrition" in cached)) setNutrition(null);
        }
      })(),

      // One-offs load independently too — an away workout or trial session
      // assignment has nothing to do with group/SPC/nutrition, so its
      // failure shouldn't hide any of those sections.
      (async () => {
        try {
          const workouts = await retryOnce(() => listWeekOneOffWorkoutsForUser(profile.id, today));
          const mapped = workouts.map((w) => ({
            key: w.id,
            workoutId: w.id,
            label: w.title,
            completed: w.completed,
            // listWeekOneOffWorkoutsForUser already filters to status:
            // "published" — every row here is real and tappable, unlike a
            // group/SPC session slot which can legitimately be an
            // unpublished placeholder.
            published: true,
          }));
          if (!isStale()) {
            setOneOffs(mapped);
            save("oneOffs", mapped);
          }
        } catch (err) {
          console.error("My Week: failed to load one-offs", err);
          if (!isStale() && !("oneOffs" in cached)) setOneOffs([]);
        }
      })(),

      // Admin-configurable kill switch/audience (lib/programming/
      // messagingSettings.js) — the unread check stays chained behind it
      // rather than running alongside, since both the icon and its dot are
      // pointless to fetch when messaging is off for this member. Own
      // isolated section, defaults to hidden on failure.
      (async () => {
        let messagingIsEnabled = false;
        try {
          messagingIsEnabled = await retryOnce(() => isMessagingEnabledForUser(profile.id));
          if (!isStale()) setMessagingEnabled(messagingIsEnabled);
        } catch (err) {
          console.error("My Week: failed to check messaging settings", err);
          if (!isStale() && !("messaging" in cached)) setMessagingEnabled(false);
          return;
        }

        if (!messagingIsEnabled) {
          if (!isStale()) {
            setHasUnread(false);
            save("messaging", { enabled: false, unread: false });
          }
          return;
        }

        try {
          const unread = await retryOnce(() => hasUnreadMessages(profile.id));
          if (!isStale()) {
            setHasUnread(unread);
            save("messaging", { enabled: true, unread });
          }
        } catch (err) {
          console.error("My Week: failed to check unread messages", err);
          if (!isStale() && !("messaging" in cached)) setHasUnread(false);
        }
      })(),

      // Own try/catch, like every other domain on this screen — an events
      // failure must not take down the training or nutrition cards.
      (async () => {
        try {
          const live = await retryOnce(() => listLiveEventsForUser(profile.id));
          // Only the ones that actually want something back. A read-only notice
          // has no deadline to miss, and nagging about it here would just be
          // noise on top of the announcement that already went out.
          const wantsResponse = live.filter((e) => e.response_type === "signup" || e.response_type === "order");
          const responded = await retryOnce(() => listMyResponses(profile.id, wantsResponse.map((e) => e.id)));
          const pending = wantsResponse.filter((e) => !responded[e.id]);
          if (!isStale()) {
            setPendingEvents(pending);
            save("events", pending);
          }
        } catch (err) {
          console.error("My Week: failed to check events", err);
          if (!isStale() && !("events" in cached)) setPendingEvents([]);
        }
      })(),
    ]);
  }, [profile.id]);

  // Refetch on every focus, not just first mount — Tabs keep this screen
  // mounted in the background, so without this, finalizing a session on My
  // Fitness wouldn't be reflected here until a full app reload.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const readyGroups = useMemo(() => groups.filter((g) => g.status === "ready"), [groups]);
  const hasTraining = readyGroups.length > 0 || spc?.status === "ready" || oneOffs.length > 0;

  // Hero precedence (README 1a): today's group session if incomplete → else
  // SPC's next incomplete → else a quiet state. Never mentions a second
  // program.
  const hero = useMemo(() => {
    for (const group of readyGroups) {
      const row = group.rows.find((r) => r.isToday);
      if (row?.published && !row.completed) {
        return {
          kind: "session",
          source: "group",
          group,
          row,
          workoutId: row.workout.id,
          eyebrow: `${group.programName} | ${row.label}`,
          chip: group.blockLengthWeeks ? `Week ${group.weekNumber} of ${group.blockLengthWeeks}` : null,
          title: row.title !== "Untitled session" ? row.title : row.label,
          logParams: {
            session: "group",
            groupProgramId: group.groupProgramId,
            weekNumber: String(group.weekNumber),
            sessionNumber: String(row.sessionNumber),
          },
        };
      }
    }

    if (spc?.status === "ready") {
      const row = spc.rows.find((r) => r.published && !r.completed);
      if (row) {
        return {
          kind: "session",
          source: "spc",
          spc,
          row,
          workoutId: row.workout.id,
          eyebrow: `SPC | ${row.label}`,
          chip: spc.blockLengthWeeks ? `Week ${spc.weekNumber} of ${spc.blockLengthWeeks}` : null,
          title: row.title !== "Untitled session" ? row.title : row.label,
          logParams: { session: "spc", weekNumber: String(spc.weekNumber), sessionNumber: String(row.sessionNumber) },
        };
      }
    }

    const oneOff = oneOffs.find((o) => !o.completed);
    if (oneOff) {
      return {
        kind: "session",
        source: "one_off",
        oneOff,
        workoutId: oneOff.workoutId,
        eyebrow: "Extras",
        chip: null,
        title: oneOff.label,
        logParams: { session: "one_off", oneOffWorkoutId: oneOff.workoutId },
      };
    }

    if (!hasTraining) {
      // Nutrition-only member (7b): the hero becomes tonight's log. No empty
      // program slots, no line implying missing training.
      if (nutrition?.status === "ready") {
        const todaysDay = nutrition.days.find((d) => d.isToday);
        return {
          kind: "nutrition",
          logged: !!todaysDay?.finalized,
          loggedCount: nutrition.loggedCount,
          elapsed: nutrition.elapsed,
        };
      }
      if (nutrition?.status === "onboarding" || nutritionEnrolled) return null;
      return { kind: "unassigned" };
    }

    // Every training slot is either done or unpublished. Which quiet state
    // depends on whether the week's target is met.
    const targetsMet = readyGroups.every((g) => g.rows.filter((r) => r.completed).length >= g.sessionsPerWeek)
      && (spc?.status !== "ready" || spc.rows.filter((r) => r.completed).length >= spc.sessionsPerWeek);

    // A member whose only training is one-offs has no groups and no SPC, so
    // every count below sums to zero and readyGroups.every() on an empty
    // array is vacuously true — the hero read, literally, "Training complete
    // — 0 of 0 this week." There's no weekly target to report against here,
    // so say the true thing instead of a number.
    if (readyGroups.length === 0 && spc?.status !== "ready") {
      return {
        kind: "session_done",
        title: oneOffs.length > 0 ? "Extras all done" : "Nothing scheduled",
        meta: "Your coach will add more when there's more to do.",
      };
    }

    if (targetsMet) {
      const completed =
        readyGroups.reduce((sum, g) => sum + g.rows.filter((r) => r.completed).length, 0) +
        (spc?.status === "ready" ? spc.rows.filter((r) => r.completed).length : 0);
      const target =
        readyGroups.reduce((sum, g) => sum + g.sessionsPerWeek, 0) + (spc?.status === "ready" ? spc.sessionsPerWeek : 0);
      return { kind: "week_done", completed, target };
    }

    // Already trained today's pair: today's session is done, but the week
    // isn't. Point at whichever session opens next.
    for (const group of readyGroups) {
      const row = group.rows.find((r) => r.isToday && r.completed);
      if (row) {
        const next = group.rows.find((r) => r.sessionNumber > row.sessionNumber);
        return {
          kind: "session_done",
          title: `${row.label} complete`,
          meta: next?.dayName ? `${next.label} opens ${next.dayName}.` : "Back Monday.",
        };
      }
    }

    // Nothing scheduled today (e.g. Sunday, which no session_days entry
    // covers) and the week isn't finished yet.
    const completed =
      readyGroups.reduce((sum, g) => sum + g.rows.filter((r) => r.completed).length, 0) +
      (spc?.status === "ready" ? spc.rows.filter((r) => r.completed).length : 0);
    const target =
      readyGroups.reduce((sum, g) => sum + g.sessionsPerWeek, 0) + (spc?.status === "ready" ? spc.sessionsPerWeek : 0);
    return { kind: "rest_day", completed, target };
  }, [readyGroups, spc, oneOffs, nutrition, nutritionEnrolled, hasTraining]);

  // The hero's meta line ("6 exercises") is the one number My Week doesn't
  // already have in hand — everything else on this screen comes from the
  // batched week queries. One extra fetch, only for whichever session the
  // hero actually resolved to.
  const heroWorkoutId = hero?.kind === "session" ? hero.workoutId : null;
  const heroSource = hero?.kind === "session" ? hero.source : null;
  useEffect(() => {
    if (!heroWorkoutId) {
      setHeroExerciseCount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows =
          heroSource === "spc"
            ? await listSpcWorkoutExercises(heroWorkoutId)
            : heroSource === "one_off"
              ? await listOneOffExercises(heroWorkoutId)
              : await listWorkoutExercises(heroWorkoutId);
        if (!cancelled) setHeroExerciseCount(rows.length);
      } catch (err) {
        console.error("My Week: failed to load hero exercise count", err);
        if (!cancelled) setHeroExerciseCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [heroWorkoutId, heroSource]);

  const openGroupPreview = async (groupEntry, row) => {
    if (!row.workout) return;
    setPreview({
      visible: true,
      loading: true,
      error: null,
      eyebrow: `Week ${groupEntry.weekNumber} | ${row.label}`,
      title: row.title !== "Untitled session" ? row.title : row.label,
      // My Week only ever shows the current week, so a session here is
      // logged, today's, already gone by (back-log) or still to come.
      state: row.completed ? "logged" : row.isToday ? "today" : row.dayPassed ? "backlog" : "today",
      completedDateLabel: row.completedAt ? formatDateMDY(dateInBoise(new Date(row.completedAt))) : null,
      pillLabel: row.completed ? null : row.isToday ? null : row.dayPassed ? null : "LATER THIS WEEK",
      logParams: {
        session: "group",
        groupProgramId: groupEntry.groupProgramId,
        weekNumber: String(groupEntry.weekNumber),
        sessionNumber: String(row.sessionNumber),
      },
      retry: () => openGroupPreview(groupEntry, row),
      source: groupEntry.source,
      session: { groupWorkoutId: row.workout.id },
      warmups: [],
      exercises: [],
    });
    try {
      // Completion is re-read from the network here rather than trusted from
      // the row. My Week can paint from cache (lib/screenCache.js), so a
      // session finalized since that snapshot would otherwise open in "log
      // this" mode with empty set boxes — showing a member a workout they
      // already did as undone, and inviting them to log it a second time.
      // It rides the same parallel batch as the warmups, so it costs nothing.
      const [warmups, exercises, logs, completion] = await Promise.all([
        listWarmups(row.workout.id),
        listWorkoutExercises(row.workout.id),
        listLogsForSession(profile.id, { groupWorkoutId: row.workout.id }),
        getGroupCompletion(profile.id, row.workout.id),
      ]);
      const completed = !!completion;
      setPreview((p) => ({
        ...p,
        loading: false,
        state: completed ? "logged" : row.isToday ? "today" : row.dayPassed ? "backlog" : "today",
        pillLabel: completed ? null : row.isToday ? null : row.dayPassed ? null : "LATER THIS WEEK",
        completedDateLabel: completion?.completed_at ? formatDateMDY(dateInBoise(new Date(completion.completed_at))) : null,
        warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
        exercises: exercises.map((ex) => ({
          id: ex.id,
          exerciseId: ex.exercises?.id ?? ex.exercise_id,
          name: ex.exercises?.name ?? "Exercise",
          // Sets × reps only — rest lives on the logging screen, not here.
          detail: `${ex.sets ?? "–"} × ${ex.reps ?? "–"}`,
          supersetGroupId: ex.superset_group_id,
          targetSets: ex.sets,
        })),
        loggedSets: setsByExercise(completed ? logs : null, exercises),
      }));
    } catch (err) {
      setPreview((p) => ({ ...p, loading: false, error: err.message ?? String(err) }));
    }
  };

  const openSpcPreview = async (spcEntry, row, { skipMakeup = false } = {}) => {
    if (!row.workout) return;
    // A session she already logged this calendar week, on a sessions-format
    // run (0102): asking "update it, or start a new one?" first is what makes
    // a make-up representable at all — a second real instance of the same
    // session, for making up a week she missed. Weekly-format blocks keep the
    // old open-the-logged-session behavior.
    if (!skipMakeup && row.completed && spcEntry.block?.format === "sessions") {
      setMakeup({ spcEntry, row });
      return;
    }
    setPreview({
      visible: true,
      loading: true,
      error: null,
      eyebrow: `Week ${spcEntry.weekNumber} | ${row.label}`,
      title: row.title !== "Untitled session" ? row.title : row.label,
      // SPC has no day-of-week routing, so a session is either done or open.
      state: row.completed ? "logged" : "today",
      pillLabel: row.completed ? null : "THIS WEEK",
      completedDateLabel: row.completedAt ? formatDateMDY(dateInBoise(new Date(row.completedAt))) : null,
      logParams: { session: "spc", weekNumber: String(spcEntry.weekNumber), sessionNumber: String(row.sessionNumber) },
      retry: () => openSpcPreview(spcEntry, row),
      source: "spc",
      // Authored week, not the displayed one — see plan.js's note.
      session: { spcWorkoutId: row.workout.id, weekNumber: row.workout.week_number },
      warmups: [],
      exercises: [],
    });
    try {
      // Completion is re-read from the network here rather than trusted from
      // the row. My Week can paint from cache (lib/screenCache.js), so a
      // session finalized since that snapshot would otherwise open in "log
      // this" mode with empty set boxes — showing a member a workout they
      // already did as undone, and inviting them to log it a second time.
      // It rides the same parallel batch as the warmups, so it costs nothing.
      const [warmups, exerciseRows, logs, completion] = await Promise.all([
        listSpcWarmups(row.workout.id),
        listSpcWorkoutExercises(row.workout.id),
        listLogsForSession(profile.id, { spcWorkoutId: row.workout.id, weekNumber: row.workout.week_number }),
        getSpcCompletion(profile.id, row.workout.id),
      ]);
      const completed = !!completion;
      setPreview((p) => ({
        ...p,
        loading: false,
        state: completed ? "logged" : "today",
        pillLabel: completed ? null : "THIS WEEK",
        completedDateLabel: completion?.completed_at ? formatDateMDY(dateInBoise(new Date(completion.completed_at))) : null,
        warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
        exercises: exerciseRows.map((ex) => ({
          id: ex.id,
          exerciseId: ex.exercises?.id ?? ex.exercise_id,
          name: ex.exercises?.name ?? "Exercise",
          // Sets × reps only — rest lives on the logging screen, not here.
          detail: `${ex.sets ?? "–"} × ${ex.reps ?? "–"}`,
          supersetGroupId: ex.superset_group_id,
          targetSets: ex.sets,
        })),
        loggedSets: setsByExercise(completed ? logs : null, exerciseRows),
      }));
    } catch (err) {
      setPreview((p) => ({ ...p, loading: false, error: err.message ?? String(err) }));
    }
  };

  const openOneOffPreview = async (item) => {
    setPreview({
      visible: true,
      loading: true,
      error: null,
      eyebrow: "Extra session",
      title: item.label,
      state: item.completed ? "logged" : "today",
      pillLabel: item.completed ? null : "ANYTIME",
      logParams: { session: "one_off", oneOffWorkoutId: item.workoutId },
      retry: () => openOneOffPreview(item),
      source: "one_off",
      session: { oneOffWorkoutId: item.workoutId },
      warmups: [],
      exercises: [],
    });
    try {
      // Completion is re-read from the network here rather than trusted from
      // the row. My Week can paint from cache (lib/screenCache.js), so a
      // session finalized since that snapshot would otherwise open in "log
      // this" mode with empty set boxes — showing a member a workout they
      // already did as undone, and inviting them to log it a second time.
      // It rides the same parallel batch as the warmups, so it costs nothing.
      const [warmups, exercises, logs, completion] = await Promise.all([
        listOneOffWarmups(item.workoutId),
        listOneOffExercises(item.workoutId),
        listLogsForSession(profile.id, { oneOffWorkoutId: item.workoutId }),
        getOneOffCompletion(profile.id, item.workoutId),
      ]);
      const completed = !!completion;
      setPreview((p) => ({
        ...p,
        loading: false,
        state: completed ? "logged" : "today",
        pillLabel: completed ? null : "ANYTIME",
        completedDateLabel: completion?.completed_at ? formatDateMDY(dateInBoise(new Date(completion.completed_at))) : null,
        warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
        exercises: exercises.map((ex) => ({
          id: ex.id,
          exerciseId: ex.exercises?.id ?? ex.exercise_id,
          name: ex.exercises?.name ?? "Exercise",
          // Sets × reps only — rest lives on the logging screen, not here.
          detail: `${ex.sets ?? "–"} × ${ex.reps ?? "–"}`,
          supersetGroupId: ex.superset_group_id,
          targetSets: ex.sets,
        })),
        loggedSets: setsByExercise(completed ? logs : null, exercises),
      }));
    } catch (err) {
      setPreview((p) => ({ ...p, loading: false, error: err.message ?? String(err) }));
    }
  };

  const closePreview = () => setPreview((p) => (p ? { ...p, visible: false } : p));

  // "Log this session" / "Update this session" hand off to My Fitness, which
  // is where a session is actually worked through. "Save this session" is the
  // back-log case and finishes here — the sets have already been typed into
  // the sheet and autosaved against the date she picked, so all that's left is
  // the completion row.
  const handleLogPress = async (logDate) => {
    if (preview?.state === "backlog" && preview?.session?.groupWorkoutId) {
      setSavingBacklog(true);
      try {
        // 18:00Z is mid-day in Boise either side of DST — parsing without a
        // zone would use the device's, which lands a back-log on the wrong
        // Boise day from UTC+7 and later.
        await finalizeGroupSession(profile.id, preview.session.groupWorkoutId, new Date(`${logDate}T18:00:00Z`).toISOString());
        closePreview();
        showToast("Session saved.");
        load();
      } catch (err) {
        console.error("My Week: back-log finalize failed", err);
        showToast("Couldn't save that session — try again.");
      } finally {
        setSavingBacklog(false);
      }
      return;
    }
    const logParams = preview?.logParams;
    if (!logParams) return;
    closePreview();
    router.push({ pathname: "/(member)/plan", params: logParams });
  };

  const openHeroPreview = () => {
    if (hero?.kind !== "session") return;
    if (hero.source === "group") openGroupPreview(hero.group, hero.row);
    else if (hero.source === "spc") openSpcPreview(hero.spc, hero.row);
    else openOneOffPreview(hero.oneOff);
  };

  const header = (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4 }}>
          <Pressable onPress={() => router.push("/(member)/settings")} hitSlop={HITSLOP} accessibilityLabel="Settings">
            <Ionicons name="settings-outline" size={20} color={INK_SECONDARY} />
          </Pressable>
          {messagingEnabled ? (
            <Pressable onPress={() => router.push("/(member)/messages")} hitSlop={HITSLOP} style={{ position: "relative" }} accessibilityLabel="Messages">
              <Ionicons name="chatbubble-outline" size={20} color={INK_SECONDARY} />
              {hasUnread ? (
                <View
                  style={{
                    position: "absolute",
                    top: -1,
                    right: -1,
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: URGENT,
                    borderWidth: 1.5,
                    borderColor: CANVAS,
                  }}
                />
              ) : null}
            </Pressable>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 27, color: CLAY }}>
            Hi, {profile?.name}
          </Text>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12, color: INK_SECONDARY, marginTop: 2 }}>
            {formatToday()}
          </Text>
        </View>
        <Image source={require("../../assets/kova-logo.jpg")} style={{ width: 34, height: 34, borderRadius: 17 }} />
      </View>
      <View style={{ height: 18 }} />
    </>
  );

  if (groupsLoading) {
    return (
      <ScrollView
        style={{ backgroundColor: CANVAS }}
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingHorizontal: 20, paddingBottom: 20 }}
      >
        {header}
        <MyWeekSkeleton />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: CANVAS }}
      contentContainerStyle={{ paddingTop: insets.top + 6, paddingHorizontal: 20, paddingBottom: 20 }}
    >
      {header}

      {hero?.kind === "session" && (
        <SessionHero
          eyebrow={hero.eyebrow}
          chip={hero.chip}
          title={hero.title}
          meta={heroExerciseCount != null ? `${heroExerciseCount} exercise${heroExerciseCount === 1 ? "" : "s"}` : null}
          ctaLabel="Start session"
          onStart={() => router.push({ pathname: "/(member)/plan", params: hero.logParams })}
          onPreview={openHeroPreview}
        />
      )}
      {hero?.kind === "session_done" && <QuietHero eyebrow="Today" title={hero.title} meta={hero.meta} />}
      {hero?.kind === "week_done" && (
        <QuietHero eyebrow="This week" title="Training complete" meta={`${hero.completed} of ${hero.target} this week, back Monday.`} />
      )}
      {hero?.kind === "rest_day" && (
        <QuietHero eyebrow="Today" title="Rest day" titleColor={BRAND_TEXT} meta={`${hero.completed} of ${hero.target} sessions this week.`} />
      )}
      {hero?.kind === "nutrition" && (
        <QuietHero
          eyebrow="Tonight's log"
          title={hero.logged ? "Logged for today" : "Not logged yet"}
          titleColor={hero.logged ? OLIVE : BRAND_TEXT}
          meta={hero.logged ? `${hero.loggedCount} of ${hero.elapsed} days logged this week.` : "Weight, macros, steps, sleep."}
          ctaLabel={hero.logged ? null : "Log today"}
          onPress={() => router.push("/(member)/nutrition")}
        />
      )}
      {hero?.kind === "unassigned" && (
        <QuietHero
          title="Welcome to Kova"
          titleColor={CLAY}
          meta="Your coach is building your program. Check back soon."
        />
      )}

      {(readyGroups.length > 0 || spc?.status === "ready" || oneOffs.length > 0 || nutrition || groups.some((g) => g.status !== "ready")) && (
        <Eyebrow style={{ marginBottom: 10 }}>Your week</Eyebrow>
      )}

      {groups.map((groupEntry, i) => {
        if (groupEntry.status === "error") {
          return (
            <ProgramErrorCard
              key={groupEntry.groupProgramId ?? `group-error-${i}`}
              programName={groupEntry.programName}
              message={groupEntry.message}
              onRetry={load}
            />
          );
        }
        if (groupEntry.status === "no_block") {
          return <NoBlockCard key={groupEntry.groupProgramId} programName={groupEntry.programName} />;
        }
        return (
          <ProgramCard
            key={groupEntry.groupProgramId}
            title={groupEntry.programName}
            rows={groupEntry.rows.map((row) => ({ ...row, onPress: () => openGroupPreview(groupEntry, row) }))}
            target={groupEntry.sessionsPerWeek}
            completedCount={groupEntry.rows.filter((r) => r.completed).length}
            onNavigate={() => router.push({ pathname: "/(member)/plan", params: { program: groupEntry.groupProgramId } })}
            onViewBlock={() => router.push({ pathname: "/(member)/plan-block", params: { programId: groupEntry.groupProgramId } })}
            footer={
              // Evaluated at render rather than baked into the fetched entry:
              // this screen can paint from cache (lib/screenCache.js), and the
              // clock is the only part of the condition that moves during a
              // single day.
              groupEntry.nextBlock && nextBlockPreviewIsDue(groupEntry.blockEndDate) ? (
                <NextBlockButton onPress={() => setNextBlockFor(groupEntry)} />
              ) : null
            }
          />
        );
      })}

      {spc?.status === "error" && <ProgramErrorCard programName="SPC" message={spc.message} onRetry={load} />}
      {spc?.status === "no_block" && <NoBlockCard programName="SPC" />}
      {spc?.status === "not_published" && (
        <View
          style={{
            backgroundColor: "#fff",
            borderRadius: 18,
            borderWidth: 1,
            borderColor: CARD_BORDER,
            paddingHorizontal: 16,
            paddingVertical: 16,
            marginBottom: 12,
            ...CARD_SHADOW,
          }}
        >
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: INK }}>
            SPC
          </Text>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 12, color: INK_SECONDARY, marginTop: 4 }}>
            Your SPC coach hasn't published this block yet — check back soon.
          </Text>
        </View>
      )}
      {spc?.status === "ready" && (
        <ProgramCard
          title="SPC"
          rows={spc.rows.map((row) => ({ ...row, onPress: () => openSpcPreview(spc, row) }))}
          target={spc.sessionsPerWeek}
          completedCount={spc.rows.filter((r) => r.completed).length}
          onNavigate={() => router.push({ pathname: "/(member)/plan", params: { program: "spc" } })}
          onViewBlock={() => router.push("/(member)/plan-spc-block")}
        />
      )}

      {pendingEvents.length > 0 && (
        <EventsTeaser events={pendingEvents} onOpen={() => router.push("/(member)/events")} />
      )}

      {oneOffs.length > 0 && (
        <OneOffsSection
          items={oneOffs.map((item) => ({ ...item, onPress: () => openOneOffPreview(item) }))}
          onNavigate={() => router.push({ pathname: "/(member)/plan", params: { program: "extras" } })}
        />
      )}

      {nutrition?.status === "ready" && (
        <NutritionCard
          days={nutrition.days}
          elapsed={nutrition.elapsed}
          loggedCount={nutrition.loggedCount}
          onNavigate={() => router.push("/(member)/nutrition")}
          onDayPress={(date) => router.push({ pathname: "/(member)/nutrition", params: { date } })}
        />
      )}
      {nutrition?.status === "onboarding" && <OnboardingNutritionCard onNavigate={() => router.push("/(member)/nutrition")} />}

      <SessionSheet
        visible={!!preview?.visible}
        onClose={closePreview}
        eyebrow={preview?.eyebrow}
        title={preview?.title}
        state={preview?.state ?? "today"}
        pillLabel={preview?.pillLabel}
        completedDateLabel={preview?.completedDateLabel}
        loading={preview?.loading}
        error={preview?.error}
        onRetry={preview?.retry}
        exercises={preview?.exercises}
        loggedSets={preview?.loggedSets}
        userId={profile.id}
        source={preview?.source}
        session={preview?.session}
        ctaBusy={savingBacklog}
        onCta={handleLogPress}
      />

      <NextBlockSheet
        visible={!!nextBlockFor}
        onClose={() => setNextBlockFor(null)}
        programName={nextBlockFor?.programName}
        preview={nextBlockFor?.nextBlock}
      />

      <MakeupSessionSheet
        visible={!!makeup}
        onClose={() => setMakeup(null)}
        sessionLabel={makeup?.row?.label ?? "this session"}
        loggedDateLabel={makeup?.row?.completedAt ? formatDateMDY(dateInBoise(new Date(makeup.row.completedAt))) : null}
        busy={makeupBusy}
        onUpdate={() => {
          const target = makeup;
          setMakeup(null);
          if (target) openSpcPreview(target.spcEntry, target.row, { skipMakeup: true });
        }}
        onStartNew={async () => {
          if (!makeup) return;
          setMakeupBusy(true);
          try {
            // The fresh instance exists the moment she chooses it — her week
            // counts it right away, and the logging screen's own date then
            // derives from its completed_at (today).
            await startNewSpcSessionInstance(profile.id, makeup.row.workout.id);
            const params = { session: "spc", weekNumber: String(makeup.spcEntry.weekNumber), sessionNumber: String(makeup.row.sessionNumber) };
            setMakeup(null);
            router.push({ pathname: "/(member)/plan", params });
          } catch (err) {
            console.error("My Week: couldn't start a make-up session", err);
            showToast("Couldn't start a new one — try again.");
          } finally {
            setMakeupBusy(false);
          }
        }}
      />
    </ScrollView>
  );
}
