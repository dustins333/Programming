import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Modal, ActivityIndicator, Switch, Platform, ScrollView, useWindowDimensions } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../../PressFade";
import { OptionPicker } from "../../OptionPicker";
import { ExercisePickerModal } from "../../ExercisePickerModal";
import { fonts, colors } from "../../../lib/theme";
import { addDays, mondayOnOrBefore, todayInBoise } from "../../../lib/boiseDate";
import {
  listSpcWorkoutsForBlock,
  createSpcBlock,
  publishSpcBlock,
  setSpcProgramEnd,
  addSpcSessionSlot,
  rescheduleSpcProgram,
  unpublishSpcProgram,
  publishReadySessions,
  deleteSpcBlock,
} from "../../../lib/programming/spcBlocks";
import {
  listSpcWorkoutExercises,
  addSpcWorkoutExercise,
  updateSpcWorkoutExercise,
  removeSpcWorkoutExercise,
  copySpcWorkoutContent,
  setSpcWorkoutStatus,
  listSpcWarmupsForWorkouts,
} from "../../../lib/programming/spcWorkouts";
import { listExercises } from "../../../lib/programming/exercises";
import { liftLabelsFor, warmupNumbersFor } from "../../../lib/programming/sessionLabels";
import { monthDay } from "../../../lib/programming/spcState";
import {
  confirmRemoveLift,
  confirmOpenLiveEditor,
  confirmDeleteDraftBlock,
  confirmCancelQueuedProgram,
} from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";
import { ProgramNotesRow } from "./ProgramNotes";

// The Sessions tab — the whole SPC programming workflow
// (design_handoff_spc_rework_v1, 1c/1d).
//
// LEFT (Current program): live to the member. Sets / reps / rest edit in
// place but commit ONLY through the Update bar — deliberate, no accidents
// (Terra's explicit call; the app autosaves everywhere else, this pane is
// the exception). RIGHT (Upcoming program): invisible to the member, built
// in the full session editor which autosaves, published with a start Monday
// + a length. On that date it becomes current and the old program closes
// into History.
//
// On a phone the two panes become two sub-tabs, Current / Upcoming, with a
// dot per tab (olive = live, grey = invisible).

const CARD_BORDER = colors.coachCardBorder;
const OLIVE = "#4d6142";
const OLIVE_BG = "#eef1e7";

// The floor a name keeps in a wrapping row: whatever sits beside it drops to
// the next line rather than eating into this. A name truncated to "Tricep
// Pushdown w/ro…" is fine, a name squeezed to nothing looks broken. 96 is
// deliberately tight — it is the point the row wraps at, not the width the
// name normally gets (it grows to fill whatever is spare), so a lower floor
// means a common 1400-1500px window keeps its rows on one line instead of
// doubling every card's height for names that were readable anyway.
const NAME_MIN = 96;

// The session header's floor is larger because "Session 2" already takes ~72
// of it before the coach's own title gets a pixel.
const TITLE_MIN = 170;

// Below this the two panes stop sitting side by side and become the
// Current / Upcoming sub-tabs the phone layout already uses. Measured from
// the page's own fixed chrome: sidebar 232 + page padding 52 + notes rail
// 280 + its 26 gap = 590, so a pane is (width - 616) / 2. At 1100 that is a
// ~242px pane, which is the point where even a wrapped row's controls start
// getting clipped; one full-width pane reads far better than two of those.
const SIDE_BY_SIDE_MIN = 1100;

function Eyebrow({ children, style }) {
  return (
    <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e" }, style]}>
      {children}
    </Text>
  );
}

function Badge({ label, live }) {
  return (
    <View
      style={{
        backgroundColor: live ? OLIVE_BG : "#f1efec",
        borderRadius: 99,
        paddingVertical: 3,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.8, color: live ? OLIVE : "#78716c" }}>
        {label}
      </Text>
    </View>
  );
}

function firstNameOf(name) {
  return (name ?? "").trim().split(/\s+/)[0] || "your client";
}

// "Mon Aug 3" — starts are always Mondays and ends Sundays by construction
// (0063's CHECK + setSpcProgramEnd), so the weekday prefix is static.
const monFmt = (iso) => `Mon ${monthDay(iso)}`;
const sunFmt = (iso) => `Sun ${monthDay(iso)}`;

/* ----------------------------------------------------------- data loading */

async function loadBlockSessions(block) {
  if (!block) return null;
  const workouts = await listSpcWorkoutsForBlock(block.id);
  const sorted = [...workouts].sort((a, b) => a.session_number - b.session_number);
  // Warm-ups batched for the whole block rather than one query per session
  // card, and isolated: a warm-up fetch that fails must not blank the lifts
  // it sits above, so it degrades to "no warm-up" instead.
  const warmupsByWorkout = await listSpcWarmupsForWorkouts(sorted.map((w) => w.id)).catch(() => new Map());
  const sessions = await Promise.all(
    sorted.map(async (workout) => ({
      workout,
      exercises: await listSpcWorkoutExercises(workout.id),
      warmups: warmupsByWorkout.get(workout.id) ?? [],
    }))
  );
  return sessions;
}

/* ------------------------------------------------------------ current pane */

function LiftRow({ label, row, draft, onDraft, onRemove, editable }) {
  const value = (field, fallback) => draft?.[field] ?? fallback ?? "";
  const inputStyle = {
    borderWidth: 1,
    borderColor: "#e2ddd6",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    color: "#2a211c",
    textAlign: "center",
    backgroundColor: "#fff",
  };
  const inSuperset = Boolean(row.superset_group_id);
  return (
    // Two groups, and the row WRAPS between them. The lift's name used to be
    // the only shrinkable thing in a row of fixed-width inputs, so a narrow
    // pane fed it whatever was left over — which at a ~1200px window is
    // nothing at all, and every name vanished while the boxes stayed put.
    // Now the name group holds a floor and the controls drop to a second
    // line instead, so the name is always readable and nothing is lost.
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderTopWidth: 1,
        borderTopColor: "#f4f1ec",
        borderLeftWidth: inSuperset ? 3 : 0,
        borderLeftColor: "#dbe8cf",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: NAME_MIN }}>
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 99,
            borderWidth: 1.5,
            borderColor: "#dcc9bf",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: colors.primaryOnWhite }}>{label}</Text>
        </View>
        <Text style={{ flex: 1, minWidth: 0, fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }} numberOfLines={1}>
          {row.exercises?.name ?? "Unknown lift"}
        </Text>
      </View>

      {/* marginLeft:auto keeps the numbers in the same right-hand column
          whether the controls sit beside the name or under it, so scanning a
          card's sets and reps still works straight down. */}
      {editable ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginLeft: "auto", flexShrink: 1, minWidth: 0 }}>
          <TextInput
            value={String(value("sets", row.sets))}
            onChangeText={(t) => onDraft(row.id, "sets", t)}
            keyboardType="number-pad"
            style={[inputStyle, { width: 44, minWidth: 34, flexShrink: 1 }]}
          />
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", flexShrink: 0 }}>×</Text>
          <TextInput
            value={String(value("reps", row.reps))}
            onChangeText={(t) => onDraft(row.id, "reps", t)}
            style={[inputStyle, { width: 72, minWidth: 48, flexShrink: 1 }]}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", flexShrink: 0 }}>rest</Text>
            <TextInput
              value={String(value("rest", row.rest ?? ""))}
              onChangeText={(t) => onDraft(row.id, "rest", t)}
              placeholder="—"
              placeholderTextColor="#c9c4bd"
              style={[inputStyle, { width: 58, minWidth: 40, flexShrink: 1 }]}
            />
          </View>
          <PressFade onPress={() => onRemove(row)} hitSlop={8} accessibilityLabel={`Remove ${row.exercises?.name}`}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: "#c9c4bd" }}>×</Text>
          </PressFade>
        </View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginLeft: "auto", flexShrink: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#57534e" }}>
            {row.sets} × {row.reps}
          </Text>
          {inSuperset ? <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#c58a3a" }}>superset</Text> : null}
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", width: 44, textAlign: "right" }}>
            {row.rest ?? ""}
          </Text>
        </View>
      )}
    </View>
  );
}

// The warm-up, collapsed by default — the same "Warm-up · N moves" + chevron
// row the member's own session page uses (app/(member)/plan.js's WarmupCard),
// so the two surfaces read the same way. Not a nested card: it's a section
// inside the session card it belongs to, sitting above the lifts exactly
// where it does in the session itself.
//
// Read-only on purpose. Warm-ups are built in the full session editor, the
// same place their supersets and ordering live; a second, thinner editor here
// would be a second definition of how a warm-up gets written.
function WarmupStrip({ warmups }) {
  const [open, setOpen] = useState(false);
  if (!warmups?.length) return null;
  const numbers = warmupNumbersFor(warmups);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: "#f4f1ec" }}>
      <PressFade
        onPress={() => setOpen((o) => !o)}
        accessibilityLabel={open ? "Hide the warm-up" : "Show the warm-up"}
        style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 11, paddingHorizontal: 14 }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#57534e" }}>Warm-up</Text>
        <Text style={{ flex: 1, minWidth: 0, fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
          {warmups.length} move{warmups.length === 1 ? "" : "s"}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color="#c9c4bd" />
      </PressFade>
      {open
        ? warmups.map((w, i) => {
            // The row's own numbers first, then the library defaults — a
            // warm-up added before its exercise had defaults still prints a
            // prescription, same fallback the print sheet uses.
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
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderTopWidth: 1,
                  borderTopColor: "#f8f5f1",
                }}
              >
                {/* Superset members repeat their number rather than becoming
                    1a/1b — the shared warm-up numbering (sessionLabels.js). */}
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: "#c9c4bd", width: 16 }}>{numbers[i]}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e" }}>
                    {w.exercises?.name ?? w.label ?? "Warm-up"}
                  </Text>
                  {w.notes ? (
                    <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", fontStyle: "italic", marginTop: 1 }}>
                      {w.notes}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>{rx}</Text>
              </View>
            );
          })
        : null}
    </View>
  );
}

function SessionCard({ session, labels, drafts, onDraft, onRemove, onAddLift, onOpenEditor, clientFirst, editable, showEditor = true }) {
  const { workout, exercises } = session;
  const empty = exercises.length === 0;
  return (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, marginTop: 14, overflow: "hidden" }}>
      {/* Same wrap as a lift row: "Session 2 · Upper" keeps its floor and the
          actions drop underneath rather than squeezing the title away. */}
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, paddingVertical: 12, paddingHorizontal: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: TITLE_MIN }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#2a211c", flexShrink: 0 }}>
            Session {workout.session_number}
          </Text>
          {workout.title ? (
            <Text style={{ flex: 1, minWidth: 0, fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }} numberOfLines={1}>
              {workout.title}
            </Text>
          ) : null}
        </View>
        {/* One button, top right: the way into the full editor. Adding an
            exercise moved to the foot of the card, where the list it appends
            to actually ends.
            Desktop only — the drag-ordered builder is a build surface and
            doesn't hold up on a phone, same call as every other builder in
            this app. Adding, removing and editing a lift stay on the card at
            both widths, so a phone keeps everything but the restructure. */}
        {showEditor ? (
        <PressFade onPress={() => onOpenEditor(session)} hitSlop={8} style={{ marginLeft: "auto" }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "#dcc9bf",
              backgroundColor: "#fdf6f2",
            }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>
              {editable ? "Full editor" : "Edit"}
            </Text>
            <Ionicons name="chevron-forward" size={12} color={colors.primaryOnWhite} />
          </View>
        </PressFade>
        ) : null}
      </View>

      <WarmupStrip warmups={session.warmups} />

      {empty ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
            Nothing in it yet. Hidden from {clientFirst} until it has exercises.
          </Text>
        </View>
      ) : (
        exercises.map((row) => (
          <LiftRow
            key={row.id}
            label={labels[row.id]}
            row={row}
            draft={drafts?.[row.id]}
            onDraft={onDraft}
            onRemove={onRemove}
            editable={editable}
          />
        ))
      )}

      {editable ? (
        // The row's padding belongs to the pressable, not the strip around it,
        // so the whole right-hand corner is tappable rather than just the
        // 15px of text.
        <View style={{ alignItems: "flex-end", borderTopWidth: 1, borderTopColor: "#f4f1ec" }}>
          <PressFade onPress={() => onAddLift(session)} hitSlop={8} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>+ Add exercise</Text>
          </PressFade>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ dates panel */

// Every Sunday this program could legally end on, newest constraint first:
//  - never before the week in progress finishes, so she can't lose a week she
//    is training in right now (a not-yet-started program's floor is its own
//    first Sunday instead);
//  - never on or after a program already queued behind it, which
//    setSpcProgramEnd would reject as an overlap anyway — better not to offer
//    the date than to explain the error afterwards.
// The stored end joins the list whatever it is, so the box can always show the
// truth rather than snapping to something it isn't.
export function endDateOptions({ startDate, currentEnd, today, nextStart }) {
  const firstSunday = addDays(startDate, 6);
  const thisSunday = addDays(mondayOnOrBefore(today), 6);
  const earliest = firstSunday > thisSunday ? firstSunday : thisSunday;
  // Twelve Sundays from the soonest legal one, matching the publish dropdown's
  // range. Anything longer is what Ongoing is for. Measured from `earliest`
  // rather than from the start, so a program that has already been running for
  // months still offers twelve real dates ahead of it.
  const horizon = addDays(earliest, 11 * 7);
  const hardCap = nextStart ? addDays(nextStart, -1) : null;
  const cap = hardCap && hardCap < horizon ? hardCap : horizon;
  const dates = [];
  for (let d = earliest; d <= cap; d = addDays(d, 7)) dates.push(d);
  if (currentEnd && !dates.includes(currentEnd)) {
    dates.push(currentEnd);
    dates.sort();
  }
  return dates.map((d) => {
    const days = Math.round((new Date(`${d}T12:00:00`) - new Date(`${startDate}T12:00:00`)) / 86400000) + 1;
    const weeks = Math.max(1, Math.ceil(days / 7));
    // `short` is what the closed field shows, so it reads exactly like the
    // start beside it; the length only appears in the open list, where it is
    // the thing you are actually choosing between.
    return { value: d, weeks, short: sunFmt(d), label: `${sunFmt(d)} · ${weeks} ${weeks === 1 ? "week" : "weeks"}` };
  });
}

// Opened by the ENDS box, which is the only thing that changes an end date by
// hand. It offers every legal Sunday in both directions rather than only
// earlier ones: the box is a neutral field, not a button whose name promises
// a direction. Picking IS the confirmation — every row states the length it
// leaves, the header says what does and doesn't change, and nothing is deleted
// either way (a sessions-format program has one row per session for the whole
// run, 0105), so a dialog on top would be friction.
function EndDateModal({ visible, onClose, options, currentEnd, onPick }) {
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <PressFade onPress={onClose} pressedOpacity={1} style={{ flex: 1, backgroundColor: "rgba(42,33,28,0.4)", alignItems: "center", justifyContent: "center", padding: 22 }}>
        <PressFade onPress={() => {}} pressedOpacity={1} style={{ width: "100%", maxWidth: 380, backgroundColor: "#fff", borderRadius: 16, padding: 18, maxHeight: "80%" }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#2a211c" }}>When should it end?</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 5 }}>
            Her sessions and everything she's logged stay as they are. She'll be due a new program the Monday after.
          </Text>
          <ScrollView style={{ marginTop: 14 }} showsVerticalScrollIndicator={false}>
            {options.map((o) => (
              <PressFade
                key={o.value}
                onPress={() => onPick(o.value)}
                style={{
                  borderWidth: o.value === currentEnd ? 1.5 : 1,
                  borderColor: o.value === currentEnd ? colors.primary : "#e3d5cb",
                  backgroundColor: o.value === currentEnd ? "#fdf6f2" : "#fff",
                  borderRadius: 10,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  marginBottom: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: o.value === currentEnd ? colors.primaryOnWhite : "#2a211c" }}>{o.short}</Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
                  {o.weeks} {o.weeks === 1 ? "week" : "weeks"} total
                </Text>
              </PressFade>
            ))}
          </ScrollView>
          <PressFade onPress={onClose} style={{ alignSelf: "flex-end", paddingVertical: 10, paddingHorizontal: 6, marginTop: 4 }}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: "#78716c" }}>Cancel</Text>
          </PressFade>
        </PressFade>
      </PressFade>
    </Modal>
  );
}

// The program's own dates, deliberately NOT dressed as a session card: it is
// chrome for the whole run, and reading as one more white card next to the
// sessions is what made the old flex-wrap band look slapped together. Both
// dates are plain read-outs; the two buttons under them are what change one.
function ProgramDatesPanel({ block, lapsed, nextStart, today, busy, onSetEnd, onAddWeek, onOngoing }) {
  const ongoing = !block.block_end_date;
  const [endOpen, setEndOpen] = useState(false);
  const options = useMemo(
    () => endDateOptions({ startDate: block.block_start_date, currentEnd: block.block_end_date, today, nextStart }),
    [block.block_start_date, block.block_end_date, today, nextStart]
  );
  const fieldBox = {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e3d5cb",
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 11,
    justifyContent: "center",
    minHeight: 38,
  };
  // White means "you can tap this" — so the one box that does nothing is
  // washed back toward the panel, and only ENDS reads as a control.
  const readOnlyBox = { ...fieldBox, backgroundColor: "#f6f1ec", borderColor: "#e8ddd4" };
  const action = {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#dcc9bf",
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  };
  const dateText = { fontFamily: fonts.sansBold, fontSize: 13.5, color: "#2a211c" };

  return (
    <View
      style={{
        backgroundColor: lapsed ? "#fdf8ec" : "#fdf6f2",
        borderWidth: 1,
        borderColor: lapsed ? "#ecd9ab" : "#f0ddd2",
        borderRadius: 14,
        padding: 14,
        marginTop: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Eyebrow>PROGRAM DATES</Eyebrow>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Switch
            value={ongoing}
            onValueChange={onOngoing}
            disabled={busy}
            trackColor={{ true: colors.primary, false: "#d9d4cd" }}
            thumbColor="#fff"
            {...(Platform.OS === "web" ? { activeThumbColor: "#fff" } : {})}
          />
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#57534e" }}>Ongoing</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 132 }}>
          <Eyebrow style={{ marginBottom: 5 }}>STARTS</Eyebrow>
          {/* Read-only on purpose: moving the start of a program she is
              already training in is a different, riskier action, and the
              reschedule modal already owns it for one that hasn't begun. */}
          <View style={readOnlyBox}>
            <Text style={dateText}>{monFmt(block.block_start_date)}</Text>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 132 }}>
          <Eyebrow style={{ marginBottom: 5 }}>ENDS</Eyebrow>
          {/* Shows just the date, exactly like the start beside it, and opens
              the list where the length each date would make is the thing you
              are choosing between. A <select> could not do both: what it shows
              closed is whatever the selected option's text is, so a list
              useful enough to pick from made the two boxes read as different
              kinds of thing. Ongoing opens it too — that is how an ongoing
              program gets an end date you actually choose, where the toggle
              only restores whatever length it was stored with. */}
          <PressFade onPress={() => setEndOpen(true)} disabled={busy}>
            <View style={{ ...fieldBox, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, opacity: busy ? 0.5 : 1 }}>
              <Text numberOfLines={1} style={ongoing ? { ...dateText, color: "#78716c" } : dateText}>
                {ongoing ? "No end date" : sunFmt(block.block_end_date)}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#a8a29e" />
            </View>
          </PressFade>
          {ongoing ? null : (
            <PressFade onPress={onAddWeek} disabled={busy} style={{ ...action, alignSelf: "flex-start", marginTop: 8, opacity: busy ? 0.5 : 1 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>+ Add a week</Text>
            </PressFade>
          )}
        </View>
      </View>

      <EndDateModal
        visible={endOpen}
        options={options}
        currentEnd={block.block_end_date}
        onClose={() => setEndOpen(false)}
        onPick={(d) => {
          setEndOpen(false);
          onSetEnd(d);
        }}
      />
    </View>
  );
}

/* ---------------------------------------------------------- publish modal */

// The dropdown's full range. The chips below it are shortcuts into this same
// value, not a separate control, so the two can never disagree about what is
// selected. Values are STRINGS because react-native-web's <select> hands back
// e.target.value — passing numbers would give the web build "6" where native
// gave 6.
const WEEK_CHOICES = Array.from({ length: 12 }, (_, i) => i + 1);

// A block can be longer than 12 weeks (a rolling one grows a week at a time),
// so its own length joins the list rather than being clamped away — clamping
// would silently shorten it to the default the moment its dates were changed.
function weekOptions(currentWeeks) {
  const weeks = [...WEEK_CHOICES];
  if (Number.isInteger(currentWeeks) && currentWeeks > 0 && !weeks.includes(currentWeeks)) {
    weeks.push(currentWeeks);
    weeks.sort((a, b) => a - b);
  }
  return [
    ...weeks.map((w) => ({ value: String(w), label: `${w} ${w === 1 ? "week" : "weeks"}` })),
    { value: "ongoing", label: "Ongoing (no end date)" },
  ];
}

// Does double duty: publishing a draft, and changing the dates of one already
// published for a future Monday. Same question either way — which Monday, how
// long, and what that does to whatever is running — so a second modal would
// only be a second place for those rules to drift.
export function PublishProgramModal({ visible, onClose, current, spcClient, onPublish, busy, mode = "publish", block = null }) {
  const rescheduling = mode === "reschedule";
  const today = todayInBoise();
  const thisMonday = mondayOnOrBefore(today);
  const nextMonday = addDays(thisMonday, 7);
  // Terra's three (2026-08-30 follow-up): now / next Monday / in 2 weeks.
  // "Now" is this week's Monday — live to her the moment it publishes — so a
  // client whose program runs out Friday can walk in Monday with a new one.
  //
  // When rescheduling, the Monday it is CURRENTLY set to joins the list if it
  // isn't already one of the three: a program queued a month out would
  // otherwise offer no way back to where it started after a stray tap.
  const options = useMemo(() => {
    const base = [
      { date: thisMonday, note: "now", now: true },
      { date: nextMonday, note: "next Monday" },
      { date: addDays(nextMonday, 7), note: "in 2 weeks" },
    ];
    const scheduled = rescheduling ? block?.block_start_date : null;
    if (scheduled && !base.some((o) => o.date === scheduled)) {
      base.push({ date: scheduled, note: "where it is now" });
      base.sort((a, b) => (a.date < b.date ? -1 : 1));
    }
    return base;
  }, [thisMonday, nextMonday, rescheduling, block?.block_start_date]);

  const [startDate, setStartDate] = useState(null);
  const [weeks, setWeeks] = useState(null);
  useEffect(() => {
    if (!visible) return;
    if (rescheduling && block) {
      // Seeded from where it actually is, so the modal opens showing the
      // truth and any change is a deliberate one.
      setStartDate(block.block_start_date);
      // Its real length, whatever it is — the dropdown can hold any of them.
      // Seeding to a nearby quick pick would have quietly RESHAPED a 3-week
      // program into a 6-week one on save.
      setWeeks(block.block_end_date == null ? "ongoing" : block.block_length_weeks || 6);
      return;
    }
    // No current program → default to Now, so publishing visibly takes
    // effect instead of sitting queued until Monday looking unpublished
    // (Terra's item 4). With one running, next Monday is the safer default
    // and Now is one tap away.
    setStartDate(current ? nextMonday : thisMonday);
    setWeeks(current?.block_length_weeks || 6);
    // Derived values are stable while the modal is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;
  const ongoing = weeks === "ongoing";
  const endDate = startDate && !ongoing ? addDays(startDate, weeks * 7 - 1) : null;
  const shortens = Boolean(
    current && current.block_start_date < startDate && (current.block_end_date == null || current.block_end_date >= startDate)
  );
  const replaces = Boolean(current && current.block_start_date >= startDate);

  const chip = (active) => ({
    borderWidth: 1.5,
    borderColor: active ? colors.primary : "#e2ddd6",
    backgroundColor: active ? "#fdf6f2" : "#fff",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 13,
  });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <PressFade onPress={onClose} pressedOpacity={1} style={{ flex: 1, backgroundColor: "rgba(42,33,28,0.4)", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <PressFade onPress={() => {}} pressedOpacity={1} style={{ width: "100%", maxWidth: 480, backgroundColor: "#fff", borderRadius: 16, padding: 22 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, color: "#2a211c" }}>
            {rescheduling ? "Change when this program runs" : "Publish this program"}
          </Text>

          <Eyebrow style={{ marginTop: 18, marginBottom: 8 }}>STARTS MONDAY</Eyebrow>
          <View style={{ gap: 8 }}>
            {options.map((o) => (
              <PressFade key={o.date} onPress={() => setStartDate(o.date)} style={chip(startDate === o.date)}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>
                  {monthDay(o.date)} <Text style={{ fontFamily: fonts.sans, color: "#78716c" }}>· {o.note}</Text>
                </Text>
              </PressFade>
            ))}
          </View>

          {/* The dropdown carries the whole range and always reads the
              current value, so it doubles as the read-out for the chips
              beside it — tapping 5 makes it say "5 weeks", and picking 3
              lights no chip. One value, two ways in. */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 18, marginBottom: 8 }}>
            <Eyebrow>HOW MANY WEEKS</Eyebrow>
            <View style={{ width: 148 }}>
              <OptionPicker
                options={weekOptions(rescheduling ? block?.block_length_weeks : current?.block_length_weeks)}
                value={ongoing ? "ongoing" : String(weeks ?? "")}
                onChange={(v) => setWeeks(v === "ongoing" ? "ongoing" : Number(v))}
              />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* PressFade needs a plain object style, never an array — it
                spreads the style it's handed (see the v5 pass's Pressable
                lesson), and a spread array becomes indexed keys that crash
                RNW's CSSStyleDeclaration. "∞" publishes an Ongoing program
                (0103): no end date, never turns Due soon, the rolling
                replacement. */}
            {[4, 5, 6, 8, "ongoing"].map((w) => (
              <PressFade key={w} onPress={() => setWeeks(w)} style={{ ...chip(weeks === w), flex: 1, alignItems: "center" }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: weeks === w ? colors.primaryOnWhite : "#57534e" }}>
                  {w === "ongoing" ? "∞" : w}
                </Text>
              </PressFade>
            ))}
          </View>
          {ongoing ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c", marginTop: 6 }}>
              Ongoing: no end date, runs until you set one. Never turns Due soon.
            </Text>
          ) : null}

          <View style={{ backgroundColor: "#faf8f6", borderRadius: 10, padding: 13, marginTop: 18 }}>
            <Eyebrow style={{ marginBottom: 5 }}>{rescheduling ? "THIS PROGRAM" : "NEW PROGRAM"}</Eyebrow>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#2a211c" }}>
              {startDate
                ? ongoing
                  ? `Starts ${monthDay(startDate)} · ongoing`
                  : `${monthDay(startDate)} – ${monthDay(endDate)} · ${weeks} ${weeks === 1 ? "week" : "weeks"}`
                : ""}
            </Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginTop: 4 }}>
              {replaces
                ? `Replaces the program that started ${monthDay(current.block_start_date)}. It goes back to your build space as a draft, and her logged lifts keep their history.`
                : shortens
                  ? `Her current program is shortened to end ${sunFmt(addDays(startDate, -1))}. Everything she's logged keeps its history.`
                  : current?.block_end_date && startDate > current.block_end_date
                    ? `Her current program stays live until ${sunFmt(current.block_end_date)} and closes into History on ${monthDay(startDate)}.`
                    : startDate === thisMonday
                      ? rescheduling
                        ? "It goes live to her as soon as you save."
                        : "It goes live to her the moment you publish."
                      : "It goes live to her that Monday."}
            </Text>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <PressFade onPress={onClose} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: "#78716c" }}>Cancel</Text>
            </PressFade>
            <PressFade
              onPress={() => onPublish(startDate, ongoing ? { ongoing: true } : { lengthWeeks: weeks })}
              disabled={busy || !startDate}
              style={{ backgroundColor: "#33251f", borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18, opacity: busy || !startDate ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#f7f3ee" }}>
                {busy
                  ? rescheduling
                    ? "Saving…"
                    : "Publishing…"
                  : rescheduling
                    ? startDate === thisMonday
                      ? "Save · live now"
                      : `Save · starts ${startDate ? monthDay(startDate) : ""}`
                    : startDate === thisMonday
                      ? "Publish · live now"
                      : `Publish · starts ${startDate ? monthDay(startDate) : ""}`}
              </Text>
            </PressFade>
          </View>
        </PressFade>
      </PressFade>
    </Modal>
  );
}

/* ------------------------------------------------- queued program controls */

// A published program that hasn't reached its Monday yet, and what can still
// be done to it. Lives wherever that program is showing: normally the Upcoming
// pane, but in Current when it is the only program she has — a client waiting
// on her next program is not a client with no program, and putting a blank
// "No current program" in front of the coach made 33 of them read as due when
// the work was already done.
//
// Everything here is safe because she cannot see the program at all until it
// starts (0102 gates her reads on block_start_date <= today), so nothing she
// has already seen changes.
function QueuedProgramStrip({ block, clientFirst, busy, onReschedule, onCancel }) {
  return (
    <View style={{ backgroundColor: "#eef1e7", borderRadius: 10, padding: 12 }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#4d6142" }}>
        ✓ Published · goes live to {clientFirst} {monFmt(block.block_start_date)}
      </Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#57534e", marginTop: 2 }}>
        {block.block_end_date == null
          ? "Ongoing, no end date. Edits keep flowing into it until then."
          : `Runs to ${sunFmt(block.block_end_date)}. Edits keep flowing into it until then.`}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        <PressFade onPress={onReschedule} disabled={busy} hitSlop={6}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#4d6142", opacity: busy ? 0.5 : 1 }}>
            Change dates
          </Text>
        </PressFade>
        <PressFade onPress={onCancel} disabled={busy} hitSlop={6}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#b23a22", opacity: busy ? 0.5 : 1 }}>
            Cancel program
          </Text>
        </PressFade>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- main tab */

export function SpcSessionsTab({ userId, member, spcClient, coachId, current, currentNotStarted = false, upcoming, onChanged, isDesktop }) {
  const router = useRouter();
  const today = todayInBoise();
  const clientFirst = firstNameOf(member?.name);
  // The page is desktop from 768 up, but two programming panes need far more
  // room than that. Below SIDE_BY_SIDE_MIN this tab falls back to the same
  // Current / Upcoming sub-tabs the phone uses, so the pane you are actually
  // working in gets the whole column.
  const { width } = useWindowDimensions();
  const sideBySide = isDesktop && width >= SIDE_BY_SIDE_MIN;

  const [currentSessions, setCurrentSessions] = useState(null);
  const [upcomingSessions, setUpcomingSessions] = useState(null);
  const [library, setLibrary] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [pickerFor, setPickerFor] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState("current");

  const reloadSessions = useCallback(async () => {
    try {
      const [cur, up] = await Promise.all([loadBlockSessions(current), loadBlockSessions(upcoming)]);
      setCurrentSessions(cur ?? []);
      setUpcomingSessions(up ?? []);
    } catch (err) {
      toastError("Couldn't load the sessions", err);
      setCurrentSessions([]);
      setUpcomingSessions([]);
    }
  }, [current?.id, upcoming?.id, userId]);

  // On FOCUS, not just on mount/dep-change: coming back from the full
  // builder returns to an already-mounted page with the same block ids, and
  // without this the pane kept showing the pre-edit sessions — which also
  // kept the Publish button disabled ("everything looks empty"), the exact
  // round-trip Terra reported.
  useFocusEffect(
    useCallback(() => {
      reloadSessions();
    }, [reloadSessions])
  );

  useEffect(() => {
    listExercises()
      .then(setLibrary)
      .catch(() => setLibrary([]));
  }, []);

  /* ---------------- current-pane drafts (the Update bar) ---------------- */

  const originalFor = (rowId) => {
    for (const s of currentSessions ?? []) {
      const row = s.exercises.find((e) => e.id === rowId);
      if (row) return row;
    }
    return null;
  };

  const setDraft = (rowId, field, value) => {
    setDrafts((d) => ({ ...d, [rowId]: { ...d[rowId], [field]: value } }));
  };

  const dirtyRows = useMemo(() => {
    const out = [];
    for (const [rowId, fields] of Object.entries(drafts)) {
      const original = originalFor(rowId);
      if (!original) continue;
      const changed = {};
      if (fields.sets !== undefined && String(fields.sets) !== String(original.sets)) changed.sets = fields.sets;
      if (fields.reps !== undefined && String(fields.reps) !== String(original.reps)) changed.reps = fields.reps;
      if (fields.rest !== undefined && String(fields.rest) !== String(original.rest ?? "")) changed.rest = fields.rest;
      if (Object.keys(changed).length) out.push({ rowId, changed });
    }
    return out;
    // originalFor reads currentSessions, so both are real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, currentSessions]);

  const handleUpdate = async () => {
    setBusy(true);
    try {
      for (const { rowId, changed } of dirtyRows) {
        const fields = {};
        if (changed.sets !== undefined) fields.sets = Math.max(1, Number(changed.sets) || 1);
        if (changed.reps !== undefined) fields.reps = String(changed.reps);
        if (changed.rest !== undefined) fields.rest = String(changed.rest).trim() || null;
        await updateSpcWorkoutExercise(rowId, fields);
      }
      // A session that gained lifts while it was a hidden draft (a frequency
      // bump's new card) goes live with the same deliberate press.
      for (const s of currentSessions ?? []) {
        if (s.exercises.length > 0 && s.workout.status !== "published") {
          await setSpcWorkoutStatus(s.workout.id, "published");
        }
      }
      setDrafts({});
      await reloadSessions();
      toastSuccess(
        currentNotStarted
          ? `Updated. ${clientFirst} sees this when it starts ${monFmt(current.block_start_date)}.`
          : `Updated. ${clientFirst} sees this now.`
      );
    } catch (err) {
      toastError("Couldn't update", err);
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------- actions ------------------------------ */

  const handleAddLift = async (exercise) => {
    const session = pickerFor;
    setPickerFor(null);
    if (!session || !exercise) return;
    try {
      await addSpcWorkoutExercise({
        workoutId: session.workout.id,
        exerciseId: exercise.id,
        position: session.exercises.length + 1,
        userId,
        defaultSets: exercise.default_sets,
        defaultReps: exercise.default_reps,
      });
      // Adding to a live session shows immediately; adding to a hidden draft
      // session stays hidden until Update publishes it.
      await reloadSessions();
      if (session.workout.status === "published") {
        toastSuccess(
          currentNotStarted ? `Added. She sees it ${monFmt(current.block_start_date)}.` : `Added. Live to ${clientFirst}.`
        );
      }
    } catch (err) {
      toastError("Couldn't add the lift", err);
    }
  };

  const handleRemoveLift = async (row) => {
    if (!(await confirmRemoveLift(row.exercises?.name ?? "this lift", clientFirst))) return;
    try {
      await removeSpcWorkoutExercise(row.id);
      await reloadSessions();
    } catch (err) {
      toastError("Couldn't remove the lift", err);
    }
  };

  const handleOpenEditor = async (session, live) => {
    if (live && session.exercises.length > 0) {
      if (!(await confirmOpenLiveEditor(clientFirst))) return;
    }
    router.push(`/(coach)/spc/builder/${session.workout.id}`);
  };

  const handleAddWeek = async () => {
    try {
      await setSpcProgramEnd(current.id, addDays(current.block_end_date, 7));
      toastSuccess(`Extended. Now ends ${sunFmt(addDays(current.block_end_date, 7))}.`);
      onChanged();
    } catch (err) {
      toastError("Couldn't extend", err);
    }
  };

  // Pulling the end in is the half that had no control at all: "+ Add a week"
  // and the Ongoing toggle only ever lengthen, and "End here" lives on the
  // legacy client page that hasLiveWeeklyWorld() has returned false for since
  // the 0105 cutover, so it is unreachable. Shortening asks first; extending
  // takes nothing away, so it doesn't.
  // Pulling the end in is the half that had no control at all: "+ Add a week"
  // and the Ongoing toggle only ever lengthen, and "End here" lives on the
  // legacy client page that hasLiveWeeklyWorld() has returned false for since
  // the 0105 cutover, so it is unreachable. The picker is the deliberate step;
  // nothing is deleted here either way (a sessions-format program has one row
  // per session for the whole run, 0105), so it needs no dialog on top.
  const handleSetEnd = async (endDate) => {
    if (!current || endDate === current.block_end_date) return;
    setBusy(true);
    try {
      const { lengthWeeks } = await setSpcProgramEnd(current.id, endDate);
      toastSuccess(`Ends ${sunFmt(endDate)} · ${lengthWeeks} ${lengthWeeks === 1 ? "week" : "weeks"}.`);
      onChanged();
    } catch (err) {
      toastError("Couldn't change the end date", err);
    } finally {
      setBusy(false);
    }
  };

  const handleOngoingToggle = async (on) => {
    try {
      if (on) {
        await setSpcProgramEnd(current.id, null);
        toastSuccess("Ongoing. Runs until you set an end date.");
      } else {
        // Restore a real end: the stored length from the start, and never in
        // the past — an ongoing program that outran its old length ends this
        // Sunday at the earliest.
        const candidate = addDays(current.block_start_date, (current.block_length_weeks ?? 4) * 7 - 1);
        const thisSunday = addDays(mondayOnOrBefore(today), 6);
        await setSpcProgramEnd(current.id, candidate >= today ? candidate : thisSunday);
      }
      onChanged();
    } catch (err) {
      toastError("Couldn't change the end date", err);
    }
  };

  const handleBuildSession = async (block, sessionNumber, thenReload = reloadSessions) => {
    try {
      await addSpcSessionSlot(block.id, sessionNumber);
      await thenReload();
    } catch (err) {
      toastError("Couldn't add the session", err);
    }
  };

  const handleStartUpcoming = async (copyCurrent) => {
    setBusy(true);
    try {
      const created = await createSpcBlock({
        spcClientId: userId,
        coachId: spcClient?.assigned_coach_id ?? coachId,
        lengthWeeks: current?.block_length_weeks ?? 4,
        sessionsPerWeek: spcClient?.sessions_per_week ?? 2,
        status: "draft",
        format: "sessions",
      });
      if (copyCurrent && currentSessions?.length) {
        const newSessions = await listSpcWorkoutsForBlock(created.id);
        for (const s of currentSessions) {
          const target = newSessions.find((w) => w.session_number === s.workout.session_number);
          if (target) await copySpcWorkoutContent(s.workout.id, target.id);
        }
      }
      onChanged();
    } catch (err) {
      toastError("Couldn't start the upcoming program", err);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUpcoming = async () => {
    if (!(await confirmDeleteDraftBlock())) return;
    try {
      await deleteSpcBlock(upcoming.id);
      onChanged();
    } catch (err) {
      toastError("Couldn't delete it", err);
    }
  };

  const handlePublish = async (startDate, { lengthWeeks = null, ongoing = false } = {}) => {
    setBusy(true);
    try {
      const result = await publishSpcBlock(upcoming.id, { startDate, lengthWeeks, ongoing });
      setPublishOpen(false);
      toastSuccess(
        result.startDate <= today
          ? `Published. Live to ${clientFirst} now.`
          : `Published. Goes live to ${clientFirst} ${monFmt(result.startDate)}.`
      );
      onChanged();
    } catch (err) {
      toastError("Couldn't publish", err);
    } finally {
      setBusy(false);
    }
  };

  const handleReschedule = async (startDate, { lengthWeeks = null, ongoing = false } = {}) => {
    setBusy(true);
    try {
      const result = await rescheduleSpcProgram(queuedBlock.id, { startDate, lengthWeeks, ongoing });
      setRescheduleOpen(false);
      toastSuccess(
        result.startDate <= today
          ? `Saved. Live to ${clientFirst} now.`
          : `Saved. Goes live to ${clientFirst} ${monFmt(result.startDate)}.`
      );
      onChanged();
    } catch (err) {
      toastError("Couldn't change the dates", err);
    } finally {
      setBusy(false);
    }
  };

  const handleCancelUpcoming = async () => {
    if (!(await confirmCancelQueuedProgram(clientFirst, monFmt(queuedBlock.block_start_date)))) return;
    setBusy(true);
    try {
      await unpublishSpcProgram(queuedBlock.id);
      toastSuccess("Cancelled. It's back in your build space as a draft.");
      onChanged();
    } catch (err) {
      toastError("Couldn't cancel it", err);
    } finally {
      setBusy(false);
    }
  };

  // A session added AFTER publishing is created as a draft (addSpcSessionSlot),
  // and nothing was ever going to publish it — so it sat invisible to her with
  // the pane saying "Published" above it. Same deliberate press as the current
  // program's Update.
  const handlePublishAdded = async (block, startsLater) => {
    setBusy(true);
    try {
      const { published } = await publishReadySessions(block.id);
      toastSuccess(
        published === 0
          ? "Nothing new to send yet."
          : startsLater
            ? `Sent. ${clientFirst} sees ${published === 1 ? "it" : "them"} ${monFmt(block.block_start_date)}.`
            : `Sent. ${clientFirst} sees ${published === 1 ? "it" : "them"} now.`
      );
      onChanged();
    } catch (err) {
      toastError("Couldn't send it", err);
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------- render ------------------------------- */

  const lapsed = Boolean(current?.block_end_date && current.block_end_date < today);
  const targetSessions = spcClient?.sessions_per_week ?? 1;
  const upcomingQueued = Boolean(upcoming && upcoming.status === "active");
  // The published-but-not-yet-started program, whichever pane is holding it.
  // When it is the only program she has it sits in Current (labelled), so its
  // controls have to follow it there rather than living in one pane.
  const queuedBlock = currentNotStarted ? current : upcomingQueued ? upcoming : null;
  const queuedSessions = currentNotStarted ? currentSessions : upcomingSessions;
  // Sessions built after it was published: they hold lifts but are still
  // drafts, so she cannot see them and nothing on screen said so.
  const unsent = (list) => (list ?? []).filter((s) => s.exercises.length > 0 && s.workout.status !== "published").length;
  const unsentQueued = queuedBlock ? unsent(queuedSessions) : 0;
  // Same gap on a LIVE program: a session built after publishing is created as
  // a draft, and the Update bar only appears when a sets/reps/rest field is
  // dirty — so adding a whole session and touching nothing else left it
  // invisible to her with no way to tell.
  const unsentCurrent = current && !currentNotStarted ? unsent(currentSessions) : 0;

  const missingCurrentSlots = useMemo(() => {
    if (!current || !currentSessions) return [];
    const have = new Set(currentSessions.map((s) => s.workout.session_number));
    const missing = [];
    for (let n = 1; n <= targetSessions; n += 1) if (!have.has(n)) missing.push(n);
    return missing;
  }, [current, currentSessions, targetSessions]);

  const currentPane = (
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: currentNotStarted ? "#a8a29e" : OLIVE }} />
        <Text style={{ fontFamily: fonts.display, fontSize: 20, color: "#2a211c" }}>Current program</Text>
        {/* Her program IS this one — it just hasn't reached its Monday. Saying
            "live to her" would be a lie, and showing nothing at all was what
            made a waiting client read as one with no program. */}
        {currentNotStarted ? (
          <Badge label={`STARTS ${monFmt(current.block_start_date).toUpperCase()}`} />
        ) : (
          <Badge label={`LIVE TO ${clientFirst.toUpperCase()}`} live />
        )}
      </View>

      {!current ? (
        <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 24, marginTop: 14 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#2a211c" }}>No current program</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 4 }}>
            Build her first one on the {sideBySide ? "right" : "Upcoming tab"} and publish it with a start Monday.
          </Text>
        </View>
      ) : currentSessions == null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <>
          <ProgramDatesPanel
            block={current}
            lapsed={lapsed}
            today={today}
            busy={busy}
            nextStart={upcomingQueued && upcoming.block_start_date > current.block_start_date ? upcoming.block_start_date : null}
            onSetEnd={handleSetEnd}
            onAddWeek={handleAddWeek}
            onOngoing={handleOngoingToggle}
          />

          {currentNotStarted ? (
            <View style={{ marginTop: 12 }}>
              <QueuedProgramStrip
                block={current}
                clientFirst={clientFirst}
                busy={busy}
                onReschedule={() => setRescheduleOpen(true)}
                onCancel={handleCancelUpcoming}
              />
              {unsentQueued > 0 ? (
                <>
                  <PressFade
                    onPress={() => handlePublishAdded(current, true)}
                    disabled={busy}
                    style={{
                      backgroundColor: "#33251f",
                      borderRadius: 12,
                      paddingVertical: 13,
                      alignItems: "center",
                      marginTop: 10,
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#f7f3ee" }}>
                      {`↑ Send ${unsentQueued} new session${unsentQueued === 1 ? "" : "s"}`}
                    </Text>
                  </PressFade>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", textAlign: "center", marginTop: 6 }}>
                    {unsentQueued === 1 ? "This one was" : "These were"} built after you published, so {clientFirst} can't see{" "}
                    {unsentQueued === 1 ? "it" : "them"} yet.
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}

          {/* Same thread as the foot of Overview's CURRENT PROGRAM card, and
              the same open state — a coach who opens it in one place finds it
              open in the other. Its own white card here, so it reads as a peer
              of the session cards below rather than a caption on the dates
              panel above. */}
          <ProgramNotesRow spcBlockId={current.id} coachId={coachId} variant="card" style={{ marginTop: 14 }} />

          {currentSessions.map((s) => (
            <SessionCard
              key={s.workout.id}
              session={s}
              labels={liftLabelsFor(s.exercises)}
              drafts={drafts}
              onDraft={setDraft}
              onRemove={handleRemoveLift}
              onAddLift={(session) => setPickerFor(session)}
              onOpenEditor={(session) => handleOpenEditor(session, true)}
              clientFirst={clientFirst}
              editable
              showEditor={isDesktop}
            />
          ))}

          {missingCurrentSlots.map((n) => (
            <PressFade
              key={n}
              onPress={() => handleBuildSession(current, n)}
              style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: "#dcc9bf", borderRadius: 14, padding: 18, marginTop: 14, alignItems: "center" }}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>
                + Build Session {n}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 3 }}>
                Her frequency is {targetSessions}× a week. This slot isn't built yet.
              </Text>
            </PressFade>
          ))}

          {unsentCurrent > 0 ? (
            <>
              <PressFade
                onPress={() => handlePublishAdded(current, false)}
                disabled={busy}
                style={{
                  backgroundColor: "#33251f",
                  borderRadius: 12,
                  paddingVertical: 13,
                  alignItems: "center",
                  marginTop: 16,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#f7f3ee" }}>
                  {`↑ Send ${unsentCurrent} new session${unsentCurrent === 1 ? "" : "s"}`}
                </Text>
              </PressFade>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", textAlign: "center", marginTop: 6 }}>
                {unsentCurrent === 1 ? "This one is" : "These are"} built but not sent, so {clientFirst} can't see{" "}
                {unsentCurrent === 1 ? "it" : "them"} yet.
              </Text>
            </>
          ) : null}

          {dirtyRows.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                backgroundColor: "#33251f",
                borderRadius: 12,
                padding: 14,
                marginTop: 16,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#f7f3ee" }}>
                  {dirtyRows.length} unsaved change{dirtyRows.length === 1 ? "" : "s"}
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a89a92", marginTop: 2 }}>
                  Changes go live to {clientFirst} immediately.
                </Text>
              </View>
              <PressFade onPress={() => setDrafts({})} hitSlop={6} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#c9beb4" }}>Discard</Text>
              </PressFade>
              <PressFade
                onPress={handleUpdate}
                disabled={busy}
                style={{ backgroundColor: OLIVE, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 18, opacity: busy ? 0.5 : 1 }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>{busy ? "Updating…" : "Update"}</Text>
              </PressFade>
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  const upcomingPane = (
    <View
      style={
        sideBySide
          ? { flex: 1, minWidth: 0, backgroundColor: "#e7e0d6", borderWidth: 1, borderColor: "#dad2c6", borderRadius: 14, padding: 18 }
          : { flex: 1, minWidth: 0 }
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: "#c9c4bd" }} />
        <Text style={{ fontFamily: fonts.display, fontSize: 20, color: "#2a211c" }}>Upcoming program</Text>
        <Badge label={`INVISIBLE TO ${clientFirst.toUpperCase()}`} />
      </View>

      {!upcoming ? (
        <View
          style={{
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: "#dcc9bf",
            borderRadius: 14,
            padding: 24,
            marginTop: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c", textAlign: "center" }}>
            Nothing queued yet
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", textAlign: "center", marginTop: 4 }}>
            Build the next program here. She can't see any of it until you publish.
          </Text>
          {current ? (
            <PressFade
              onPress={() => handleStartUpcoming(true)}
              disabled={busy}
              style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18, marginTop: 14, opacity: busy ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>Copy current program</Text>
            </PressFade>
          ) : null}
          <PressFade onPress={() => handleStartUpcoming(false)} disabled={busy} style={{ marginTop: 10 }} hitSlop={6}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
              {current ? "or build from blank" : "Build from blank"}
            </Text>
          </PressFade>
        </View>
      ) : upcomingSessions == null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <View
          style={{
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: "#dcc9bf",
            borderRadius: 14,
            padding: 14,
            marginTop: 14,
          }}
        >
          {upcomingQueued ? (
            /* Published-with-a-future-date needs to LOOK published, or a
               coach reads the pane as "nothing happened" (Terra's item 4). */
            <QueuedProgramStrip
              block={upcoming}
              clientFirst={clientFirst}
              busy={busy}
              onReschedule={() => setRescheduleOpen(true)}
              onCancel={handleCancelUpcoming}
            />
          ) : (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c" }}>
              {isDesktop
                ? "Autosaves in the editor · publish it when it's ready"
                : "Build this one on a computer · publish it when it's ready"}
            </Text>
          )}

          {upcomingSessions.map((s) => (
            <SessionCard
              key={s.workout.id}
              session={s}
              labels={liftLabelsFor(s.exercises)}
              onOpenEditor={(session) => handleOpenEditor(session, false)}
              clientFirst={clientFirst}
              editable={false}
              showEditor={isDesktop}
            />
          ))}

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
            <PressFade
              onPress={() =>
                handleBuildSession(upcoming, (upcomingSessions[upcomingSessions.length - 1]?.workout.session_number ?? 0) + 1)
              }
              hitSlop={6}
            >
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>+ Add session</Text>
            </PressFade>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
              {upcomingSessions.length} session{upcomingSessions.length === 1 ? "" : "s"}
              {upcomingSessions.length === targetSessions ? ` · matches her ${targetSessions}× / week` : ` · her target is ${targetSessions}× / week`}
            </Text>
          </View>

          {upcomingQueued && !currentNotStarted && unsentQueued > 0 ? (
            <>
              <PressFade
                onPress={() => handlePublishAdded(upcoming, true)}
                disabled={busy}
                style={{
                  backgroundColor: "#33251f",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  marginTop: 14,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#f7f3ee" }}>
                  {`↑ Send ${unsentQueued} new session${unsentQueued === 1 ? "" : "s"}`}
                </Text>
              </PressFade>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", textAlign: "center", marginTop: 8 }}>
                {unsentQueued === 1 ? "This one was" : "These were"} built after you published, so {clientFirst} can't see{" "}
                {unsentQueued === 1 ? "it" : "them"} yet.
              </Text>
            </>
          ) : null}

          {!upcomingQueued ? (
            <>
              <PressFade
                onPress={() => setPublishOpen(true)}
                disabled={busy || upcomingSessions.every((s) => s.exercises.length === 0)}
                style={{
                  backgroundColor: "#33251f",
                  borderRadius: 12,
                  paddingVertical: 14,
                  alignItems: "center",
                  marginTop: 14,
                  opacity: busy || upcomingSessions.every((s) => s.exercises.length === 0) ? 0.5 : 1,
                }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#f7f3ee" }}>↑ Publish</Text>
              </PressFade>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", textAlign: "center", marginTop: 8 }}>
                You pick the Monday it starts and how many weeks it runs. Her current program closes into History that day.
              </Text>
              <PressFade onPress={handleDeleteUpcoming} style={{ alignSelf: "center", marginTop: 8 }} hitSlop={6}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: "#b23a22" }}>Delete this draft</Text>
              </PressFade>
            </>
          ) : null}
        </View>
      )}
    </View>
  );

  return (
    <View>
      {sideBySide ? (
        <View style={{ flexDirection: "row", gap: 26, alignItems: "stretch" }}>
          {currentPane}
          {upcomingPane}
        </View>
      ) : (
        <View>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
            {[
              { key: "current", label: "Current", live: true },
              { key: "upcoming", label: "Upcoming", live: false },
            ].map((t) => (
              <PressFade
                key={t.key}
                onPress={() => setPane(t.key)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: pane === t.key ? "#fff" : "transparent",
                  borderWidth: 1,
                  borderColor: pane === t.key ? CARD_BORDER : "transparent",
                }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: t.live ? OLIVE : "transparent",
                    borderWidth: t.live ? 0 : 1.5,
                    borderColor: "#c9c4bd",
                  }}
                />
                <Text style={{ fontFamily: pane === t.key ? fonts.sansBold : fonts.sansSemiBold, fontSize: 13, color: pane === t.key ? "#2a211c" : "#78716c" }}>
                  {t.label}
                </Text>
              </PressFade>
            ))}
          </View>
          {pane === "current" ? currentPane : upcomingPane}
        </View>
      )}

      <ExercisePickerModal
        visible={Boolean(pickerFor)}
        library={library.filter((e) => e.type !== "warmup")}
        onClose={() => setPickerFor(null)}
        onPick={handleAddLift}
      />

      <PublishProgramModal
        visible={publishOpen}
        onClose={() => setPublishOpen(false)}
        current={current}
        spcClient={spcClient}
        onPublish={handlePublish}
        busy={busy}
      />
      <PublishProgramModal
        visible={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        current={current}
        spcClient={spcClient}
        onPublish={handleReschedule}
        busy={busy}
        mode="reschedule"
        block={upcoming}
      />
    </View>
  );
}
