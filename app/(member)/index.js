import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise, dayOfWeekInBoise, addDays } from "../../lib/boiseDate";
import { currentWeekNumber, sessionNumberForDate, formatSessionDays } from "../../lib/programming/schedule";
import { listMyAssignments, getCurrentBlock, listWorkoutsForWeek } from "../../lib/programming/memberPlan";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { getSpcClient, isSpcActive } from "../../lib/programming/spcClients";
import { getCurrentSpcBlock, listSpcWorkoutsForWeek } from "../../lib/programming/spcBlocks";
import { listSpcWorkoutExercises, listSpcWarmups } from "../../lib/programming/spcWorkouts";
import { listGroupCompletionsForWorkouts, getCompletedSpcWorkoutIdsForWeek } from "../../lib/programming/sessionCompletions";
import { listWeekOneOffWorkoutsForUser, listOneOffWarmups, listOneOffExercises } from "../../lib/programming/oneOffWorkouts";
import { hasUnreadMessages } from "../../lib/programming/messages";
import { isMessagingEnabledForUser } from "../../lib/programming/messagingSettings";
import { listLogsForDateRange } from "../../lib/nutrition/dailyLog";
import { getClient as getNutritionClient } from "../../lib/nutrition/clients";
import { retryOnce } from "../../lib/retry";
import { SessionPreviewModal } from "../../components/SessionPreviewModal";
import { ProgressRing } from "../../components/ProgressRing";
import { PressFade } from "../../components/PressFade";
import { fonts } from "../../lib/theme";
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
const INK_MUTED = "#a8a29e";
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

function Eyebrow({ children, color = INK_MUTED, style }) {
  return (
    <Text
      maxFontSizeMultiplier={1.1}
      style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color, ...style }}
    >
      {children}
    </Text>
  );
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
            style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.3, textTransform: "uppercase", color: HERO_SAND }}
          >
            {eyebrow}
          </Text>
        </View>
        {chip ? (
          <View style={{ backgroundColor: "rgba(198,138,62,0.2)", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
            <Text
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.8, color: HERO_OCHRE }}
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
function SessionStripe({ completed, published, caption, onPress, accessibilityLabel }) {
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
      <View
        style={{
          height: 11,
          borderRadius: 999,
          backgroundColor: published ? (completed ? OLIVE : "rgba(164,106,87,0.31)") : "transparent",
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
          fontSize: 9,
          letterSpacing: 0.55,
          textTransform: "uppercase",
          color: published ? INK_MUTED : "#c9c4bd",
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
function ProgramCard({ title, rows, target, completedCount, onNavigate, navigateLabel, onViewBlock }) {
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
            <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 11, color: BRAND_TEXT }}>
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
            onPress={row.onPress}
            accessibilityLabel={`Preview ${row.label}${row.title && row.title !== "Untitled session" ? `, ${row.title}` : ""}`}
          />
        ))}
      </View>
    </View>
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
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11, color: INK_SECONDARY, marginTop: 2 }}>
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
                  fontSize: 10,
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
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: INK_SECONDARY, marginTop: 4 }}>
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
  const [heroExerciseCount, setHeroExerciseCount] = useState(null);
  const [preview, setPreview] = useState(null); // { visible, loading, title, subtitle, warmups, exercises }

  // Tabs stay mounted, and useFocusEffect below re-runs load() on every
  // focus — flipping tabs quickly (or any slow network response) can leave
  // two load() calls in flight at once. Without this guard, an older call's
  // response can resolve after a newer one and overwrite good data with
  // whatever that older, possibly-incomplete fetch saw, which reads as
  // titles/rows randomly disappearing even though nothing actually changed
  // server-side. Same "cancelled" convention plan.js's SPC-detail effect
  // already uses, applied here to the whole multi-section load().
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const isStale = () => requestIdRef.current !== requestId;
    setGroupsLoading(true);
    const today = todayInBoise();

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
    try {
      const results = await retryOnce(async () => {
        const assignments = await listMyAssignments(profile.id);
        return Promise.all(
          assignments.map(async (assignment) => {
            const program = assignment.group_programs;
            try {
              const block = await getCurrentBlock(program.id, today);
              if (!block) return { groupProgramId: program.id, programName: program.name, status: "no_block" };

              const weekNumber = currentWeekNumber(block.block_start_date, program.block_length_weeks, today);
              const workouts = await listWorkoutsForWeek(block.id, weekNumber);
              const workoutIds = workouts.map((w) => w.id);
              const completedIds = await listGroupCompletionsForWorkouts(profile.id, workoutIds);

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
                  title: workout?.title || "Untitled session",
                  caption: formatSessionDays(program.session_days?.[sessionNumber - 1]),
                  dayName: firstDayName(program.session_days?.[sessionNumber - 1]),
                  completed: workout ? completedIds.has(workout.id) : false,
                  isToday: sessionNumber === todaysSessionNumber,
                };
              });

              return {
                groupProgramId: program.id,
                programName: program.name,
                status: "ready",
                weekNumber,
                blockLengthWeeks: program.block_length_weeks,
                sessionsPerWeek,
                rows,
              };
            } catch (err) {
              return { groupProgramId: program.id, programName: program.name, status: "error", message: err.message ?? String(err) };
            }
          })
        );
      });
      if (!isStale()) setGroups(results);
    } catch (err) {
      console.error("My Week: failed to load group programs", err);
      if (!isStale()) setGroups([{ status: "error", message: err.message ?? String(err) }]);
    } finally {
      if (!isStale()) setGroupsLoading(false);
    }

    try {
      const spcResult = await retryOnce(async () => {
        const spcClient = await getSpcClient(profile.id);
        if (!isSpcActive(spcClient)) return { status: "inactive" };

        const block = await getCurrentSpcBlock(profile.id, today);
        if (!block) return { status: "no_block" };

        const weekNumber = currentWeekNumber(block.block_start_date, block.block_length_weeks, today);
        const workouts = await listSpcWorkoutsForWeek(block.id, weekNumber);
        if (workouts.length === 0) return { status: "not_published" };

        const sessionsPerWeek = spcClient.sessions_per_week;
        const workoutIds = workouts.map((w) => w.id);
        const completedIds = await getCompletedSpcWorkoutIdsForWeek(profile.id, workoutIds, weekNumber);

        const rows = Array.from({ length: sessionsPerWeek }, (_, i) => i + 1).map((sessionNumber) => {
          const workout = workouts.find((w) => w.session_number === sessionNumber) ?? null;
          return {
            key: `spc-session-${sessionNumber}`,
            sessionNumber,
            workout,
            published: !!workout,
            label: `Session ${sessionNumber}`,
            title: workout?.title || "Untitled session",
            completed: workout ? completedIds.has(workout.id) : false,
          };
        });

        return { status: "ready", weekNumber, blockLengthWeeks: block.block_length_weeks, sessionsPerWeek, rows };
      });
      if (!isStale()) setSpc(spcResult.status === "inactive" ? null : spcResult);
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

    // Monday-Sunday of the current week, regardless of which day "today"
    // falls on — dayOfWeekInBoise is 0=Sunday..6=Saturday, so Sunday needs
    // its own offset (Monday was 6 days ago) rather than 1 - day.
    try {
      const result = await retryOnce(async () => {
        const nutritionClient = await getNutritionClient(profile.id);
        // Enrollment (any active row, approved or not) is tracked
        // separately from the strip — it gates the "not assigned to a
        // program" message below, which used to fire for nutrition-only
        // members.
        if (!isStale()) setNutritionEnrolled(nutritionClient?.status === "active");
        if (!nutritionClient || nutritionClient.status !== "active") return null;

        // Mid-onboarding (sent, not yet approved): My Week still shows a
        // normal-looking Nutrition card with an "Onboarding" button where
        // the day circles will eventually be.
        if (!nutritionClient.objective_tracking_approved_at) {
          return nutritionClient.onboarding_sent_at ? { status: "onboarding" } : null;
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
        return { status: "ready", days, elapsed, loggedCount };
      });
      if (!isStale()) setNutrition(result ?? null);
    } catch (err) {
      console.error("My Week: failed to load nutrition", err);
      if (!isStale()) setNutrition(null);
    }

    // One-offs load independently too — an away workout or trial session
    // assignment has nothing to do with group/SPC/nutrition, so its
    // failure shouldn't hide any of those sections.
    try {
      const workouts = await retryOnce(() => listWeekOneOffWorkoutsForUser(profile.id, today));
      if (!isStale()) {
        setOneOffs(
          workouts.map((w) => ({
            key: w.id,
            workoutId: w.id,
            label: w.title,
            completed: w.completed,
            // listWeekOneOffWorkoutsForUser already filters to status:
            // "published" — every row here is real and tappable, unlike a
            // group/SPC session slot which can legitimately be an
            // unpublished placeholder.
            published: true,
          }))
        );
      }
    } catch (err) {
      console.error("My Week: failed to load one-offs", err);
      if (!isStale()) setOneOffs([]);
    }

    // Admin-configurable kill switch/audience (lib/programming/
    // messagingSettings.js) — checked first since the icon itself and its
    // unread dot are both pointless to show/fetch when messaging's off for
    // this member. Own isolated fetch, defaults to hidden on failure.
    let messagingIsEnabled = false;
    try {
      messagingIsEnabled = await retryOnce(() => isMessagingEnabledForUser(profile.id));
      if (!isStale()) setMessagingEnabled(messagingIsEnabled);
    } catch (err) {
      console.error("My Week: failed to check messaging settings", err);
      if (!isStale()) setMessagingEnabled(false);
    }

    if (messagingIsEnabled) {
      try {
        const unread = await retryOnce(() => hasUnreadMessages(profile.id));
        if (!isStale()) setHasUnread(unread);
      } catch (err) {
        console.error("My Week: failed to check unread messages", err);
        if (!isStale()) setHasUnread(false);
      }
    } else if (!isStale()) {
      setHasUnread(false);
    }
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
      title: `${groupEntry.programName} — Week ${groupEntry.weekNumber}, ${row.label}`,
      subtitle: row.title !== "Untitled session" ? row.title : null,
      completed: row.completed,
      logParams: {
        session: "group",
        groupProgramId: groupEntry.groupProgramId,
        weekNumber: String(groupEntry.weekNumber),
        sessionNumber: String(row.sessionNumber),
      },
      warmups: [],
      exercises: [],
    });
    const [warmups, exercises] = await Promise.all([listWarmups(row.workout.id), listWorkoutExercises(row.workout.id)]);
    setPreview((p) => ({
      ...p,
      loading: false,
      warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
      exercises: exercises.map((ex) => ({
        id: ex.id,
        name: ex.exercises?.name,
        detail: `${ex.sets}×${ex.reps}${ex.tempo ? ` · ${ex.tempo}` : ""}`,
      })),
    }));
  };

  const openSpcPreview = async (spcEntry, row) => {
    if (!row.workout) return;
    setPreview({
      visible: true,
      loading: true,
      title: `SPC — ${row.label}`,
      subtitle: row.title !== "Untitled session" ? row.title : null,
      completed: row.completed,
      logParams: { session: "spc", weekNumber: String(spcEntry.weekNumber), sessionNumber: String(row.sessionNumber) },
      warmups: [],
      exercises: [],
    });
    const [warmups, exerciseRows] = await Promise.all([listSpcWarmups(row.workout.id), listSpcWorkoutExercises(row.workout.id)]);
    setPreview((p) => ({
      ...p,
      loading: false,
      warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
      exercises: exerciseRows.map((ex) => ({
        id: ex.id,
        name: ex.exercises?.name,
        detail: `${ex.sets ?? "–"}×${ex.reps ?? "–"}`,
      })),
    }));
  };

  const openOneOffPreview = async (item) => {
    setPreview({
      visible: true,
      loading: true,
      title: item.label,
      subtitle: null,
      completed: item.completed,
      logParams: { session: "one_off", oneOffWorkoutId: item.workoutId },
      warmups: [],
      exercises: [],
    });
    const [warmups, exercises] = await Promise.all([listOneOffWarmups(item.workoutId), listOneOffExercises(item.workoutId)]);
    setPreview((p) => ({
      ...p,
      loading: false,
      warmups: warmups.map((w) => w.exercises?.name ?? w.label).filter(Boolean),
      exercises: exercises.map((ex) => ({
        id: ex.id,
        name: ex.exercises?.name,
        detail: `${ex.sets}×${ex.reps}${ex.rest ? ` · rest ${ex.rest}` : ""}`,
      })),
    }));
  };

  const closePreview = () => setPreview((p) => (p ? { ...p, visible: false } : p));

  const handleLogPress = () => {
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

      <SessionPreviewModal
        visible={!!preview?.visible}
        onClose={closePreview}
        title={preview?.title}
        subtitle={preview?.subtitle}
        loading={preview?.loading}
        warmups={preview?.warmups}
        exercises={preview?.exercises}
        completed={preview?.completed}
        onLogPress={handleLogPress}
      />
    </ScrollView>
  );
}
