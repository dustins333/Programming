import { useMemo, useState } from "react";
import { Modal, View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressFade } from "./PressFade";
import { KeyboardDoneButton } from "./KeyboardDoneButton";
import { BacklogDatePicker } from "./session/BacklogDatePicker";
import { BacklogSetGrid } from "./session/BacklogSetGrid";
import {
  CLAY,
  ExerciseGroupCard,
  ExerciseRow,
  FAINT,
  INK_DEEP,
  LoggedExerciseRow,
  MUTED,
  SHEET_CANVAS,
  SheetEyebrow,
  StatePill,
} from "./session/SessionSheetParts";
import { todayInBoise } from "../lib/boiseDate";
import { fonts, colors } from "../lib/theme";

// design_handoff_member_block_v1 (14a-14d) — the sheet that opens when a
// member taps a session, from a My Week stripe or from the block page.
//
// It replaces SessionPreviewModal's centred two-state dialog. Four states,
// switched on the session's date and its completion row rather than on a
// single `completed` boolean:
//
//   today    — today's session                → "Log this session"
//   backlog  — past week, no completion row   → date question, set entry,
//                                               "Save this session"
//   logged   — has a completion row           → what she did, "Update this
//                                               session"
//   future   — the week hasn't started        → no button at all, just a line
//
// That last one is a real bug fix, not a style choice: the old sheet offered
// the same log button on a session in a week that hadn't started yet. It's
// removed rather than disabled — a disabled button gets tapped.
//
// The sheet rises over whatever she was looking at and the card she tapped
// stays visible behind it: she's inspecting a card, not leaving the screen.

const STATE_COPY = {
  today: { pill: "TODAY", cta: "Log this session" },
  backlog: { pill: "MISSED | LOG IT NOW", cta: "Save this session" },
  logged: { pill: null, cta: "Update this session" },
  future: { pill: null, cta: null },
};

// Consecutive singles share one card; each superset gets its own. Position
// labels follow the coach's ordering — "1", "2", then "3a"/"3b" for the two
// halves of a superset.
function buildGroups(exercises) {
  const groups = [];
  let position = 0;
  let i = 0;
  while (i < exercises.length) {
    const ex = exercises[i];
    const supersetId = ex.supersetGroupId;
    if (supersetId) {
      const members = [];
      while (i < exercises.length && exercises[i].supersetGroupId === supersetId) {
        members.push(exercises[i]);
        i += 1;
      }
      position += 1;
      groups.push({
        key: `ss-${supersetId}`,
        superset: true,
        rounds: members[0]?.targetSets ?? null,
        items: members.map((m, n) => ({ ...m, position: `${position}${String.fromCharCode(97 + n)}` })),
      });
    } else {
      const members = [];
      while (i < exercises.length && !exercises[i].supersetGroupId) {
        position += 1;
        members.push({ ...exercises[i], position: String(position) });
        i += 1;
      }
      groups.push({ key: `solo-${members[0].id}`, superset: false, items: members });
    }
  }
  return groups;
}

export function SessionSheet({
  visible,
  onClose,
  // "WEEK 3 | SESSION 2"
  eyebrow,
  title,
  state = "today",
  // Only for `logged` — the date it was actually performed.
  completedDateLabel,
  // Only for `future` — "Next week", "Week 4", …
  futureLabel,
  // Overrides the pill for the cases the four states don't name on their own
  // — a current-week session whose day simply hasn't come round yet is still
  // loggable, so it takes the `today` state but shouldn't claim to be today.
  pillLabel: pillOverride,
  // Replaces the `future` state's default line — the coach preview has its
  // own thing to say where a member's sheet says "once the week starts".
  footerNote,
  loading,
  error,
  onRetry,
  exercises,
  // exerciseId -> [{ reps, weight }], for the logged state.
  loggedSets,
  onCta,
  ctaBusy,
  // Back-log logging plumbing.
  userId,
  source,
  session,
}) {
  const insets = useSafeAreaInsets();
  const [logDate, setLogDate] = useState(todayInBoise());
  const [dateLocked, setDateLocked] = useState(false);

  const groups = useMemo(() => buildGroups(exercises ?? []), [exercises]);
  const copy = STATE_COPY[state] ?? STATE_COPY.today;
  const pillLabel =
    pillOverride ??
    (state === "logged"
      ? `LOGGED ${completedDateLabel ? completedDateLabel.toUpperCase() : ""}`.trim()
      : state === "future"
        ? (futureLabel ?? "LATER IN THE BLOCK").toUpperCase()
        : copy.pill);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <PressFade
        onPress={onClose}
        pressedOpacity={1}
        accessibilityLabel="Close session"
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
            // Without an explicit clip the ScrollView below sizes to its own
            // content and pushes the footer CTA clean off the bottom of the
            // screen — maxHeight alone doesn't make a flex child shrink.
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
              <SheetEyebrow style={{ flexShrink: 1 }}>{eyebrow}</SheetEyebrow>
              <PressFade onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close" style={{}}>
                <Text maxFontSizeMultiplier={1} style={{ fontSize: 15, color: FAINT }}>
                  ✕
                </Text>
              </PressFade>
            </View>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.display, fontSize: 27, lineHeight: 30, color: INK_DEEP, marginBottom: 7 }}>
              {title}
            </Text>
            {pillLabel ? (
              <View style={{ marginBottom: 16 }}>
                <StatePill state={state} label={pillLabel} />
              </View>
            ) : (
              <View style={{ height: 16 }} />
            )}
          </View>

          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : error ? (
            <View style={{ paddingVertical: 30, paddingHorizontal: 20, alignItems: "center" }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22", textAlign: "center", marginBottom: 12 }}>
                Couldn&apos;t load this session.
              </Text>
              {onRetry ? (
                <PressFade onPress={onRetry} hitSlop={8} style={{}}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Try again</Text>
                </PressFade>
              ) : null}
            </View>
          ) : (
            <ScrollView
              // flexShrink so the list gives way to the pinned footer on a
              // long session; flexGrow 0 so a two-lift session doesn't
              // stretch the sheet to full height.
              style={{ flexShrink: 1, flexGrow: 0 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {state === "backlog" ? (
                <>
                  <BacklogDatePicker value={logDate} onChange={setLogDate} locked={dateLocked} />
                  {(exercises ?? []).map((ex) => (
                    <View key={ex.id} onTouchStart={() => setDateLocked(true)}>
                      <BacklogSetGrid
                        userId={userId}
                        exercise={ex}
                        datePerformed={logDate}
                        source={source}
                        session={session}
                        setCount={ex.targetSets}
                      />
                    </View>
                  ))}
                </>
              ) : state === "logged" ? (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 2, marginBottom: 8 }}>
                    <SheetEyebrow>What you did</SheetEyebrow>
                    <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.6, color: FAINT }}>
                      REPS | LB
                    </Text>
                  </View>
                  {groups.map((group) => (
                    <ExerciseGroupCard key={group.key} superset={group.superset} rounds={group.rounds}>
                      {group.items.map((ex, i) => (
                        <LoggedExerciseRow
                          key={ex.id}
                          position={ex.position}
                          name={ex.name}
                          detail={ex.detail}
                          sets={loggedSets?.get(ex.exerciseId) ?? []}
                          last={i === group.items.length - 1}
                        />
                      ))}
                    </ExerciseGroupCard>
                  ))}
                </>
              ) : (
                groups.map((group) => (
                  <ExerciseGroupCard key={group.key} superset={group.superset} rounds={group.rounds}>
                    {group.items.map((ex, i) => (
                      <ExerciseRow key={ex.id} position={ex.position} name={ex.name} detail={ex.detail} last={i === group.items.length - 1} />
                    ))}
                  </ExerciseGroupCard>
                ))
              )}

              {(exercises ?? []).length === 0 ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: MUTED, textAlign: "center", paddingVertical: 18 }}>
                  Nothing here yet.
                </Text>
              ) : null}
            </ScrollView>
          )}

          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 22 + insets.bottom, borderTopWidth: 1, borderTopColor: "#f0ece7" }}>
            {copy.cta && onCta ? (
              <PressFade
                onPress={() => onCta(state === "backlog" ? logDate : undefined)}
                disabled={ctaBusy}
                style={{
                  opacity: ctaBusy ? 0.5 : 1,
                  backgroundColor: CLAY,
                  borderRadius: 15,
                  paddingVertical: 16,
                  alignItems: "center",
                  shadowColor: CLAY,
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.25,
                  shadowRadius: 16,
                  elevation: 4,
                }}
              >
                <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: "#fff" }}>
                  {ctaBusy ? "Saving…" : copy.cta}
                </Text>
              </PressFade>
            ) : (
              // 14d — a line where the button was. Nothing to tap, because
              // there's nothing she can do about this session yet.
              <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: 13, color: MUTED, textAlign: "center", paddingVertical: 4 }}>
                {footerNote ?? "You can log this once the week starts"}
              </Text>
            )}
          </View>
        </PressFade>
      </PressFade>
      {/* Its own copy — a floating overlay can't cross a native Modal's window
          boundary, and the set boxes are decimal-pad, which has no Return key
          on iOS. */}
      <KeyboardDoneButton />
    </Modal>
  );
}
