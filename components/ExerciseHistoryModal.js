import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { listLogsForExercise } from "../lib/programming/memberPlan";
import { formatDateMD } from "../lib/formatDate";
import { todayInBoise, daysBetween } from "../lib/boiseDate";
import { PressFade } from "./PressFade";
import { fonts, colors } from "../lib/theme";

// design_handoff_member_lasttime_v1. This is now the ONLY place a member sees
// what she lifted last time — the card behind it carries no history at all
// (see ExerciseCard's header comment for why the in-box ghost went away). So
// this sheet has to answer the actual question in one glance, which is not
// "what did I do" but "should I go up today". Hence three sessions rather than
// one, and set-by-set rather than a "3 × 10 @ 135" summary: the summary hides
// exactly the case that decides it, where last week's third set dropped off.
//
// Trimmed from a full log + progress chart to three rows. Anything deeper —
// the trend, bests, the whole history — is one more tap away in My History, in
// the visual language it already has, rather than rebuilt thinner in here.
const CARD_BORDER = "#ece7e1";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };
const PEACH_BG = "#fdf6f2";
const PEACH_BORDER = "#f0ddd2";
const SESSIONS_SHOWN = 3;

// A set she typed into and then cleared leaves a real row behind with both
// reps and weight null — logResult updates an existing row even to null, on
// purpose, because clearing a field you'd already filled in is a genuine edit
// that has to persist. Those husks are not history, so they're dropped here,
// and a date left with nothing real in it drops out entirely rather than
// showing as a session of dashes. getLastLoggedSession has always skipped
// them the same way; this is the same guard, applied where history is read.
const isRealSet = (row) => row.reps !== null || row.weight !== null;

// Same grouping as My History's "By Workout" screen (history/[exerciseId].js) —
// one row per date instead of one row per set.
function groupByDate(logs) {
  const groups = [];
  const byDate = new Map();
  for (const row of logs.filter(isRealSet)) {
    if (!byDate.has(row.date_performed)) {
      const group = { date: row.date_performed, sets: [], notes: null };
      byDate.set(row.date_performed, group);
      groups.push(group);
    }
    const group = byDate.get(row.date_performed);
    group.sets.push(row);
    if (!group.notes && row.notes) group.notes = row.notes;
  }
  return groups;
}

// "10 days ago" — the date alone makes her do the arithmetic, and the gap is
// half of what tells her whether last time is still a fair comparison.
function agoLabel(date, today) {
  // daysBetween is A minus B, so today comes FIRST — the other order silently
  // reads every past session as "today".
  const days = daysBetween(today, date);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

// One set = one pill, reps big and weight small beneath it. Pills are laid out
// in equal columns across the row so set 2 sits under set 2 of the session
// above, which is what makes comparing three sessions a glance rather than a
// read. Rows stay exactly as they were logged — a session with three sets does
// NOT get padded out to today's four, because inventing an empty fourth pill
// would read as a set she skipped rather than one that was never asked for.
function SetPill({ set, tinted }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        alignItems: "center",
        paddingVertical: 7,
        borderRadius: 11,
        borderWidth: 1,
        borderColor: tinted ? PEACH_BORDER : CARD_BORDER,
        backgroundColor: tinted ? "#fffaf7" : "#fff",
      }}
    >
      <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 19, color: "#44403c" }}>
        {set.reps ?? "–"}
      </Text>
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 1 }}>
        {set.weight != null ? `@ ${set.weight}` : "–"}
      </Text>
    </View>
  );
}

// datePerformed is the session being logged right now. Everything on or after
// it is excluded: "LAST TIME" has to mean the last time BEFORE this one, and
// her own autosaved sets would otherwise be sitting at the top of her history
// labelled as last time within seconds of typing them.
// returnTo is the href of the session this was opened from — the same
// {pathname, params} the rest timer's "Back to lift" uses, which resolves the
// exact session rather than whatever today's weekday would pick. Absent when
// the card is being viewed read-only in My History, in which case the full
// history screen keeps its normal back behaviour.
export function ExerciseHistoryModal({ visible, onClose, userId, exerciseId, exerciseName, datePerformed, returnTo }) {
  const router = useRouter();
  const [logs, setLogs] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  // The lift title itself opens this, so it's one of the most-tapped things
  // in the whole logging flow — an uncaught rejection here left a spinner
  // that never resolved, and reopening the same lift didn't retry.
  useEffect(() => {
    if (!visible || !exerciseId) return;
    let cancelled = false;
    setLogs(null);
    setLoadError(null);
    listLogsForExercise(userId, exerciseId, datePerformed ?? null)
      .then((rows) => {
        if (!cancelled) setLogs(rows);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [visible, exerciseId, userId, datePerformed, retryKey]);

  const today = todayInBoise();
  const allGroups = logs ? groupByDate(logs) : [];
  // listLogsForExercise already comes back newest-first, so the first three
  // groups are the three most recent sessions.
  const groups = allGroups.slice(0, SESSIONS_SHOWN);

  // Dismiss before navigating, or the sheet rides along on top of the screen
  // it just pushed. `from`/`before` are carried so the full-history screen
  // knows it was opened mid-session: it sends her back to My Fitness rather
  // than to My History, and applies the same today-cutoff this sheet does.
  const openFullHistory = () => {
    onClose?.();
    router.push({
      pathname: "/(member)/history/[exerciseId]",
      params: {
        exerciseId,
        ...(datePerformed ? { before: datePerformed } : null),
        // Route params have to be strings, so the href travels as JSON.
        ...(returnTo ? { returnTo: JSON.stringify(returnTo) } : null),
      },
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end px-0" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            maxHeight: "82%",
            width: "100%",
            backgroundColor: "#faf8f6",
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: 24,
            // A flex child sizes to its own content and pushes the footer
            // button off the bottom of the screen unless the overflow is
            // clipped here and the scroller below is allowed to give way.
            overflow: "hidden",
          }}
        >
          <View style={{ alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "#e0dbd4", marginBottom: 14 }} />

          <View className="mb-3 flex-row items-start justify-between" style={{ gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={2} style={{ fontFamily: fonts.display, fontSize: 22, color: "#44403c", lineHeight: 27 }}>
                {exerciseName}
              </Text>
              {groups.length > 0 ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e", marginTop: 2 }}>
                  {groups.length > 1 ? `Last ${groups.length} sessions` : "Last session"}
                </Text>
              ) : null}
            </View>
            <PressFade
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Close history"
              style={{ minHeight: 44, justifyContent: "center", flexShrink: 0 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: colors.primaryOnWhite }}>Done</Text>
            </PressFade>
          </View>

          {loadError ? (
            <View className="items-center py-8">
              <Text className="mb-3 text-center" style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22" }}>
                Couldn't load this lift's history.
              </Text>
              <Pressable onPress={() => setRetryKey((k) => k + 1)} hitSlop={8}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Try again</Text>
              </Pressable>
            </View>
          ) : !logs ? (
            <View className="items-center py-8">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : groups.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-center" style={{ fontFamily: fonts.sans, fontSize: 13.5, color: "#78716c" }}>
                First time logging this lift.
              </Text>
              <Text className="mt-1 text-center" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
                Whatever you do today becomes the reference next time.
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: CARD_BORDER, backgroundColor: "#fff", overflow: "hidden", ...CARD_SHADOW }}>
                {groups.map((group, index) => {
                  // Most recent row is tinted and tagged, so the reference she
                  // came for is found without reading three dates first.
                  const isLast = index === 0;
                  return (
                    <View
                      key={group.date}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 13,
                        backgroundColor: isLast ? PEACH_BG : "#fff",
                        ...(index > 0 ? { borderTopWidth: 1, borderTopColor: CARD_BORDER } : null),
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 9 }}>
                        <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#44403c" }}>{formatDateMD(group.date)}</Text>
                        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e", flex: 1 }} numberOfLines={1}>
                          {agoLabel(group.date, today)}
                        </Text>
                        {isLast ? (
                          <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1, color: colors.primaryOnWhite }}>
                            LAST TIME
                          </Text>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: "row", gap: 7 }}>
                        {group.sets.map((s) => (
                          <SetPill key={s.id} set={s} tinted={isLast} />
                        ))}
                      </View>
                      {group.notes ? (
                        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e", marginTop: 8, fontStyle: "italic" }}>{group.notes}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              <PressFade
                onPress={openFullHistory}
                accessibilityLabel={`View full history for ${exerciseName}`}
                style={{
                  marginTop: 14,
                  minHeight: 48,
                  borderRadius: 14,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 6,
                }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#fff" }}>View full history</Text>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#fff" }}>›</Text>
              </PressFade>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
