import { useEffect, useState } from "react";
import { Modal, View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressFade } from "./PressFade";
import {
  CARD_BORDER,
  CLAY,
  DASHED_EMPTY,
  ExerciseGroupCard,
  ExerciseRow,
  FAINT,
  INK_DEEP,
  MUTED,
  SHEET_CANVAS,
  SheetEyebrow,
  buildGroups,
} from "./session/SessionSheetParts";
import { listWorkoutExercises } from "../lib/programming/workouts";
import { formatDateRange } from "../lib/formatDate";
import { fonts, colors, type } from "../lib/theme";

// The "Preview next block" popup — see lib/programming/nextBlockPreview.js for
// when it's offered and why rolling blocks never offer it.
//
// Read-only by construction. There is no log button on either pane, because
// none of this has happened yet: the whole point is looking ahead at the seam
// between two blocks, and every one of these sessions becomes normally
// loggable from My Fitness on Monday.
//
// ONE Modal, two panes, rather than opening SessionSheet on top of it. Two
// stacked native modals is the shape this codebase has been bitten by before
// (see the floating message bubble's own note), and a "‹ Next week" back link
// reads better on a phone than a second scrim over the first. The exercise
// rows are the very same components SessionSheet renders, so a session looks
// identical whichever way she reached it.

const INK = "#44403c";

// Sets × reps. Rest is deliberately absent — it isn't set on every lift, so
// showing it made some prescriptions read as incomplete; it belongs on the
// logging screen where she's timing against it. Matches plan-block.js.
function prescriptionLine(ex) {
  const reps = Array.isArray(ex.rep_scheme) && new Set(ex.rep_scheme).size > 1 ? ex.rep_scheme.join(", ") : ex.reps;
  return `${ex.sets ?? "–"} × ${reps ?? "–"}`;
}

function SessionRow({ row, onPress }) {
  const eyebrow = [row.sessionLabel, row.caption ? row.caption.toUpperCase() : null].filter(Boolean).join(" | ");
  if (!row.published) {
    return (
      <View
        style={{
          borderRadius: 14,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: DASHED_EMPTY,
          paddingHorizontal: 14,
          paddingVertical: 12,
          marginBottom: 10,
        }}
      >
        <Text
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 0.7, color: MUTED }}
        >
          {eyebrow}
        </Text>
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 13.5, color: MUTED, marginTop: 4 }}>
          Not published yet
        </Text>
      </View>
    );
  }
  return (
    <PressFade
      onPress={onPress}
      accessibilityLabel={`Preview next week's ${row.label}${row.title ? `, ${row.title}` : ""}`}
      style={{
        backgroundColor: "#fff",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.1}
          style={{ fontFamily: fonts.sansBold, fontSize: type.eyebrow, letterSpacing: 0.7, color: CLAY }}
        >
          {eyebrow}
        </Text>
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={1.15}
          style={{ fontFamily: fonts.sansBold, fontSize: 15, color: INK_DEEP, marginTop: 4 }}
        >
          {row.title || row.label}
        </Text>
      </View>
      <Text maxFontSizeMultiplier={1} style={{ fontSize: 17, color: FAINT }}>
        ›
      </Text>
    </PressFade>
  );
}

// `loadExercises` is the real fetch by default and exists as a prop only so
// this sheet can be driven end to end from a throwaway harness route, which
// is the only way anything member-facing gets looked at in this environment.
export function NextBlockSheet({ visible, onClose, programName, preview, loadExercises = listWorkoutExercises }) {
  const insets = useSafeAreaInsets();
  // null = the session list; otherwise the row being previewed.
  const [openRow, setOpenRow] = useState(null);
  // workoutId -> exercise list, so stepping back and forth between sessions
  // doesn't refetch what's already been read.
  const [content, setContent] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Always reopens on the list. Without this, closing from a session and
  // reopening lands on that session with a back link to a pane she never saw.
  useEffect(() => {
    if (!visible) {
      setOpenRow(null);
      setError(null);
    }
  }, [visible]);

  const openSession = async (row) => {
    setOpenRow(row);
    setError(null);
    if (content[row.workoutId]) return;
    setLoading(true);
    try {
      const exercises = await loadExercises(row.workoutId);
      setContent((prev) => ({
        ...prev,
        [row.workoutId]: exercises.map((ex) => ({
          id: ex.id,
          exerciseId: ex.exercises?.id ?? ex.exercise_id,
          name: ex.exercises?.name ?? "Exercise",
          detail: prescriptionLine(ex),
          supersetGroupId: ex.superset_group_id,
          targetSets: ex.sets,
        })),
      }));
    } catch (err) {
      // Without setting this the pane sat on its spinner forever, since
      // content[id] is never populated on a failure and the retry re-fails
      // the same way.
      setError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  };

  const exercises = openRow ? content[openRow.workoutId] : null;
  const groups = buildGroups(exercises ?? []);

  const title = openRow ? openRow.title || openRow.label : "Next week";
  const meta = openRow
    ? [openRow.sessionLabel, openRow.caption ? openRow.caption.toUpperCase() : null].filter(Boolean).join(" | ")
    : preview
      ? `${formatDateRange(preview.weekStartDate, preview.weekEndDate)} | Week ${preview.weekNumber} of ${preview.lengthWeeks}`
      : "";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <PressFade
        onPress={onClose}
        pressedOpacity={1}
        accessibilityLabel="Close next block preview"
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(42,33,28,0.38)" }}
      >
        {/* Swallows the tap so pressing inside the sheet doesn't bubble up to
            the backdrop — on web a Pressable's onClick is a real DOM event. */}
        <PressFade
          onPress={(e) => e.stopPropagation?.()}
          pressedOpacity={1}
          style={{
            width: "100%",
            maxHeight: "84%",
            // Without an explicit clip the ScrollView sizes to its own content
            // and pushes the footer line off the bottom of the screen —
            // maxHeight alone doesn't make a flex child shrink.
            overflow: "hidden",
            backgroundColor: SHEET_CANVAS,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            shadowColor: "#2a211c",
            shadowOffset: { width: 0, height: -12 },
            shadowOpacity: 0.2,
            shadowRadius: 34,
            elevation: 12,
          }}
        >
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <View style={{ width: 38, height: 4, borderRadius: 99, backgroundColor: "#ddd6cd", alignSelf: "center", marginTop: 2, marginBottom: 14 }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
              {openRow ? (
                <PressFade
                  onPress={() => setOpenRow(null)}
                  accessibilityLabel="Back to next week"
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ flexShrink: 1 }}
                >
                  <SheetEyebrow color={colors.primaryOnWhite}>‹ Next week</SheetEyebrow>
                </PressFade>
              ) : (
                <SheetEyebrow style={{ flexShrink: 1 }}>
                  {["Next block", programName].filter(Boolean).join(" | ")}
                </SheetEyebrow>
              )}
              <PressFade onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close" style={{}}>
                <Text maxFontSizeMultiplier={1} style={{ fontSize: 15, color: FAINT }}>
                  ✕
                </Text>
              </PressFade>
            </View>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 27, lineHeight: 30, color: INK_DEEP }}>
              {title}
            </Text>
            {meta ? (
              <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: MUTED, marginTop: 5 }}>
                {meta}
              </Text>
            ) : null}
            <View style={{ height: 16 }} />
          </View>

          {openRow && loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : openRow && error ? (
            <View style={{ paddingVertical: 30, paddingHorizontal: 20, alignItems: "center" }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22", textAlign: "center", marginBottom: 12 }}>
                Couldn&apos;t load this session.
              </Text>
              <PressFade onPress={() => openSession(openRow)} hitSlop={8} style={{}}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Try again</Text>
              </PressFade>
            </View>
          ) : (
            <ScrollView
              // flexShrink so the list gives way to the pinned footer on a long
              // session; flexGrow 0 so a short one doesn't stretch the sheet.
              style={{ flexShrink: 1, flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
              showsVerticalScrollIndicator={false}
            >
              {openRow
                ? groups.map((group) => (
                    <ExerciseGroupCard key={group.key} superset={group.superset} rounds={group.rounds}>
                      {group.items.map((ex, i) => (
                        <ExerciseRow key={ex.id} position={ex.position} name={ex.name} detail={ex.detail} last={i === group.items.length - 1} />
                      ))}
                    </ExerciseGroupCard>
                  ))
                : (preview?.rows ?? []).map((row) => (
                    <SessionRow key={row.key} row={row} onPress={() => openSession(row)} />
                  ))}

              {openRow && (exercises ?? []).length === 0 ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: MUTED, textAlign: "center", paddingVertical: 18 }}>
                  Nothing here yet.
                </Text>
              ) : null}
            </ScrollView>
          )}

          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 22 + insets.bottom, borderTopWidth: 1, borderTopColor: "#f0ece7" }}>
            {/* A line where a button would be, same as the session sheet's own
                future state — there is nothing to tap because there is nothing
                she can do about next week yet. */}
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 13, color: MUTED, textAlign: "center", paddingVertical: 4 }}>
              Logging opens Monday
            </Text>
          </View>
        </PressFade>
      </PressFade>
    </Modal>
  );
}
