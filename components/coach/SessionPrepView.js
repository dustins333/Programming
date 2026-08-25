import { useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { toastError } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";
import { liftLabelsFor, warmupNumbersFor } from "../../lib/programming/sessionLabels";

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

function EducationCard({ item, first, expanded, onToggle }) {
  const generalWarmup = !item.exercise_id && item.scope === "warmup";
  const heading = item.exercises?.name ?? (generalWarmup ? "Warm-up notes" : "General");
  const notes = (item.notes ?? "").trim();
  const videos = (item.video_urls ?? []).map((u) => (u ?? "").trim()).filter(Boolean);

  return (
    <View
      style={{
        backgroundColor: "#fdf6f2",
        borderWidth: 1,
        borderColor: "#f0ddd2",
        borderRadius: 14,
        marginTop: first ? 0 : 8,
        overflow: "hidden",
      }}
    >
      <Pressable onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, paddingVertical: 11 }}>
        <Text
          maxFontSizeMultiplier={1.2}
          numberOfLines={1}
          style={{ flexShrink: 1, fontFamily: fonts.sansBold, fontSize: 14, color: colors.primaryOnWhite }}
        >
          {heading}
        </Text>
        <View style={{ flex: 1 }} />
        {videos.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
            <Ionicons name="videocam" size={14} color="#c08a76" />
            {videos.length > 1 ? (
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#c08a76" }}>{videos.length}</Text>
            ) : null}
          </View>
        ) : null}
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={15} color="#c08a76" />
      </Pressable>

      {expanded ? (
        <View style={{ paddingHorizontal: 13, paddingBottom: 13 }}>
          {notes ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: "#44403c" }}>{notes}</Text>
          ) : null}
          {/* Numbered only when there's more than one — "Video 1" on its own
              reads like there should be a second one somewhere. */}
          {videos.map((url, i) => (
            <PressFade
              key={i}
              onPress={() => openVideo(url)}
              hitSlop={8}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: i === 0 ? (notes ? 11 : 0) : 7,
                alignSelf: "flex-start",
              }}
            >
              <Ionicons name="play-circle" size={19} color={colors.primary} />
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: colors.primaryOnWhite }}>
                {videos.length > 1 ? `Video ${i + 1} ›` : "Watch video ›"}
              </Text>
            </PressFade>
          ))}
        </View>
      ) : (
        <Text
          numberOfLines={1}
          style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#8a7f77", paddingHorizontal: 13, paddingBottom: 11, marginTop: -4 }}
        >
          {notes || "Video only"}
        </Text>
      )}
    </View>
  );
}

// One block per part of the session, each with its own tinted header band.
//
// These used to be small grey eyebrows inside one white card, which read as a
// single continuous list — you could not tell at a glance where the warm-up
// stopped and the lifting started. Same two-tone treatment My Week's program
// cards use: the band is edge-to-edge via overflow:"hidden" on the rounded
// container rather than inset by the card's own padding, so it reads as a
// header rather than a highlighted first row.
function SectionCard({ title, count, children, style }) {
  return (
    <View
      style={[
        {
          backgroundColor: "#fff",
          borderWidth: 1,
          borderColor: CARD_BORDER,
          borderRadius: 16,
          overflow: "hidden",
          marginTop: 14,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          backgroundColor: "#f4f1ec",
          borderBottomWidth: 1,
          borderBottomColor: CARD_BORDER,
          paddingHorizontal: 14,
          paddingVertical: 9,
        }}
      >
        <Text
          maxFontSizeMultiplier={1.2}
          style={{ fontFamily: fonts.sansBold, fontSize: 11.5, letterSpacing: 1.1, color: "#57534e" }}
        >
          {title}
        </Text>
        {count != null ? (
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansBold, fontSize: 11.5, color: "#a8a29e" }}>
            {count}
          </Text>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>{children}</View>
    </View>
  );
}

// Same three groups, in the same order, as the builder's Coach Ed rail — a
// coach writes them grouped, so reading them ungrouped meant re-sorting the
// list in your head.
const EDU_SECTIONS = [
  { key: "session", label: "General" },
  { key: "warmup", label: "Warm-ups" },
  { key: "exercise", label: "Exercises" },
];

export function SessionPrepView({ workout, exercises, warmups, education, weeks, warmupExerciseIds }) {
  // The shared labeling language (lib/programming/sessionLabels.js): lifts
  // lettered with superset members numbered within their letter (A, B1+B2, C),
  // warm-ups numbered with superset members repeating the shared number —
  // matching the builders, the member logger, and the printed SPC sheet.
  const liftLabels = liftLabelsFor(exercises);
  const warmupNumbers = warmupNumbersFor(warmups);
  const published = workout.status === "published";
  // Single-open, matching the rail. Reading surface, so the collapsed row
  // carries the note's first line rather than just a title — you should be
  // able to skim the session's coaching without opening anything.
  const [openNoteId, setOpenNoteId] = useState(null);

  const eduKind = (item) => {
    if (!item.exercise_id) return item.scope === "warmup" ? "warmup" : "session";
    return warmupExerciseIds?.has(item.exercise_id) ? "warmup" : "exercise";
  };
  const eduBySection = { session: [], warmup: [], exercise: [] };
  for (const item of education) eduBySection[eduKind(item)].push(item);
  const eduSections = EDU_SECTIONS.filter((sec) => eduBySection[sec.key].length > 0);
  return (
    <>
      {/* The session's own heading sits outside the cards — it names what all
          three of them belong to, so boxing it would make it read as a fourth
          section rather than the thing above them. */}
      <View style={{ marginTop: 16 }}>
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
      </View>

      {warmups.length > 0 ? (
        <SectionCard title="WARM-UP" count={warmups.length}>
          {warmups.map((w, i) => (
            <View
              key={w.id ?? `${w.position}-${i}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                paddingVertical: 7,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: "#f4f1ec",
              }}
            >
              <Text maxFontSizeMultiplier={1.1} style={{ width: 20, fontFamily: fonts.sansBold, fontSize: 12, color: "#c9c4bd" }}>
                {warmupNumbers[i]}
              </Text>
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
        </SectionCard>
      ) : null}

      <SectionCard title="EXERCISES" count={exercises.length}>
        {exercises.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: "#6f6862" }}>
            Nothing programmed for this session yet.
          </Text>
        ) : (
          exercises.map((ex, i) => (
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
              {/* The label IS the superset mark now — B1/B2 share a letter,
                  same as the builder's circle and the member logger. */}
              <Text maxFontSizeMultiplier={1.1} style={{ width: 24, fontFamily: fonts.sansBold, fontSize: 12, color: "#c9c4bd" }}>
                {liftLabels[ex.id]}
              </Text>
              <Text style={{ flexShrink: 1, fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: "#2a211c" }}>
                {ex.exercises?.name ?? "Exercise"}
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: "#6f6862" }}>{prescriptionLine(ex)}</Text>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title="COACH EDUCATION" count={education.length || null}>
        {education.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, lineHeight: 20, color: "#6f6862" }}>
            Nothing written for this session. Not every session needs it.
          </Text>
        ) : (
          eduSections.map((sec, si) => (
            <View key={sec.key} style={{ marginTop: si === 0 ? 0 : 16 }}>
              {/* The group says which half of the session it belongs to, so
                  the per-card WARM-UP chip that used to do that job is gone. */}
              <Text
                maxFontSizeMultiplier={1.2}
                style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.9, color: "#a8a29e", marginBottom: 7 }}
              >
                {sec.label.toUpperCase()}
              </Text>
              {eduBySection[sec.key].map((item, i) => (
                <EducationCard
                  key={item.id}
                  item={item}
                  first={i === 0}
                  expanded={openNoteId === item.id}
                  onToggle={() => setOpenNoteId((prev) => (prev === item.id ? null : item.id))}
                />
              ))}
            </View>
          ))
        )}
      </SectionCard>
    </>
  );
}
