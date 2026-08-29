import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { fonts, colors } from "../lib/theme";
import { formatDateRange } from "../lib/formatDate";
import { useBlockMondays } from "../lib/programming/useBlockMondays";
import { countLoggedSetsForBlock } from "../lib/programming/spcBlocks";
import { MondayPicker } from "./MondayPicker";

// Sliding a LIVE block to a different Monday — the thing a coach had to phone
// an admin about, because publishSpcBlock() wrote the dates once and nothing
// touched them again.
//
// The lock is checked when this OPENS rather than on submit: finding out you
// can't move it only after picking a date is a dead end, and the count is one
// indexed query. moveSpcBlock() re-checks server-side regardless — this is the
// courtesy, not the guard.
export function MoveSpcBlockModal({
  visible,
  block,
  blockLabel,
  clientName,
  existingBlocks = [],
  onClose,
  onSubmit,
}) {
  const lengthWeeks = block?.block_length_weeks ?? 1;
  const { startDate, setStartDate, takenMondays, blockedMondays, overlaps, endDate } = useBlockMondays({
    visible,
    lengthWeeks,
    existingBlocks,
    excludeBlockId: block?.id ?? null,
    initialStart: block?.block_start_date ?? null,
  });

  const [logged, setLogged] = useState(null); // null = still checking
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible || !block?.id) return;
    let cancelled = false;
    setLogged(null);
    setError(null);
    countLoggedSetsForBlock(block.id)
      .then((n) => !cancelled && setLogged(n))
      // A failed count must not present the block as movable — moveSpcBlock
      // would refuse anyway, but the dialog shouldn't promise something first.
      .catch(() => !cancelled && setLogged(-1));
    return () => {
      cancelled = true;
    };
  }, [visible, block?.id]);

  const checking = logged === null;
  const lockFailed = logged === -1;
  const locked = lockFailed || logged > 0;
  const unchanged = startDate === block?.block_start_date;

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(startDate);
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!block) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="max-h-[88vh] w-full max-w-md rounded-2xl bg-white p-6">
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 19 }} className="mb-1">
              Move this block
            </Text>
            <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
              {blockLabel} · {lengthWeeks} week{lengthWeeks === 1 ? "" : "s"} · currently{" "}
              {formatDateRange(block.block_start_date, block.block_end_date)}
            </Text>

            {checking ? (
              <View className="mb-4 flex-row items-center gap-2.5 rounded-xl p-4" style={{ backgroundColor: "#faf8f6" }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
                  Checking whether she's trained in it yet…
                </Text>
              </View>
            ) : locked ? (
              <View className="mb-4 rounded-xl p-4" style={{ borderWidth: 1, borderColor: "#f2d9d2", backgroundColor: "#fcf1ee" }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#a5432c" }}>
                  {lockFailed ? "Couldn't check this block" : "These dates are fixed"}
                </Text>
                <Text className="mt-1 text-stone-600" style={{ fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
                  {lockFailed
                    ? "Something went wrong reading her logged sets, so this can't be moved safely right now. Try again in a moment."
                    : `${clientName || "She"} has already logged ${logged} set${logged === 1 ? "" : "s"} in this block. Moving it would slide her finished sessions into different weeks, so a block locks once she's trained in it.`}
                </Text>
              </View>
            ) : (
              <>
                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                  Starts
                </Text>
                <Text className="mb-2 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Blocks run Monday to Sunday, so only Mondays can be picked. Greyed weeks already have a block.
                </Text>
                <View className="items-center">
                  {/* Keyed on `visible` so it remounts each time — MondayPicker
                      seeds its opening month on first render only. */}
                  <MondayPicker
                    key={visible ? "open" : "closed"}
                    value={startDate}
                    onChange={setStartDate}
                    markedDates={takenMondays}
                    disabledDates={blockedMondays}
                  />
                </View>
                <Text
                  className="mt-2 text-xs"
                  style={{ fontFamily: fonts.sansMedium, color: overlaps ? "#b23a22" : "#57534e" }}
                >
                  {overlaps
                    ? "That would run into another of her blocks — pick a different Monday."
                    : unchanged
                      ? "That's where it already starts."
                      : `Would run ${formatDateRange(startDate, endDate)}`}
                </Text>
              </>
            )}

            {error ? (
              <Text className="mt-3 text-xs" style={{ fontFamily: fonts.sansMedium, color: "#b23a22" }}>
                {error}
              </Text>
            ) : null}
          </ScrollView>

          <View className="mt-5 flex-row justify-end gap-2.5">
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-2.5">
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13 }}>{locked ? "Close" : "Cancel"}</Text>
            </Pressable>
            {!locked && !checking ? (
              <Pressable
                onPress={handleSubmit}
                disabled={saving || overlaps || unchanged}
                style={{ opacity: saving || overlaps || unchanged ? 0.5 : 1, backgroundColor: colors.primary }}
                className="rounded-lg px-4 py-2.5"
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>
                  {saving ? "Moving…" : "Move block"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
