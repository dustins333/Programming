import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { todayInBoise, dayOfWeekInBoise } from "../../lib/boiseDate";
import { computeAttentionItems, filterDismissedItems } from "../../lib/programming/coachDashboard";
import { buildLaunchCards, decorateAttentionItems, filterAttentionByPermission, CARD_TONES } from "../../lib/programming/launchpad";
import { dismissAttentionItem } from "../../lib/programming/dashboardDismissals";
import { useCoachDashboard } from "../../lib/programming/useCoachDashboard";
import { listWarmups, listWorkoutExercises } from "../../lib/programming/workouts";
import { listSpcWarmups, listSpcWorkoutExercises } from "../../lib/programming/spcWorkouts";
import { SessionPreviewModal } from "../../components/SessionPreviewModal";
import { SessionsTodayModal } from "./SessionsTodayModal";
import { CoachShell } from "../../components/CoachShell";
import { PressFade } from "../../components/PressFade";
import { fonts, colors } from "../../lib/theme";
import { toastError } from "../../lib/toast";

// Coach web dashboard — the launchpad (design_handoff_coach_web_v2, 1a/2a/2b).
//
// This is not a report. The premise of the redesign is that a coach
// programs in the gaps between clients, so the page's job is to put them
// back inside whatever they were last in, then offer the small number of
// routes that are actually theirs, and only then say what needs them. The
// roster counts that used to open the page survive as one strip at the
// bottom — still clickable, no longer the headline.

const CANVAS = "#faf8f6";
const CARD_BORDER = "#ece7e1";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.045, shadowRadius: 14 };
const RESUME_BG = "#33251f";
const RESUME_INK = "#f7f3ee";
const RESUME_MUTED = "#beac95";
const MAX_WIDTH = 1240;

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function formatToday() {
  const today = todayInBoise();
  const [, month, day] = today.split("-").map(Number);
  return `${WEEKDAYS[dayOfWeekInBoise(today)]}, ${MONTHS[month - 1]} ${day}`;
}

// Boise-local hour, so the greeting matches the gym's clock rather than
// whatever timezone the coach's laptop is set to.
function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Boise", hour: "numeric", hour12: false }).format(new Date())
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function Eyebrow({ children, color = "#a8a29e", style }) {
  return (
    <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.4, color }, style]}>{children}</Text>
  );
}

function Dot({ tone }) {
  return <View style={{ width: 7, height: 7, borderRadius: 99, backgroundColor: CARD_TONES[tone] ?? CARD_TONES.ok }} />;
}

/* ---------------------------------------------------------------- resume */

function ResumeCard({ resume, router, onPreview }) {
  // Nothing to resume into is a real state, not an error — a coach who has
  // never opened the builder, or whose last edit predates the edit-tracking
  // migration. It still leads with a route rather than an apology.
  if (!resume) {
    return (
      <View style={{ backgroundColor: RESUME_BG, borderRadius: 20, padding: 24 }}>
        <Eyebrow color={RESUME_MUTED}>NOTHING OPEN RIGHT NOW</Eyebrow>
        <Text style={{ fontFamily: fonts.display, fontSize: 29, color: RESUME_INK, marginTop: 10, marginBottom: 6 }}>
          Start where the gaps are
        </Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "rgba(247,243,238,.6)", marginBottom: 18 }}>
          Once you open a session, it waits for you here.
        </Text>
        <PressFade
          onPress={() => router.push("/(coach)/blocks")}
          style={{ alignSelf: "flex-start", backgroundColor: RESUME_INK, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 20 }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: RESUME_BG }}>Open the grid</Text>
        </PressFade>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: RESUME_BG, borderRadius: 20, padding: 24, flexDirection: "row", gap: 26, overflow: "hidden" }}>
      {/* Soft highlight in the corner, purely decorative — same treatment
          the member app's hero bar uses. */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", right: -50, top: -60, width: 190, height: 190, borderRadius: 99, backgroundColor: "rgba(190,172,149,.11)" }}
      />

      <View style={{ flex: 1.15, minWidth: 0 }}>
        <Eyebrow color={RESUME_MUTED}>PICK UP WHERE YOU LEFT OFF</Eyebrow>
        <Text style={{ fontFamily: fonts.display, fontSize: 29, color: RESUME_INK, lineHeight: 32, marginTop: 10, marginBottom: 6 }}>
          {resume.title}
        </Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "rgba(247,243,238,.6)", marginBottom: 18 }}>
          {resume.detail}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <PressFade
            onPress={() => router.push(resume.primary.route)}
            style={{ backgroundColor: RESUME_INK, borderRadius: 9, paddingVertical: 11, paddingHorizontal: 20 }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: RESUME_BG }}>{resume.primary.label}</Text>
          </PressFade>
          {resume.secondary ? (
            <PressFade
              onPress={() => onPreview(resume.secondary)}
              style={{ borderWidth: 1, borderColor: "rgba(247,243,238,.28)", borderRadius: 9, paddingVertical: 11, paddingHorizontal: 16 }}
            >
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: RESUME_INK }}>{resume.secondary.label}</Text>
            </PressFade>
          ) : null}
        </View>
      </View>

      <View style={{ width: 1, backgroundColor: "rgba(247,243,238,.13)" }} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Eyebrow color={RESUME_MUTED}>{resume.queueTitle}</Eyebrow>
        <View style={{ marginTop: 11 }}>
          {resume.queue.length === 0 ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "rgba(247,243,238,.5)", paddingVertical: 9 }}>
              Nothing else outstanding here.
            </Text>
          ) : (
            resume.queue.map((item, i) => (
              <PressFade
                key={item.key}
                onPress={() => router.push(item.route)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 9,
                  borderBottomWidth: i === resume.queue.length - 1 ? 0 : 1,
                  borderBottomColor: "rgba(247,243,238,.09)",
                }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: RESUME_INK }} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "rgba(247,243,238,.5)" }}>{item.detail}</Text>
              </PressFade>
            ))
          )}
        </View>
        {resume.queueAction ? (
          <PressFade onPress={() => router.push(resume.queueAction.route)} style={{ marginTop: 11, alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: RESUME_MUTED }}>{resume.queueAction.label}</Text>
          </PressFade>
        ) : null}
      </View>
    </View>
  );
}

/* ----------------------------------------------------------- launch cards */

export // Column count is computed from the measured width rather than left to
// flex-wrap. A plain flexBasis can't win both ends of the range: whatever
// value fits four across on a 1280 laptop also fits three across in the
// drawer-width layout, stranding the fourth card alone on its own row.
// Four or two, never three-and-a-widow.
function launchColumns(windowWidth) {
  const content = windowWidth >= 768 ? windowWidth - 304 : windowWidth - 72;
  if (content >= 940) return 4;
  if (content >= 620) return 2;
  return 1;
}
const COLUMN_BASIS = { 4: "23%", 2: "48%", 1: "100%" };

function LaunchCard({ card, router, columns }) {
  return (
    <PressFade
      onPress={() => router.push(card.route)}
      style={{
        flexGrow: 1,
        flexBasis: COLUMN_BASIS[columns],
        // A coach with only two cards gets two normal-sized cards, not two
        // half-page slabs — the handoff caps them at 290 for exactly this.
        maxWidth: columns === 1 ? undefined : 330,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 16,
        paddingVertical: 17,
        paddingHorizontal: 18,
        ...CARD_SHADOW,
      }}
    >
      <Eyebrow>{card.eyebrow}</Eyebrow>
      <Text style={{ fontFamily: fonts.display, fontSize: 19, color: "#2a211c", lineHeight: 22, marginTop: 9, marginBottom: 8 }}>
        {card.title}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 14 }}>
        <Dot tone={card.tone} />
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", flex: 1 }} numberOfLines={2}>
          {card.status}
        </Text>
      </View>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>{card.action}</Text>
    </PressFade>
  );
}

/* -------------------------------------------------------------- needs you */

function NeedsYou({ items, router, onDismiss }) {
  return (
    <View
      style={{ flex: 1.55, minWidth: 420, backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 16, overflow: "hidden", ...CARD_SHADOW }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 15, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <Eyebrow>NEEDS YOU</Eyebrow>
          {items.length > 0 ? (
            <View style={{ backgroundColor: "#fdece5", borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#b23a22" }}>{items.length}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
          {items.length > 0 ? "Sorted by what breaks first" : ""}
        </Text>
      </View>

      {items.length === 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: "#f4f1ec", padding: 22 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>Nothing's on fire.</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 3 }}>
            Every program is published and every check-in is read.
          </Text>
        </View>
      ) : (
        items.map((item) => (
          <View
            key={item.key}
            style={{ borderTopWidth: 1, borderTopColor: "#f4f1ec", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 13 }}
          >
            <Dot tone={item.tone} />
            <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => router.push(item.route)}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c" }}>{item.title}</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 2 }}>{item.subtitle}</Text>
            </Pressable>
            <PressFade
              onPress={() => router.push(item.route)}
              style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 13 }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#44403c" }}>{item.verb}</Text>
            </PressFade>
            <Pressable onPress={() => onDismiss(item)} hitSlop={8} style={{ paddingHorizontal: 2 }}>
              <Text style={{ color: "#c9c4bd", fontSize: 15 }}>×</Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

/* ------------------------------------------------------------ today panel */

function TodayRow({ label, value, suffix, valueColor = "#2a211c", onPress }) {
  const Row = onPress ? PressFade : View;
  return (
    <Row
      {...(onPress ? { onPress, accessibilityLabel: `${label}: open details` } : {})}
      style={{
        borderTopWidth: 1,
        borderTopColor: "#f4f1ec",
        paddingHorizontal: 18,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#44403c" }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 19, color: valueColor }}>
          {value}
          {suffix ? <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: "#a8a29e" }}>{suffix}</Text> : null}
        </Text>
        {onPress ? <Ionicons name="chevron-forward" size={14} color="#c9c4bd" /> : null}
      </View>
    </Row>
  );
}

// A figure that failed to load shows an em-dash, never 0 — "0 sessions
// logged" is a number a coach would act on, and a broken query must not be
// able to say it.
const show = (n) => (n == null ? "—" : String(n));

function TodayPanel({ gym, nutritionOnly, onOpenSessions }) {
  const rows = nutritionOnly
    ? [
        { label: "Logged today", value: show(gym.nutrition?.logged), suffix: gym.nutrition ? ` / ${gym.nutrition.total}` : null },
        { label: "Check-ins waiting", value: show(gym.checkinsWaiting) },
        { label: "Quiet 7+ days", value: show(gym.quiet) },
        { label: "Unread messages", value: show(gym.unread) },
      ]
    : [
        { label: "Sessions logged", value: show(gym.sessions), onPress: onOpenSessions },
        { label: "Nutrition logged", value: show(gym.nutrition?.logged), suffix: gym.nutrition ? ` / ${gym.nutrition.total}` : null },
        { label: "New PRs", value: show(gym.prs), valueColor: "#4d6142" },
        { label: "Unread messages", value: show(gym.unread) },
      ];

  return (
    <View
      style={{ flex: 1, minWidth: 260, backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 16, overflow: "hidden", ...CARD_SHADOW }}
    >
      <View style={{ paddingHorizontal: 18, paddingTop: 15, paddingBottom: 12 }}>
        <Eyebrow>TODAY IN THE GYM</Eyebrow>
      </View>
      {rows.map((row) => (
        <TodayRow key={row.label} {...row} />
      ))}
    </View>
  );
}

/* ----------------------------------------------------------- roster strip */

function RosterChip({ label, value, accent, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        backgroundColor: accent ? "#fdf6f2" : "#fff",
        borderWidth: 1,
        borderColor: accent ? "#eddcd2" : CARD_BORDER,
        borderRadius: 99,
        paddingVertical: 6,
        paddingHorizontal: 14,
      }}
    >
      <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: accent ? colors.primaryOnWhite : "#44403c" }}>
        {label} <Text style={{ fontFamily: fonts.sansBold, color: accent ? colors.primaryOnWhite : "#2a211c" }}>{value}</Text>
      </Text>
    </PressFade>
  );
}

/* ------------------------------------------------------------------ page */

export function CoachHomeDesktop() {
  const router = useRouter();
  const [preview, setPreview] = useState(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const { width } = useWindowDimensions();
  const { profile, stats, extras, dismissals, setDismissals, loadError, reload: load } = useCoachDashboard();

  const openPreview = async ({ previewWorkoutId, previewKind }) => {
    setPreview({ loading: true, title: "Preview", warmups: [], exercises: [] });
    try {
      const [warmups, exercises] =
        previewKind === "spc"
          ? await Promise.all([listSpcWarmups(previewWorkoutId), listSpcWorkoutExercises(previewWorkoutId)])
          : await Promise.all([listWarmups(previewWorkoutId), listWorkoutExercises(previewWorkoutId)]);
      setPreview({
        loading: false,
        title: extras?.resume?.title ?? "Session preview",
        subtitle: "Exactly what the member sees",
        // SessionPreviewModal takes warmups as plain strings and exercises
        // as {id, name, detail} — the same shape the member Today screen
        // already feeds it, so this stays the one preview component.
        warmups: warmups.map((w) => w.exercises?.name ?? w.label ?? "Warm-up"),
        exercises: exercises.map((e) => ({
          id: e.id,
          name: e.exercises?.name ?? "Exercise",
          detail: [e.sets ? `${e.sets} ×` : null, e.reps].filter(Boolean).join(" "),
        })),
      });
    } catch (err) {
      setPreview(null);
      toastError("Couldn't load the preview", err);
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: CANVAS }}>
          <Text className="text-center" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
            Something went wrong loading your dashboard: {loadError}
          </Text>
          <Pressable onPress={load} style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

  if (!stats) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: CANVAS }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </CoachShell>
    );
  }

  const safeExtras = extras ?? { blocks: [], resume: null, gym: {}, coachCount: 0, payroll: null };
  const cards = buildLaunchCards({ profile, stats, extras: safeExtras });

  const attentionItems = decorateAttentionItems(
    filterAttentionByPermission(filterDismissedItems(computeAttentionItems(stats), dismissals, todayInBoise()), profile)
  );

  const isAdmin = profile?.role === "admin";
  // Same inference as launchpad.js's programsSessions() — no
  // can_view_programs flag exists, so "does no programming" is read off
  // the two programming-side flags that do (SPC, and library reviewing).
  const nutritionOnly =
    !isAdmin && Boolean(profile?.can_view_nutrition) && !profile?.can_view_spc && !profile?.can_view_exercise_library;

  const handleDismiss = (item) => {
    // Optimistic — the row goes immediately, the write follows. A failed
    // write just means the row is back on the next load, which is better
    // than the UI claiming a dismissal that didn't stick.
    setDismissals((prev) => ({ ...prev, [item.key]: { signature: item.signature, dismissedAt: new Date().toISOString() } }));
    dismissAttentionItem(item.key, item.signature, profile?.id).catch((err) => {
      console.error("Failed to dismiss attention item:", err);
    });
  };

  const goToClients = (programParam) =>
    router.push(programParam ? `/(coach)/clients?program=${programParam}` : "/(coach)/clients");

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerStyle={{ paddingHorizontal: 36, paddingVertical: 26 }}>
        <View style={{ maxWidth: MAX_WIDTH, width: "100%" }}>
          <Eyebrow style={{ marginBottom: 7 }}>{formatToday()}</Eyebrow>
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.primary, lineHeight: 34, marginBottom: 22 }}>
            {greeting()}, {profile?.name?.split(" ")[0] ?? "coach"}
          </Text>

          <ResumeCard resume={safeExtras.resume} router={router} onPreview={openPreview} />

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 16 }}>
            {cards.map((card) => (
              <LaunchCard key={card.key} card={card} router={router} columns={launchColumns(width)} />
            ))}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 16, alignItems: "flex-start" }}>
            <NeedsYou items={attentionItems} router={router} onDismiss={handleDismiss} />
            <TodayPanel
              gym={{ ...(safeExtras.gym ?? {}), checkinsWaiting: stats.checkinsToReview }}
              nutritionOnly={nutritionOnly}
              onOpenSessions={() => setSessionsOpen(true)}
            />
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 9, marginTop: 16 }}>
            <Eyebrow style={{ marginRight: 2 }}>ROSTER</Eyebrow>
            <RosterChip label="Total" value={stats.totalMembers} onPress={() => goToClients(null)} />
            {(stats.groupProgramCounts ?? []).map((p) => (
              <RosterChip key={p.id} label={p.name} value={p.count} onPress={() => goToClients(p.id)} />
            ))}
            <RosterChip label="SPC" value={stats.spcCount} onPress={() => goToClients("spc")} />
            <RosterChip label="Nutrition" value={stats.nutritionCount} onPress={() => goToClients("nutrition")} />
            {stats.unassignedCount > 0 ? (
              <RosterChip label="Unassigned" value={stats.unassignedCount} accent onPress={() => goToClients("unassigned")} />
            ) : null}
          </View>
        </View>

        <SessionPreviewModal
          visible={Boolean(preview)}
          onClose={() => setPreview(null)}
          loading={preview?.loading}
          title={preview?.title}
          subtitle={preview?.subtitle}
          warmups={preview?.warmups ?? []}
          exercises={preview?.exercises ?? []}
        />

        <SessionsTodayModal visible={sessionsOpen} onClose={() => setSessionsOpen(false)} />
      </ScrollView>
    </CoachShell>
  );
}
