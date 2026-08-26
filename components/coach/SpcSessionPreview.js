import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Platform, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PressFade } from "../PressFade";
import { Eyebrow } from "../Eyebrow";
import { getSpcSessionPreview } from "../../lib/programming/spcSessionPreview";
import { formatRest, schemeLabel } from "../../lib/programming/prescription";
import { warmupNumbersFor } from "../../lib/programming/sessionLabels";
import { STATUS_LABELS, STATUS_TONES } from "../../lib/programming/spcStatus";
import { formatDateShort } from "../../lib/formatDate";
import { currentWeekNumber } from "../../lib/programming/schedule";
import { formatTimeLabel } from "../../lib/dateTimeOptions";
import { fonts, colors, statusColors, type } from "../../lib/theme";

// The printed SPC sheet, on a phone (design_handoff_spc_roster_v1, screen 3).
//
// A coach standing on the gym floor wants the same thing the paper gives
// them: what's programmed, and what this client actually moved each week.
// The paper does it with a grid of week columns. A phone can't, so the week
// columns become a chip row under each lift, and ONE selected week drives
// every big number on the screen at once — tap W1 and the whole session
// reads as week 1 did.
//
// Deviation from the handoff, deliberate: eyebrows and the small captions
// sit at the app's 11px floor (lib/theme.js `type`) rather than the mock's
// 9.5–10px, and informational grey is `colors.muted` rather than #a8a29e.
// That floor exists because of a real "everything is too small" round of
// feedback, and a coach reading this in gym lighting has the same problem a
// member does. Proportions are otherwise as drawn.

const CARD_BORDER = "#ece7e1";
const ROW_DIVIDER = "#f4f1ec";
const TINT_BG = "#fdf6f2";
const TINT_BORDER = "#f0ddd2";
const TINT_EYEBROW = "#b08968";
const INK = "#2a211c";
const LOGGED_GREEN = "#4d6142";
const CHIP_SELECTED_BG = "#e3ead9";
const CHIP_EMPTY_BORDER = "#d6d1ca";
const STAGE_ESPRESSO = "#33251f";
const STAGE_ESPRESSO_TEXT = "#f7f3ee";
const STAGE_ESPRESSO_SUB = "#a89a92";

function firstNameOf(name) {
  return (name ?? "").trim().split(/\s+/)[0] || "";
}

/* ------------------------------------------------------------ header bits */

function StatusPill({ status }) {
  const tone = statusColors[STATUS_TONES[status]] ?? statusColors.paused;
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.5, color: tone.text, textTransform: "uppercase" }}
      >
        {STATUS_LABELS[status] ?? status}
      </Text>
    </View>
  );
}

function GoalBanner({ goal }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: TINT_BG,
        borderWidth: 1,
        borderColor: TINT_BORDER,
        borderRadius: 9,
        paddingVertical: 7,
        paddingHorizontal: 11,
      }}
    >
      <Ionicons name="flag-outline" size={12} color={colors.primaryOnWhite} />
      <Eyebrow color={TINT_EYEBROW} letterSpacing={0.8}>
        Goal
      </Eyebrow>
      <Text
        maxFontSizeMultiplier={1.15}
        style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: "#44403c" }}
      >
        {goal}
      </Text>
    </View>
  );
}

// One segment per session_number. Tapping switches which session is read;
// the selected week deliberately survives the switch, because "how did she
// do in week 2" is a question about the week, not the session.
function SessionTabs({ sessions, value, onChange }) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: "#efe9e2", borderRadius: 10, padding: 3, gap: 3 }}>
      {sessions.map((s) => {
        const active = s.sessionNumber === value;
        return (
          <PressFade
            key={s.sessionNumber}
            onPress={() => onChange(s.sessionNumber)}
            accessibilityLabel={`Session ${s.sessionNumber}`}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: active ? "#fff" : "transparent",
              ...(active && Platform.OS === "web" ? { boxShadow: "0 1px 3px rgba(42,33,28,0.12)" } : null),
              ...(active && Platform.OS !== "web"
                ? { shadowColor: "#2a211c", shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }
                : null),
            }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
              style={{
                fontFamily: active ? fonts.sansBold : fonts.sansSemiBold,
                fontSize: 12.5,
                color: active ? INK : "#78716c",
              }}
            >
              Session {s.sessionNumber}
            </Text>
          </PressFade>
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------------- body bits */

// The warm-up rows, numbered the shared way — superset members repeat their
// number rather than becoming 1a/1b (lib/programming/sessionLabels.js).
function WarmupCard({ warmups }) {
  const numbers = warmupNumbersFor(warmups);
  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 15,
      }}
    >
      <Eyebrow>Warm up</Eyebrow>
      <View style={{ marginTop: 8 }}>
        {warmups.map((w, i) => {
          // The row's own numbers first; a warm-up added before its library
          // entry had defaults falls back to those, same as the print sheet.
          const sets = w.sets ?? w.exercises?.default_sets ?? null;
          const reps = w.reps ?? w.exercises?.default_reps ?? null;
          const rx = sets && reps ? `${sets} × ${reps}` : (reps ?? sets ?? "");
          return (
            <View
              key={w.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 6,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: ROW_DIVIDER,
              }}
            >
              <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, color: colors.muted, width: 14 }}>
                {numbers[i]}
              </Text>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
                style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK }}
              >
                {w.exercises?.name ?? w.label ?? "Warm-up"}
              </Text>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
                style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}
              >
                {rx}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// One week's result for one lift. Logged chips are the week picker; an
// unlogged week has nothing to select, so it stays inert rather than
// offering a tap that shows an empty sheet.
function WeekChip({ weekNumber, isCurrent, result, selected, onPress }) {
  const logged = Boolean(result?.logged);
  const label = isCurrent ? "NOW" : `W${weekNumber}`;
  const value = logged
    ? [result.weight, result.reps].every((v) => v != null)
      ? `${result.weight} × ${result.reps}`
      : (result.weight ?? `${result.reps}`)
    : "—";

  const box = {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
  };
  // Green fill means "there are numbers here". A week can be selected on a
  // lift that wasn't logged that week — the picker is session-wide, so it
  // moves every card at once — and filling that chip green would claim data
  // this lift doesn't have. It keeps the green to say "this is the week
  // you're on" and stays dashed to say "and it's empty".
  const tone = selected
    ? logged
      ? { ...box, backgroundColor: CHIP_SELECTED_BG, borderColor: LOGGED_GREEN }
      : { ...box, backgroundColor: "transparent", borderColor: LOGGED_GREEN, borderStyle: "dashed" }
    : logged
      ? { ...box, backgroundColor: "#fff", borderColor: CARD_BORDER }
      : { ...box, backgroundColor: "transparent", borderColor: CHIP_EMPTY_BORDER, borderStyle: "dashed" };

  const content = (
    <>
      <Text
        maxFontSizeMultiplier={1}
        numberOfLines={1}
        style={{
          fontFamily: fonts.sansSemiBold,
          fontSize: 10,
          letterSpacing: 0.4,
          color: selected ? LOGGED_GREEN : colors.muted,
        }}
      >
        {label}
      </Text>
      <Text
        maxFontSizeMultiplier={1}
        numberOfLines={1}
        style={{
          marginTop: 1,
          fontFamily: selected ? fonts.sansBold : fonts.sansSemiBold,
          fontSize: 12.5,
          color: selected && logged ? LOGGED_GREEN : logged ? "#57534e" : colors.hint,
        }}
      >
        {value}
      </Text>
    </>
  );

  if (!logged) return <View style={tone}>{content}</View>;
  return (
    <PressFade onPress={onPress} accessibilityLabel={`Week ${weekNumber}: ${value}`} style={tone}>
      {content}
    </PressFade>
  );
}

function LiftCard({ lift, weekNumbers, currentWeek, selectedWeek, onSelectWeek }) {
  const result = lift.byWeek[selectedWeek] ?? null;
  const rx = [schemeLabel(lift.lift), lift.lift.rest ? `rest ${formatRest(lift.lift.rest)}` : null].filter(Boolean).join(" · ");

  return (
    <View
      style={{
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: CARD_BORDER,
        borderRadius: 12,
        paddingVertical: 13,
        paddingHorizontal: 14,
        marginTop: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 11 }}>
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            borderWidth: 1.5,
            borderColor: "#e0dbd4",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 12, color: colors.primaryOnWhite }}>
            {lift.label}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: INK }}>
            {lift.name}
          </Text>
          <Text maxFontSizeMultiplier={1.1} style={{ marginTop: 2, fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
            {rx}
          </Text>
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1}
            style={{ fontFamily: fonts.display, fontSize: 19, color: result?.logged ? LOGGED_GREEN : colors.hint }}
          >
            {result?.logged ? (result.weight ?? result.reps) : "—"}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sans, fontSize: type.eyebrow, color: colors.muted }}>
            {result?.logged
              ? `wk ${selectedWeek} · ${result.reps != null ? `${result.reps} reps` : "logged"}`
              : `wk ${selectedWeek} · not logged`}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 6, marginTop: 11 }}>
        {weekNumbers.map((w) => (
          <WeekChip
            key={w}
            weekNumber={w}
            isCurrent={w === currentWeek}
            result={lift.byWeek[w] ?? null}
            selected={w === selectedWeek}
            onPress={() => onSelectWeek(w)}
          />
        ))}
      </View>

      {result?.note ? (
        <View style={{ marginTop: 11, paddingTop: 9, borderTopWidth: 1, borderTopColor: ROW_DIVIDER }}>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 12, fontStyle: "italic", color: "#57534e" }}>
            “{result.note}”{" "}
            <Text style={{ fontStyle: "normal", color: colors.muted }}>
              — {firstNameOf(result.noteAuthor) || "client"}, wk {selectedWeek}
            </Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ sheet */

/* ------------------------------------------------------------ staging bar */

// Docked, not a button in the footer row: the footer scrolls away on a long
// session and this has to stay reachable wherever she has read to. Espresso
// so it reads as the same object as the roster's tray, which it is.
function StagingBar({ staging, sessionNumber, stagedSessionNumber, unpublishedWeek, onAdd, onRemove }) {
  const insets = useSafeAreaInsets();
  const count = staging?.clients?.length ?? 0;
  const stagedHere = stagedSessionNumber === sessionNumber;
  const stagedElsewhere = stagedSessionNumber != null && !stagedHere;
  const full = count >= 4 && stagedSessionNumber == null;

  const label = stagedHere
    ? `Session ${sessionNumber} staged`
    : stagedElsewhere
    ? `Session ${stagedSessionNumber} staged`
    : full
    ? "That's four already"
    : `${formatTimeLabel(staging?.scheduled_time)} · ${count} staged`;

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12, backgroundColor: colors.canvas }}>
      {/* Staging an unpublished week is allowed on purpose — a coach often
          stages the night before and publishes on the way out — but it is
          the single thing that makes the board refuse at 5am, so it is said
          here, on the staged card, and again on the wall before Start. */}
      {unpublishedWeek != null ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
            backgroundColor: "#fdf1e7",
            borderWidth: 1,
            borderColor: "#eed6bd",
            borderRadius: 10,
            paddingHorizontal: 11,
            paddingVertical: 8,
            marginBottom: 8,
          }}
        >
          <Ionicons name="alert-circle-outline" size={14} color="#8a5a2e" />
          <Text maxFontSizeMultiplier={1.15} style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 12, lineHeight: 16, color: "#8a5a2e" }}>
            {`Week ${unpublishedWeek} is still a draft — publish it or the board can't start her.`}
          </Text>
        </View>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: STAGE_ESPRESSO,
          borderRadius: 14,
          paddingVertical: 11,
          paddingHorizontal: 14,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            maxFontSizeMultiplier={1.1}
            style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 0.8, color: STAGE_ESPRESSO_SUB, textTransform: "uppercase" }}
          >
            {stagedHere ? "On this session" : "Adding to"}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ marginTop: 1, fontFamily: fonts.sansBold, fontSize: 14, color: STAGE_ESPRESSO_TEXT }}>
            {label}
          </Text>
        </View>

        {stagedHere ? (
          <PressFade
            onPress={onRemove}
            style={{ borderRadius: 999, borderWidth: 1, borderColor: "#5c4a41", paddingHorizontal: 16, paddingVertical: 9 }}
          >
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: STAGE_ESPRESSO_TEXT }}>
              Remove
            </Text>
          </PressFade>
        ) : (
          <PressFade
            onPress={onAdd}
            disabled={full}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              borderRadius: 999,
              backgroundColor: colors.primary,
              paddingHorizontal: 15,
              paddingVertical: 9,
              opacity: full ? 0.45 : 1,
            }}
          >
            <Ionicons name="add" size={15} color="#fff" />
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>
              {stagedElsewhere ? `Switch to ${sessionNumber}` : `Session ${sessionNumber}`}
            </Text>
          </PressFade>
        )}
      </View>
    </View>
  );
}

export function SpcSessionPreview({
  client,
  visible,
  onClose,
  // Staging (0090). Null unless the coach is mid-build on the roster; when
  // set, this sheet grows the one control that makes staging work — you pick
  // WHICH session here, so this is the only screen that can honestly say what
  // is being added.
  staging = null,
  stagedSessionNumber = null,
  onStage,
  onUnstage,
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // `ready` is separate from `data` because getSpcSessionPreview returns
  // null for a client with no block at all — testing `!data` alone spins
  // forever on exactly the clients whose row says "no block yet".
  const [data, setData] = useState(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [sessionNumber, setSessionNumber] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);

  const userId = client?.userId ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoadError(null);
    setData(null);
    setReady(false);
    try {
      setData(await getSpcSessionPreview(userId));
      setReady(true);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    if (!visible) return;
    setSessionNumber(null);
    setSelectedWeek(null);
    load();
  }, [visible, load]);

  const session = useMemo(() => {
    if (!data?.sessions?.length) return null;
    return data.sessions.find((s) => s.sessionNumber === sessionNumber) ?? data.sessions[0];
  }, [data, sessionNumber]);

  // Opens on the most recent week that actually has numbers in it — the
  // one a coach is about to program against. Resolved once, from whichever
  // session is shown first; after that the coach owns the selection.
  const week = useMemo(() => {
    if (!session) return null;
    if (selectedWeek != null) return selectedWeek;
    const logged = session.weekNumbers.filter((w) => session.lifts.some((l) => l.byWeek[w]?.logged));
    return logged.length ? Math.max(...logged) : (data?.currentWeek ?? session.weekNumbers[0]);
  }, [session, selectedWeek, data]);

  // The week this will actually RUN in: the staged morning when staging,
  // otherwise today. They differ across a Monday, which is exactly the case
  // staging exists for.
  const targetWeek = useMemo(() => {
    if (!data?.block?.block_start_date) return null;
    if (!staging?.scheduled_date) return data.currentWeek;
    return currentWeekNumber(data.block.block_start_date, data.blockLengthWeeks, staging.scheduled_date);
  }, [data, staging?.scheduled_date]);

  // Null when it's published (or when there's nothing to say), otherwise the
  // week number that isn't.
  const unpublishedWeek = useMemo(() => {
    if (!session || targetWeek == null) return null;
    return session.statusByWeek?.[targetWeek] === "published" ? null : targetWeek;
  }, [session, targetWeek]);

  const openPrint = () => {
    if (!data?.block || !session) return;
    window.open(`/spc/print/${data.block.id}?session=${session.sessionNumber}`, "_blank");
  };

  const openClientPage = () => {
    onClose();
    router.push(`/(coach)/spc/${userId}`);
  };

  const meta = data
    ? [
        data.blockLabel,
        `Week ${data.currentWeek} of ${data.blockLengthWeeks}`,
        data.block?.block_end_date ? `ends ${formatDateShort(data.block.block_end_date)}` : null,
        client?.coachName ? `Coach ${firstNameOf(client.coachName)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <PressFade onPress={onClose} hitSlop={10} style={{ paddingVertical: 2 }}>
              <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
                ‹ SPC
              </Text>
            </PressFade>
            {client?.status ? <StatusPill status={client.status} /> : null}
          </View>

          <Text numberOfLines={2} maxFontSizeMultiplier={1.1} style={{ marginTop: 6, fontFamily: fonts.display, fontSize: 24, color: INK }}>
            {client?.name ?? ""}
          </Text>

          {meta ? (
            <Text maxFontSizeMultiplier={1.15} style={{ marginTop: 2, fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
              {meta}
            </Text>
          ) : null}

          {data?.goal ? (
            <View style={{ marginTop: 10 }}>
              <GoalBanner goal={data.goal} />
            </View>
          ) : null}

          {data?.sessions?.length > 1 ? (
            <View style={{ marginTop: 12 }}>
              <SessionTabs sessions={data.sessions} value={session?.sessionNumber} onChange={setSessionNumber} />
            </View>
          ) : null}
        </View>

        {/* Body */}
        {loadError ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
            <Text style={{ fontFamily: fonts.sans, color: "#b23a22", textAlign: "center" }}>
              Something went wrong loading this session: {loadError}
            </Text>
            <PressFade onPress={load} style={{ marginTop: 12 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
            </PressFade>
          </View>
        ) : !ready ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !session ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: colors.muted, textAlign: "center" }}>
              {data ? "This block has no sessions written yet." : "No block yet — start one from the client page."}
            </Text>
            <PressFade
              onPress={openClientPage}
              style={{ marginTop: 14, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20 }}
            >
              <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>
                Open client page
              </Text>
            </PressFade>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 26 }}
          >
            {session.warmups.length > 0 ? <WarmupCard warmups={session.warmups} /> : null}

            <View style={{ marginTop: session.warmups.length > 0 ? 18 : 0 }}>
              <Eyebrow>
                Main session · Week {data.currentWeek} of {data.blockLengthWeeks}
              </Eyebrow>
            </View>

            {/* A sheet full of lifts that nobody can see. The status is per
                week, and this screen renders whichever week HAS lifts — so
                without saying it, a block whose current week is still a draft
                looks finished, and the first anyone hears of it is the wall
                refusing to start the session. */}
            {session.statusByWeek?.[data.currentWeek] && session.statusByWeek[data.currentWeek] !== "published" ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                  backgroundColor: "#fdf1e7",
                  borderWidth: 1,
                  borderColor: "#eed6bd",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                }}
              >
                <Ionicons name="eye-off-outline" size={14} color="#8a5a2e" />
                <Text maxFontSizeMultiplier={1.15} style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, color: "#8a5a2e" }}>
                  <Text style={{ fontFamily: fonts.sansBold }}>Week {data.currentWeek} is a draft.</Text>
                  {"  "}She can't see it and the board can't start it until it's published.
                </Text>
              </View>
            ) : null}

            {session.lifts.length === 0 ? (
              <Text style={{ marginTop: 10, fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>
                No lifts written for this session yet.
              </Text>
            ) : (
              session.lifts.map((lift) => (
                <LiftCard
                  key={lift.id}
                  lift={lift}
                  weekNumbers={session.weekNumbers}
                  currentWeek={data.currentWeek}
                  selectedWeek={week}
                  onSelectWeek={setSelectedWeek}
                />
              ))
            )}

            {client?.notesGoalsFeedback ? (
              <View
                style={{
                  marginTop: 18,
                  backgroundColor: TINT_BG,
                  borderWidth: 1,
                  borderColor: TINT_BORDER,
                  borderRadius: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 14,
                }}
              >
                <Eyebrow color={TINT_EYEBROW}>Coach notes</Eyebrow>
                <Text
                  maxFontSizeMultiplier={1.15}
                  style={{ marginTop: 6, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 19, color: "#44403c" }}
                >
                  {client.notesGoalsFeedback}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", gap: 9, marginTop: 18 }}>
              {/* The print sheet is a web-only route (it renders a real
                  landscape Letter page and opens the browser's print
                  dialog), so it's offered where it can actually work
                  rather than pushed to a route native has no file for. */}
              {Platform.OS === "web" ? (
                <PressFade
                  onPress={openPrint}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: "#d9d4cd",
                    borderRadius: 10,
                    paddingVertical: 12,
                  }}
                >
                  <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>
                    Print sheet
                  </Text>
                </PressFade>
              ) : null}
              <PressFade
                onPress={openClientPage}
                style={{
                  flex: 1,
                  alignItems: "center",
                  backgroundColor: colors.primary,
                  borderRadius: 10,
                  paddingVertical: 12,
                }}
              >
                <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>
                  Open client page
                </Text>
              </PressFade>
            </View>
          </ScrollView>
        )}

        {staging && session ? (
          <StagingBar
            staging={staging}
            sessionNumber={session.sessionNumber}
            stagedSessionNumber={stagedSessionNumber}
            unpublishedWeek={unpublishedWeek}
            onAdd={() => onStage?.(session.sessionNumber)}
            onRemove={() => onUnstage?.()}
          />
        ) : null}
      </View>
    </Modal>
  );
}
