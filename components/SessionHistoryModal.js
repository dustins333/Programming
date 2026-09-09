import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listLogsForDate } from "../lib/programming/memberPlan";
import { getLiftPhotoSignedUrls } from "../lib/programming/liftPhotos";
import { LiftPhotoViewer } from "./LiftPhotoViewer";
import { PressFade } from "./PressFade";
import { formatDateMDY } from "../lib/formatDate";
import { fonts, colors } from "../lib/theme";
import { formatWeight } from "../lib/programming/setLabels";

const CARD_BORDER = "#ece7e1";
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2 };

// Groups a date's flat log rows by exercise — a session row on My History's
// "By Day" view maps to a whole calendar date's worth of logs (session
// completions don't themselves store per-exercise/per-set data), so this
// popup shows every exercise logged that date rather than trying to
// reconstruct one specific session's exact exercise list.
function groupByExercise(logs) {
  const groups = [];
  const byExercise = new Map();
  for (const row of logs) {
    if (!byExercise.has(row.exercise_id)) {
      const group = { exerciseId: row.exercise_id, name: row.exercises?.name ?? "Exercise", sets: [], notes: null };
      byExercise.set(row.exercise_id, group);
      groups.push(group);
    }
    const group = byExercise.get(row.exercise_id);
    group.sets.push(row);
    if (!group.notes && row.notes) group.notes = row.notes;
  }
  return groups;
}

// Photos hang off (user, exercise, date), so they slot straight onto the
// group for the lift they were taken on. A photo whose lift has no logs that
// day -- she photographed the setup and then cleared her sets -- gets its own
// card rather than being dropped, which would be a photo silently going
// nowhere.
function mergePhotos(groups, photos) {
  if (!photos?.length) return groups;
  const out = groups.map((g) => ({ ...g, photos: [] }));
  const outBy = new Map(out.map((g) => [g.exerciseId, g]));
  for (const photo of photos) {
    let group = outBy.get(photo.exercise_id);
    if (!group) {
      group = { exerciseId: photo.exercise_id, name: photo.exercises?.name ?? "Exercise", sets: [], notes: null, photos: [] };
      outBy.set(photo.exercise_id, group);
      out.push(group);
    }
    group.photos.push(photo);
  }
  return out;
}

// Bottom-sheet popup for a My History "By Day" session row — reads the
// house style set by SessionDetailModal (rounded top corners, canvas bg,
// scrim backdrop) but is self-contained rather than reusing SessionLogger,
// since it only has a date + label to work from, not a full workout
// prescription (exercises/warmups/source) the way plan-block.js's caller does.
export function SessionHistoryModal({ visible, onClose, title, date, userId, photos = [] }) {
  const [logs, setLogs] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [urls, setUrls] = useState({});
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setLogs(null);
    setLoadError(null);
    listLogsForDate(userId, date)
      .then(setLogs)
      .catch((err) => setLoadError(err.message ?? String(err)));
  }, [visible, userId, date]);

  // Signed when the popup opens, not when the timeline loads: a signed url
  // lasts five minutes, so signing every photo up front would hand back dead
  // links by the time she scrolled down and tapped one. Its own catch -- a
  // thumbnail that won't load must not take the whole session popup with it.
  const photoKey = photos.map((p) => p.id).join(",");
  useEffect(() => {
    if (!visible || !photos.length) return;
    let live = true;
    getLiftPhotoSignedUrls(photos.map((p) => p.storage_path))
      .then((map) => live && setUrls(map))
      .catch(() => live && setUrls({}));
    return () => {
      live = false;
    };
  }, [visible, photoKey]);

  const groups = logs ? mergePhotos(groupByExercise(logs), photos) : [];

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
            paddingTop: 22,
            paddingHorizontal: 20,
            paddingBottom: 24,
          }}
        >
          <View className="mb-3 flex-row items-start justify-between gap-2.5">
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: "#44403c", lineHeight: 23 }}>{title}</Text>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#4d6142" }}>{formatDateMDY(date)}</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="items-center justify-center"
              style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#e7e5e4", flexShrink: 0 }}
            >
              <Text style={{ color: "#a8a29e", fontSize: 15 }}>×</Text>
            </Pressable>
          </View>

          {loadError ? (
            <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
              Something went wrong loading this session: {loadError}
            </Text>
          ) : !logs ? (
            <View className="items-center py-8">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ gap: 10 }}>
              {groups.length === 0 ? (
                <Text className="py-3 text-center text-sm" style={{ fontFamily: fonts.sans, color: colors.muted }}>
                  Nothing logged for this session.
                </Text>
              ) : (
                groups.map((group) => (
                  <View
                    key={group.exerciseId}
                    className="mb-2.5 rounded-2xl bg-white px-4 py-3.5"
                    style={{ borderWidth: 1, borderColor: CARD_BORDER, ...CARD_SHADOW }}
                  >
                    <Text className="mb-1.5" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>
                      {group.name}
                    </Text>
                    {group.sets.map((s) => (
                      <Text key={s.id} style={{ fontFamily: fonts.sans, fontSize: 14, color: "#57534e", marginTop: 2 }}>
                        Set {s.set_number}: {s.reps ?? "–"} reps{formatWeight(s.weight) ? ` @ ${formatWeight(s.weight)}` : ""}
                      </Text>
                    ))}
                    {group.notes ? (
                      <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted, marginTop: 6, fontStyle: "italic" }}>
                        {group.notes}
                      </Text>
                    ) : null}
                    {group.photos?.length ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                        {group.photos.map((photo) => (
                          <PressFade
                            key={photo.id}
                            onPress={() => setViewing(group.photos)}
                            accessibilityLabel={`View the photo from ${group.name}`}
                            style={{
                              width: 58,
                              height: 58,
                              borderRadius: 10,
                              overflow: "hidden",
                              backgroundColor: "#fdf6f2",
                              borderWidth: 1,
                              borderColor: "#f0ddd2",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {urls[photo.storage_path] ? (
                              <Image source={{ uri: urls[photo.storage_path] }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                            ) : (
                              <Ionicons name="camera-outline" size={18} color={colors.primaryOnWhite} />
                            )}
                          </PressFade>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>

      {viewing ? <LiftPhotoViewer photos={viewing} onClose={() => setViewing(null)} onDeleted={() => setViewing(null)} /> : null}
    </Modal>
  );
}
