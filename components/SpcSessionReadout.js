import { useMemo } from "react";
import { View, Text, Pressable, ScrollView, Modal } from "react-native";
import { buildSessionReadout, supersetLettersFor } from "../lib/programming/spcBlockDetail";
import { formatDateTimeInBoise } from "../lib/boiseDate";
import { formatRest } from "./builder/SessionBuilderParts";
import { fonts } from "../lib/theme";

// SPC session read-out (design_handoff_coach_web_v2, screen 16).
//
// What was programmed, against what she actually did, set by set. This is
// the screen a coach opens before writing next week — so it states facts and
// stops. Nothing here summarizes the session or suggests a change.
//
// Reps compare against reps. Weight is shown but never judged: it is never
// programmed in this app, so "went heavier" would be heavier than nothing.

const CARD_BORDER = "#ece7e1";

const RESULT_STYLES = {
  pr: { bg: "#e3ead9", text: "#4d6142" },
  short: { bg: "#fdece5", text: "#b23a22" },
  as_written: { bg: "transparent", text: "#a8a29e" },
  not_logged: { bg: "transparent", text: "#c9c4bd" },
};

function Eyebrow({ children, style }) {
  return (
    <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e" }, style]}>
      {children}
    </Text>
  );
}

function StatTile({ label, value, suffix, accent }) {
  return (
    <View style={{ flex: 1, minWidth: 150, backgroundColor: "#faf8f6", borderRadius: 12, paddingVertical: 13, paddingHorizontal: 15 }}>
      <Eyebrow>{label}</Eyebrow>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 6 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 24, color: accent ?? "#2a211c" }}>{value}</Text>
        {suffix ? <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

// One logged set: "185 × 8". A set she didn't log at all renders as a dashed
// placeholder rather than being dropped, so a short session reads as short
// instead of just reading as a shorter list.
function SetChip({ set }) {
  if (!set.logged) {
    return (
      <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: "#e0dbd4", borderRadius: 7, paddingVertical: 5, paddingHorizontal: 9 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#c9c4bd" }}>—</Text>
      </View>
    );
  }
  const missed = set.target != null && set.reps != null && set.reps < set.target;
  return (
    <View
      style={{
        backgroundColor: missed ? "#fdece5" : "#f4f1ec",
        borderRadius: 7,
        paddingVertical: 5,
        paddingHorizontal: 9,
      }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: missed ? "#b23a22" : "#44403c" }}>
        {set.weight != null ? `${set.weight} × ` : ""}
        {set.reps ?? "—"}
      </Text>
    </View>
  );
}

function ResultBadge({ row }) {
  const style = RESULT_STYLES[row.result];
  const label =
    row.result === "pr"
      ? `PR · +${row.pr.delta}`
      : row.result === "short"
        ? `${row.shortfall} short`
        : row.result === "as_written"
          ? "as written"
          : "not logged";

  if (row.result === "as_written" || row.result === "not_logged") {
    return <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: style.text, textAlign: "right" }}>{label}</Text>;
  }
  return (
    <View style={{ alignSelf: "flex-end", backgroundColor: style.bg, borderRadius: 99, paddingVertical: 4, paddingHorizontal: 10 }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 11.5, color: style.text }}>{label}</Text>
    </View>
  );
}

function ExerciseRow({ row, supersetLetter, showSupersetHeader, inSuperset }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 14,
        paddingVertical: 13,
        paddingHorizontal: inSuperset ? 14 : 0,
        borderTopWidth: showSupersetHeader ? 0 : 1,
        borderTopColor: "#f4f1ec",
      }}
    >
      <View style={{ flex: 1.5, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#2a211c" }} numberOfLines={2}>
          {row.name}
        </Text>
        {row.lift.tempo || row.lift.rest ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 2 }}>
            {[row.lift.tempo ? `Tempo ${row.lift.tempo}` : null, row.lift.rest ? `rest ${formatRest(row.lift.rest)}` : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
        {row.note ? (
          <View style={{ marginTop: 7, backgroundColor: "#faf8f6", borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#57534e", fontStyle: "italic" }}>
              “{row.note}”
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ width: 110 }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#57534e" }}>{row.programmed}</Text>
        {supersetLetter ? (
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.5, color: "#b23a22", marginTop: 3 }}>
            SS {supersetLetter}
          </Text>
        ) : null}
      </View>

      <View style={{ flex: 1.4, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {row.sets.map((s) => (
          <SetChip key={s.setNumber} set={s} />
        ))}
      </View>

      <View style={{ width: 96 }}>
        <ResultBadge row={row} />
      </View>
    </View>
  );
}

export function SpcSessionReadout({ visible, onClose, session, logsByDate, personalRecords, memberName, blockLabel, onPrev, onNext }) {
  const readout = useMemo(
    () => (session ? buildSessionReadout({ session, logsByDate, personalRecords }) : null),
    [session, logsByDate, personalRecords]
  );
  const letters = useMemo(() => (readout ? supersetLettersFor(readout.rows) : {}), [readout]);

  if (!session || !readout) return null;

  const prCount = readout.rows.filter((r) => r.result === "pr").length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.35)", alignItems: "center", justifyContent: "center", padding: 28 }}>
        <View
          style={{
            width: "100%",
            maxWidth: 940,
            maxHeight: "90%",
            backgroundColor: "#fff",
            borderRadius: 18,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 14,
              paddingHorizontal: 24,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: CARD_BORDER,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow>
                {[memberName, blockLabel, `WEEK ${session.week_number}`, `SESSION ${session.session_number}`]
                  .filter(Boolean)
                  .join(" · ")
                  .toUpperCase()}
              </Eyebrow>
              <Text style={{ fontFamily: fonts.display, fontSize: 25, color: "#2a211c", marginTop: 3 }}>
                {session.title || `Session ${session.session_number}`}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 4, flexWrap: "wrap" }}>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>
                  {session.completedAt ? `Logged ${formatDateTimeInBoise(session.completedAt)}` : "Not logged"}
                </Text>
                {prCount > 0 ? (
                  <View style={{ backgroundColor: "#e3ead9", borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 }}>
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: "#4d6142" }}>
                      {prCount} PR{prCount === 1 ? "" : "s"}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              {[
                [onPrev, "‹ Prev"],
                [onNext, "Next ›"],
              ].map(([handler, label]) => (
                <Pressable
                  key={label}
                  onPress={handler ?? undefined}
                  style={{
                    borderWidth: 1,
                    borderColor: CARD_BORDER,
                    borderRadius: 8,
                    paddingVertical: 7,
                    paddingHorizontal: 12,
                    opacity: handler ? 1 : 0.35,
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#57534e" }}>{label}</Text>
                </Pressable>
              ))}
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={{ paddingHorizontal: 6 }}>
                <Text style={{ fontSize: 18, color: "#a8a29e" }}>✕</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 30 }}>
            <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <StatTile
                label="SETS COMPLETED"
                value={readout.setsCompleted}
                suffix={`of ${readout.totalSets}`}
                accent={readout.setsCompleted >= readout.totalSets ? "#4d6142" : "#2a211c"}
              />
              <StatTile label="VOLUME" value={readout.volume.toLocaleString()} suffix="lb" />
              <StatTile
                label="HIT THE REP TARGET"
                value={readout.setsHittingTarget}
                suffix={`of ${readout.totalSets} sets`}
                accent={readout.setsHittingTarget >= readout.totalSets ? "#4d6142" : "#2a211c"}
              />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingBottom: 9 }}>
              <View style={{ flex: 1.5 }}>
                <Eyebrow>EXERCISE</Eyebrow>
              </View>
              <View style={{ width: 110 }}>
                <Eyebrow>PROGRAMMED</Eyebrow>
              </View>
              <View style={{ flex: 1.4 }}>
                <Eyebrow>LOGGED</Eyebrow>
              </View>
              <View style={{ width: 96 }}>
                <Eyebrow style={{ textAlign: "right" }}>RESULT</Eyebrow>
              </View>
            </View>

            {readout.rows.length === 0 ? (
              <View style={{ paddingVertical: 30 }}>
                <Text style={{ textAlign: "center", fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}>
                  Nothing was programmed for this session.
                </Text>
              </View>
            ) : (
              readout.rows.map((row, i) => {
                const prevGroup = readout.rows[i - 1]?.supersetGroupId ?? null;
                const startsSuperset = Boolean(row.supersetGroupId) && row.supersetGroupId !== prevGroup;
                const inSuperset = Boolean(row.supersetGroupId);
                const endsSuperset =
                  inSuperset && readout.rows[i + 1]?.supersetGroupId !== row.supersetGroupId;

                return (
                  <View
                    key={row.lift.id}
                    style={
                      inSuperset
                        ? {
                            backgroundColor: "#fdf6f2",
                            borderLeftWidth: 1,
                            borderRightWidth: 1,
                            borderColor: "#f0ddd2",
                            borderTopWidth: startsSuperset ? 1 : 0,
                            borderBottomWidth: endsSuperset ? 1 : 0,
                            borderTopLeftRadius: startsSuperset ? 10 : 0,
                            borderTopRightRadius: startsSuperset ? 10 : 0,
                            borderBottomLeftRadius: endsSuperset ? 10 : 0,
                            borderBottomRightRadius: endsSuperset ? 10 : 0,
                          }
                        : null
                    }
                  >
                    {startsSuperset ? (
                      <Text
                        style={{
                          fontFamily: fonts.sansBold,
                          fontSize: 10,
                          letterSpacing: 1.1,
                          color: "#b23a22",
                          paddingHorizontal: 14,
                          paddingTop: 11,
                        }}
                      >
                        SUPERSET {letters[row.supersetGroupId]}
                      </Text>
                    ) : null}
                    <ExerciseRow
                      row={row}
                      supersetLetter={null}
                      showSupersetHeader={startsSuperset}
                      inSuperset={inSuperset}
                    />
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
