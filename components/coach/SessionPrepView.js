import { View, Text, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { toastError } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";

// One session, as a coach reads it on Coach Prep: the overview and the
// education for it in one column rather than two screens. Split out of the
// route so it can be rendered against fixed data and actually looked at.
//
// Purely presentational — every prop is already resolved by the page.

const CARD_BORDER = "#ece7e1";

export function prescriptionLine(ex) {
  const scheme = ex.rep_scheme?.length ? ex.rep_scheme : null;
  if (scheme) {
    const unique = [...new Set(scheme.map((r) => (r ?? "").trim()))];
    return `${scheme.length} × ${unique.length === 1 ? unique[0] || "–" : scheme.join(", ")}`;
  }
  return `${ex.sets ?? "–"} × ${ex.reps || "–"}`;
}

// Local rather than imported from SessionBuilderParts — that module pulls in
// dnd-kit, which has no business in a file the native bundle also loads.
export function supersetLetters(exercises) {
  const letters = {};
  let next = 0;
  for (const e of exercises) {
    if (!e.superset_group_id || e.superset_group_id in letters) continue;
    letters[e.superset_group_id] = String.fromCharCode(65 + next);
    next += 1;
  }
  return letters;
}

export function PrepEyebrow({ children, style }) {
  return (
    <Text
      maxFontSizeMultiplier={1.2}
      style={[{ fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1.1, color: "#6f6862" }, style]}
    >
      {children}
    </Text>
  );
}

function openVideo(url) {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return;
  // A coach pasting "youtu.be/…" out of a phone share sheet is the common
  // case, and Linking flatly refuses a URL with no scheme.
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  Linking.openURL(href).catch((err) => toastError("Couldn't open that link", err));
}

function EducationCard({ item, isWarmup }) {
  // scope only means anything when there's no exercise on the row — see
  // migration 0080.
  const generalWarmup = !item.exercise_id && item.scope === "warmup";
  const heading = item.exercises?.name ?? (generalWarmup ? "The whole warm-up" : "Whole session");
  const notes = (item.notes ?? "").trim();
  const video = (item.video_url ?? "").trim();
  return (
    <View
      style={{
        backgroundColor: "#fdf6f2",
        borderWidth: 1,
        borderColor: "#f0ddd2",
        borderRadius: 14,
        padding: 14,
        marginTop: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: colors.primaryOnWhite }}>
          {heading}
        </Text>
        {/* Which half of the session this belongs to — a warm-up name on its
            own reads like a lift you can't find in the list above. A general
            warm-up card says so in its own heading, so it needs no chip. */}
        {isWarmup && !generalWarmup ? (
          <View style={{ borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e0b6a5" }}>
            <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.7, color: colors.primaryOnWhite }}>
              WARM-UP
            </Text>
          </View>
        ) : null}
      </View>
      {notes ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: "#44403c", marginTop: 7 }}>{notes}</Text>
      ) : null}
      {video ? (
        <PressFade
          onPress={() => openVideo(video)}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 11, alignSelf: "flex-start" }}
        >
          <Ionicons name="play-circle" size={19} color={colors.primary} />
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.primaryOnWhite }}>Watch video ›</Text>
        </PressFade>
      ) : null}
    </View>
  );
}

export function SessionPrepView({ workout, exercises, warmups, education, weeks, warmupExerciseIds }) {
  const letters = supersetLetters(exercises);
  const published = workout.status === "published";
  return (
    <>
      <View
        style={{
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: CARD_BORDER,
          borderRadius: 16,
          padding: 16,
          marginTop: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Text style={{ flexShrink: 1, fontFamily: fonts.display, fontSize: 21, color: "#2a211c" }}>
            {workout.title || `Session ${workout.session_number}`}
          </Text>
          {/* A coach previewing needs to know this hasn't gone out yet —
              exactly the thing the member view hides. */}
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 3,
              backgroundColor: published ? "#eef1e7" : "#fdf1ea",
              borderWidth: 1,
              borderColor: published ? "#4d6142" : "#e0b6a5",
            }}
          >
            <Text
              maxFontSizeMultiplier={1.15}
              style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 0.8, color: published ? "#4d6142" : "#b23a22" }}
            >
              {published ? "PUBLISHED" : "DRAFT"}
            </Text>
          </View>
        </View>
        {/* Named, not left implicit: the lifts are the session's, but the
            sets and reps on screen belong to one specific week. */}
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#6f6862", marginTop: 4 }}>
          Showing week {workout.week_number} of {weeks}
        </Text>

        {warmups.length > 0 ? (
          <View style={{ marginTop: 16 }}>
            <PrepEyebrow>WARM-UP</PrepEyebrow>
            {warmups.map((w, i) => (
              <View key={w.id ?? `${w.position}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 5 }}>
                <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 14, color: "#44403c" }}>
                  {w.exercises?.name ?? w.label ?? "Warm-up"}
                </Text>
                {w.sets || w.reps ? (
                  <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#6f6862" }}>
                    {w.sets ?? "–"} × {w.reps || "–"}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ marginTop: warmups.length > 0 ? 18 : 16 }}>
          <PrepEyebrow>LIFTS · {exercises.length}</PrepEyebrow>
          {exercises.length === 0 ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: "#6f6862", marginTop: 6 }}>
              Nothing programmed for this session yet.
            </Text>
          ) : (
            exercises.map((ex, i) => {
              const letter = ex.superset_group_id ? letters[ex.superset_group_id] : null;
              return (
                <View
                  key={ex.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingVertical: 9,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: "#f4f1ec",
                  }}
                >
                  <Text maxFontSizeMultiplier={1.1} style={{ width: 20, fontFamily: fonts.sansBold, fontSize: 12, color: "#c9c4bd" }}>
                    {i + 1}
                  </Text>
                  <Text style={{ flexShrink: 1, fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: "#2a211c" }}>
                    {ex.exercises?.name ?? "Exercise"}
                  </Text>
                  {/* The pairing gets its own mark rather than replacing the
                      ordinal — 1 / A / A / 4 down the left reads as a hole in
                      the numbering, not as a superset. */}
                  {letter ? (
                    <View style={{ borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: "#fdf1ea", borderWidth: 1, borderColor: "#e0b6a5" }}>
                      <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 10, color: colors.primaryOnWhite }}>
                        {letter}
                      </Text>
                    </View>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: "#6f6862" }}>{prescriptionLine(ex)}</Text>
                </View>
              );
            })
          )}
        </View>
      </View>

      <View style={{ marginTop: 22 }}>
        <PrepEyebrow>COACH EDUCATION</PrepEyebrow>
        {education.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: "#6f6862", marginTop: 7 }}>
            Nothing written for this session. Not every session needs it.
          </Text>
        ) : (
          education.map((item) => (
            <EducationCard key={item.id} item={item} isWarmup={Boolean(item.exercise_id && warmupExerciseIds?.has(item.exercise_id))} />
          ))
        )}
      </View>
    </>
  );
}
