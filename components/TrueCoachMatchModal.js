import { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, Pressable, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import {
  listMyTrueCoachImports,
  linkTrueCoachImport,
  unlinkTrueCoachImport,
  describeImport,
} from "../lib/programming/truecoachImports";
import { confirmMoveTrueCoachImport, confirmUnlinkTrueCoachImport } from "../lib/confirmDialog";
import { toastError, toastSuccess } from "../lib/toast";
import { fonts, colors } from "../lib/theme";

// The member picks which of HER OWN TrueCoach lifts are this Kova lift.
// Multi-select is the point, not a nicety: names drift over years ("DB
// bench" and "Dumbbell Bench Press" may both be today's lift). Nothing is
// pre-selected and nothing is suggested beyond ordering — see the exercise-
// merge detector's history for why (35 false pairs out of 83 real exercises).
//
// Rows already linked to a DIFFERENT lift are shown, marked, and pickable:
// picking one is a move, confirmed by naming both lifts. Rows already linked
// to THIS lift sit at the top with an Unlink action — that's the per-lift
// "manage" affordance, and it lives here so a wrong match gets fixed where it
// gets noticed.
const CARD_BORDER = "#ece7e1";
const OLIVE = "#4d6142";
const OLIVE_BG = "#eef1e7";
const PEACH_BG = "#fdf6f2";
const PEACH_BORDER = "#f0ddd2";

// Ordering only. Word overlap with the Kova lift's name floats likely rows
// up; it never selects anything.
function similarity(a, b) {
  const words = (s) => new Set(String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1));
  const wa = words(a);
  const wb = words(b);
  let n = 0;
  for (const w of wa) if (wb.has(w)) n += 1;
  return n;
}

// fetchImports is a seam for previewing with fake rows (zz-harness); real
// callers leave it defaulted.
export function TrueCoachMatchModal({ visible, onClose, userId, exerciseId, exerciseName, onChanged, fetchImports = listMyTrueCoachImports }) {
  const [imports, setImports] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!visible || !userId) return;
    let cancelled = false;
    setImports(null);
    setLoadError(null);
    setSelected(new Set());
    setQuery("");
    fetchImports(userId)
      .then((rows) => {
        if (!cancelled) setImports(rows);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message ?? String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [visible, userId, retryKey]);

  const rows = useMemo(() => {
    if (!imports) return [];
    const q = query.trim().toLowerCase();
    const filtered = q ? imports.filter((i) => i.lift_name.toLowerCase().includes(q)) : imports;
    // linked-here first, then unlinked (most similar first), then linked elsewhere
    const rank = (i) => (i.linked_exercise_id === exerciseId ? 0 : i.linked_exercise_id ? 2 : 1);
    return [...filtered].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      const s = similarity(b.lift_name, exerciseName) - similarity(a.lift_name, exerciseName);
      if (s !== 0) return s;
      return a.lift_name.localeCompare(b.lift_name);
    });
  }, [imports, query, exerciseId, exerciseName]);

  const toggle = async (imp) => {
    if (busy) return;
    if (selected.has(imp.id)) {
      const next = new Set(selected);
      next.delete(imp.id);
      setSelected(next);
      return;
    }
    if (imp.linked_exercise_id && imp.linked_exercise_id !== exerciseId) {
      const ok = await confirmMoveTrueCoachImport(imp.lift_name, imp.session_count, imp.exercises?.name ?? "another lift", exerciseName);
      if (!ok) return;
    }
    const next = new Set(selected);
    next.add(imp.id);
    setSelected(next);
  };

  const commit = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    let done = 0;
    let failed = null;
    for (const id of selected) {
      try {
        await linkTrueCoachImport(id, exerciseId);
        done += 1;
      } catch (err) {
        failed = err;
        break;
      }
    }
    setBusy(false);
    if (failed) {
      toastError(done > 0 ? `Matched ${done}, then one failed` : "Couldn't match that lift", failed);
      // keep the sheet open with whatever's left still selected
      const remaining = new Set(selected);
      // the ones that succeeded are no longer selectable-as-unlinked; refetch
      setSelected(remaining);
      setRetryKey((k) => k + 1);
      onChanged?.();
      return;
    }
    toastSuccess(done === 1 ? "TrueCoach history matched" : `${done} TrueCoach lifts matched`);
    onChanged?.();
    onClose?.();
  };

  const unlink = async (imp) => {
    if (busy) return;
    const ok = await confirmUnlinkTrueCoachImport(imp.lift_name, exerciseName);
    if (!ok) return;
    setBusy(true);
    try {
      await unlinkTrueCoachImport(imp.id);
      toastSuccess(`"${imp.lift_name}" removed`);
      setRetryKey((k) => k + 1);
      onChanged?.();
    } catch (err) {
      toastError("Couldn't remove that match", err);
    } finally {
      setBusy(false);
    }
  };

  const linkedHere = rows.filter((i) => i.linked_exercise_id === exerciseId).length;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(68,64,60,0.35)" }}>
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              maxHeight: "88%",
              width: "100%",
              backgroundColor: colors.canvas,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              paddingTop: 10,
              paddingHorizontal: 20,
              paddingBottom: 20,
              overflow: "hidden",
            }}
          >
            <View style={{ alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "#e0dbd4", marginBottom: 14 }} />

            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 22, color: "#44403c", lineHeight: 27 }}>Match TrueCoach data</Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted, marginTop: 2 }} numberOfLines={3}>
                  Pick the TrueCoach lifts that are <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{exerciseName}</Text>. Names may differ — choose every one that matches.
                </Text>
              </View>
              <PressFade onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close" style={{ minHeight: 44, justifyContent: "center", flexShrink: 0 }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: colors.primaryOnWhite }}>Done</Text>
              </PressFade>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, marginTop: 8, marginBottom: 10 }}>
              <Ionicons name="search-outline" size={17} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search your TrueCoach lifts"
                placeholderTextColor="#b5afa6"
                autoCorrect={false}
                autoCapitalize="none"
                style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15, color: "#44403c", paddingVertical: 8 }}
              />
              {query ? (
                <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                  <Ionicons name="close-circle" size={17} color="#b5afa6" />
                </Pressable>
              ) : null}
            </View>

            {loadError ? (
              <View style={{ alignItems: "center", paddingVertical: 28 }}>
                <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22", marginBottom: 10, textAlign: "center" }}>Couldn't load your TrueCoach lifts.</Text>
                <Pressable onPress={() => setRetryKey((k) => k + 1)} hitSlop={8}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Try again</Text>
                </Pressable>
              </View>
            ) : !imports ? (
              <View style={{ alignItems: "center", paddingVertical: 28 }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <FlatList
                data={rows}
                keyExtractor={(i) => i.id}
                keyboardShouldPersistTaps="handled"
                style={{ flexShrink: 1 }}
                ListEmptyComponent={
                  <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: colors.muted, textAlign: "center", paddingVertical: 24 }}>
                    {imports.length === 0 ? "No TrueCoach lifts on file for you." : "No TrueCoach lifts match that search."}
                  </Text>
                }
                renderItem={({ item: imp }) => {
                  const here = imp.linked_exercise_id === exerciseId;
                  const elsewhere = Boolean(imp.linked_exercise_id) && !here;
                  const on = selected.has(imp.id);
                  return (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        backgroundColor: here ? OLIVE_BG : on ? PEACH_BG : "#fff",
                        borderWidth: on ? 1.5 : 1,
                        borderColor: here ? "#dbe8cf" : on ? colors.primary : CARD_BORDER,
                        borderRadius: 14,
                        paddingHorizontal: 12,
                        paddingVertical: 11,
                        marginBottom: 8,
                      }}
                    >
                      {here ? (
                        <Ionicons name="checkmark-circle" size={26} color={OLIVE} />
                      ) : (
                        <Pressable onPress={() => toggle(imp)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`Select ${imp.lift_name}`}>
                          <Ionicons name={on ? "checkmark-circle" : "ellipse-outline"} size={26} color={on ? colors.primary : "#b5afa6"} />
                        </Pressable>
                      )}
                      <Pressable onPress={() => (here ? null : toggle(imp))} style={{ flex: 1, minWidth: 0 }} disabled={here}>
                        <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#44403c" }}>{imp.lift_name}</Text>
                        <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted, marginTop: 2 }}>{describeImport(imp)}</Text>
                        {elsewhere ? (
                          <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite, marginTop: 3 }}>
                            Linked to {imp.exercises?.name ?? "another lift"}{on ? " · will move here" : ""}
                          </Text>
                        ) : null}
                      </Pressable>
                      {here ? (
                        <Pressable onPress={() => unlink(imp)} hitSlop={8} disabled={busy} style={{ opacity: busy ? 0.5 : 1, paddingHorizontal: 4, minHeight: 44, justifyContent: "center" }}>
                          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>Unlink</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                }}
                ListHeaderComponent={
                  linkedHere > 0 ? (
                    <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginBottom: 8 }}>
                      {linkedHere === 1 ? "1 TrueCoach lift already feeds this history." : `${linkedHere} TrueCoach lifts already feed this history.`}
                    </Text>
                  ) : null
                }
              />
            )}

            <PressFade
              onPress={commit}
              disabled={selected.size === 0 || busy}
              accessibilityLabel="Confirm match"
              style={{
                opacity: selected.size === 0 || busy ? 0.5 : 1,
                marginTop: 12,
                minHeight: 48,
                borderRadius: 14,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : null}
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#fff" }}>
                {selected.size === 0 ? "Select the matching lifts" : selected.size === 1 ? "Match 1 lift" : `Match ${selected.size} lifts`}
              </Text>
            </PressFade>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
