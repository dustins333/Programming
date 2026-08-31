import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Platform, Modal, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { PressFade } from "../PressFade";
import { Eyebrow } from "../Eyebrow";
import { getSpcSessionPreview } from "../../lib/programming/spcSessionPreview";
import { formatRest, schemeLabel } from "../../lib/programming/prescription";
import { warmupNumbersFor } from "../../lib/programming/sessionLabels";
import { formatDateShort } from "../../lib/formatDate";
import { currentWeekNumber } from "../../lib/programming/schedule";
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

// `client` is a getSpcRosterDetail row, so its derived state/label/tone are
// already computed — no lookup table needed here.
function StatusPill({ label, tone: toneKey }) {
  const tone = statusColors[toneKey] ?? statusColors.paused;
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 }}>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.1}
        style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.5, color: tone.text, textTransform: "uppercase" }}
      >
        {label}
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

// ONE client's block, as its own screen-filling column. Extracted from the
// modal so the review deck below can lay several of them side by side and let
// a coach swipe between clients — reviewing a staged group is four of these,
// not four separate openings.
function SpcSessionPreviewPage({
  client,
  onClose,
  // Off in the deck, where one shared bar closes the whole thing rather than
  // every page carrying its own.
  showClose = true,
  // Pin the page to ONE session and drop the session tabs with it. The deck
  // passes the session she is actually staged for: a staged group has already
  // decided what she is doing, so offering the week's other sessions there is
  // showing a choice that was made last night. The roster passes nothing and
  // keeps the tabs, because browsing IS what that screen is for.
  onlySessionNumber = null,
  // The date this will actually run, when that isn't today — a group staged
  // for tomorrow can sit the other side of a block week boundary.
  targetDate = null,
}) {
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
    setSessionNumber(null);
    setSelectedWeek(null);
    load();
  }, [load]);

  const session = useMemo(() => {
    if (!data?.sessions?.length) return null;
    // No fallback when pinned. Falling through to the first session would
    // quietly show a different workout than the one the card promised, which
    // is worse than saying it isn't there.
    if (onlySessionNumber != null) return data.sessions.find((s) => s.sessionNumber === onlySessionNumber) ?? null;
    return data.sessions.find((s) => s.sessionNumber === sessionNumber) ?? data.sessions[0];
  }, [data, sessionNumber, onlySessionNumber]);

  // Opens on the most recent week that actually has numbers in it — the
  // one a coach is about to program against. Resolved once, from whichever
  // session is shown first; after that the coach owns the selection.
  const week = useMemo(() => {
    if (!session) return null;
    if (selectedWeek != null) return selectedWeek;
    const logged = session.weekNumbers.filter((w) => session.lifts.some((l) => l.byWeek[w]?.logged));
    return logged.length ? Math.max(...logged) : (data?.currentWeek ?? session.weekNumbers[0]);
  }, [session, selectedWeek, data]);

  // The week this will actually RUN in: the staged morning when reviewing a
  // staged group, otherwise today. They differ across a Monday, which is
  // exactly the case staging exists for.
  const targetWeek = useMemo(() => {
    if (!data?.block?.block_start_date) return null;
    if (!targetDate) return data.currentWeek;
    return currentWeekNumber(data.block.block_start_date, data.blockLengthWeeks, targetDate);
  }, [data, targetDate]);

  // Null when it's published (or when there's nothing to say), otherwise the
  // week number that isn't.
  const unpublishedWeek = useMemo(() => {
    if (!session || targetWeek == null) return null;
    // A sessions-format run (0102) keeps ONE row per session and recurs it
    // every week, so that row's own flag answers for every week. Looking up
    // statusByWeek there finds nothing for anything past week 1 and reports a
    // published program as a draft — on exactly the week a group staged for
    // tomorrow runs in, which is what staging is for.
    const status = data?.sessionsFormat ? session.status : session.statusByWeek?.[targetWeek];
    return status === "published" ? null : targetWeek;
  }, [session, targetWeek, data]);

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
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: CARD_BORDER }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            {showClose ? (
              <PressFade onPress={onClose} hitSlop={10} style={{ paddingVertical: 2 }}>
                <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
                  ‹ SPC
                </Text>
              </PressFade>
            ) : (
              <View />
            )}
            {client?.label ? <StatusPill label={client.label} tone={client.tone} /> : null}
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

          {onlySessionNumber != null ? (
            <View style={{ marginTop: 10 }}>
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={1.15}
                style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.primaryOnWhite }}
              >
                {`Session ${onlySessionNumber}`}
                {session?.title ? (
                  <Text style={{ fontFamily: fonts.sans, color: colors.muted }}>{`  ${session.title}`}</Text>
                ) : null}
              </Text>
            </View>
          ) : data?.sessions?.length > 1 ? (
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
              {!data
                ? "No block yet — start one from the client page."
                : onlySessionNumber != null && data.sessions?.length
                  ? `Session ${onlySessionNumber} isn't published in this block's current week.`
                  : "This block has no sessions written yet."}
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
            {unpublishedWeek != null ? (
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
                  <Text style={{ fontFamily: fonts.sansBold }}>Week {unpublishedWeek} is a draft.</Text>
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

    </View>
  );
}

/* --------------------------------------------------------- modal wrappers */

// One client, from the roster. Unchanged behaviour — the page above is
// exactly what this used to render inline.
export function SpcSessionPreview({ client, visible, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
        {/* Keyed on the client so reopening on someone else re-reads rather
            than showing the last person's block for a beat. */}
        {visible ? <SpcSessionPreviewPage key={client?.userId ?? "none"} client={client} onClose={onClose} /> : null}
      </View>
    </Modal>
  );
}

// A staged or running group, one client per screen, swipe between them.
//
// This is the review Terra asked for and the thing a coach will open most:
// four blocks to read through before a 5am, in the order they'll be standing
// in the room. A vertical list of four of these would be a very long scroll
// with no sense of "next"; paging says how many are left without saying it.
//
// Each page loads its own client, so four opens four reads. That is the cost
// of showing real week-by-week history and it is bounded at four.
export function SpcSessionDeck({ visible, onClose, clients = [], initialIndex = 0, targetDate = null, label = "Reviewing" }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroller = useRef(null);
  const [index, setIndex] = useState(initialIndex);

  // Re-seeded on open rather than in useState, which only runs once — the
  // deck stays mounted between openings and would otherwise reopen on
  // whichever client was last viewed.
  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  // onScroll, NOT onMomentumScrollEnd: react-native-web never invokes the
  // latter — it is passed down as a prop that nothing on web emits — so a
  // real swipe moved the pages and left the header reading the client you had
  // just swiped away from. Rounding means the label flips at the halfway
  // point, which is where a pager should change over.
  const onScroll = (e) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (next !== index) setIndex(next);
  };

  const go = (delta) => {
    const next = Math.min(Math.max(index + delta, 0), clients.length - 1);
    if (next === index) return;
    setIndex(next);
    // NOT animated on web. `pagingEnabled` compiles to `scroll-snap-type: x
    // mandatory`, and a smooth programmatic scroll inside a snapping
    // container is silently cancelled — measured here: behavior:"smooth"
    // lands back at 0 while behavior:"auto" lands exactly on the page. The
    // arrows did nothing at all until this. Native has no snap CSS and
    // animates properly.
    scroller.current?.scrollTo({ x: next * width, animated: Platform.OS !== "web" });
  };

  const current = clients[index];

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
        {/* One shared bar: close, where you are, and arrows. The arrows earn
            their place next to the swipe — a coach holding a clipboard in the
            other hand is tapping, not swiping. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: 11,
            borderBottomWidth: 1,
            borderBottomColor: CARD_BORDER,
            backgroundColor: "#fff",
          }}
        >
          <PressFade onPress={onClose} hitSlop={10}>
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
              ‹ Done
            </Text>
          </PressFade>
          <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 0.8, color: colors.muted, textTransform: "uppercase" }}>
              {label}
            </Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: INK, marginTop: 1 }}>
              {clients.length > 0 ? `${index + 1} of ${clients.length}` : "Nobody staged"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <PressFade onPress={() => go(-1)} disabled={index === 0} hitSlop={6} style={{ padding: 4, opacity: index === 0 ? 0.3 : 1 }}>
              <Ionicons name="chevron-back" size={20} color={colors.primaryOnWhite} />
            </PressFade>
            <PressFade
              onPress={() => go(1)}
              disabled={index >= clients.length - 1}
              hitSlop={6}
              style={{ padding: 4, opacity: index >= clients.length - 1 ? 0.3 : 1 }}
            >
              <Ionicons name="chevron-forward" size={20} color={colors.primaryOnWhite} />
            </PressFade>
          </View>
        </View>

        {clients.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: colors.muted, textAlign: "center" }}>
              Nobody on this session yet.
            </Text>
          </View>
        ) : (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            style={{ flex: 1 }}
            // Both height rules are load-bearing. Without them a page sizes
            // to its own CONTENT inside the row, so the page's vertical
            // ScrollView ends up as tall as everything in it (measured:
            // clientHeight === scrollHeight === 1460) and can never scroll —
            // while the horizontal scroller's own overflow-y:hidden clips
            // whatever fell past the fold. Bounding the page is what gives
            // the inner scroller something to scroll inside.
            contentContainerStyle={{ height: "100%" }}
          >
            {clients.map((c) => (
              // Each page is exactly one viewport wide, which is what makes
              // pagingEnabled land on a client instead of between two.
              <View key={c.userId} style={{ width, height: "100%" }}>
                <SpcSessionPreviewPage
                  client={c}
                  onClose={onClose}
                  showClose={false}
                  onlySessionNumber={c.sessionNumber ?? null}
                  targetDate={targetDate}
                />
              </View>
            ))}
          </ScrollView>
        )}

        {/* Dots, so "three more to go" is legible without reading a number. */}
        {clients.length > 1 ? (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
              paddingTop: 10,
              paddingBottom: insets.bottom + 10,
              backgroundColor: "#fff",
              borderTopWidth: 1,
              borderTopColor: CARD_BORDER,
            }}
          >
            {clients.map((c, i) => (
              <View
                key={c.userId}
                style={{
                  width: i === index ? 20 : 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i === index ? colors.primary : "#ddd6cd",
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
