import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { fonts, colors } from "../lib/theme";
import { WeeksStepper } from "./WeeksStepper";

// Starting a block asks two questions and no more: copy the last one, or
// start blank, and how many weeks.
//
// There is deliberately NO start date here. Since 0089 a new SPC block is
// born as a DRAFT with no dates at all — nothing is scheduled, the client
// sees nothing, and the coach picks the Monday it starts when she sends it
// (SendSpcBlockModal). Before that, this dialog computed the date on the
// spot — day after the last block ended — which meant week 1 was already
// running while she was still writing it, and a client who got the block
// three days later had "missed" a week that was never visible to her.
export function NewSpcBlockChoiceModal({
  visible,
  clientName,
  latestBlockLabel,
  weeksAgo,
  preview,
  defaultLengthWeeks,
  lastBlockLengthWeeks,
  onClose,
  onSubmit,
}) {
  const [mode, setMode] = useState("blank");
  // Length is now the coach's call rather than implied by the mode. It
  // still SEEDS from what the mode used to force — the last block's own
  // length when copying, the program default when starting blank — so
  // leaving it alone reproduces the previous behaviour exactly.
  const [lengthWeeks, setLengthWeeks] = useState("");
  const [saving, setSaving] = useState(false);
  const hasLastBlock = Boolean(latestBlockLabel);
  const lengthValid = Number(lengthWeeks) >= 1;

  useEffect(() => {
    if (!visible) return;
    // Seeds from this client's most recent block whichever mode is picked —
    // "same as last time" is the right starting point for a blank block too,
    // not just a copied one. The gym-wide default (Settings → Defaults) is
    // only reached for a client's very first block. Matches how the group
    // block dialog seeds from that program's last block.
    const seed = hasLastBlock ? lastBlockLengthWeeks : defaultLengthWeeks;
    setLengthWeeks(String(seed ?? defaultLengthWeeks ?? 4));
  }, [visible, mode, hasLastBlock, lastBlockLengthWeeks, defaultLengthWeeks]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await onSubmit(hasLastBlock ? mode : "blank", Number(lengthWeeks));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-lg rounded-2xl bg-white p-6">
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 19 }} className="mb-1">
            Start a new block
          </Text>
          <Text className="mb-1 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
            {hasLastBlock ? `Reuse ${latestBlockLabel} as a starting point, or begin blank.` : "Nothing to copy yet — this will be a blank block."}
          </Text>
          <Text className="mb-4" style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
            This starts a draft. Nothing reaches {clientName || "your client"} until you send it, and you pick the start
            date then.
          </Text>

          <View className="flex-row gap-3.5">
            <Pressable
              onPress={() => hasLastBlock && setMode("copy")}
              disabled={!hasLastBlock}
              className="flex-1 rounded-xl p-4"
              style={{
                borderWidth: mode === "copy" && hasLastBlock ? 2 : 1,
                borderColor: mode === "copy" && hasLastBlock ? colors.primary : "#ece7e1",
                backgroundColor: mode === "copy" && hasLastBlock ? "#fdf6f2" : "white",
                opacity: hasLastBlock ? 1 : 0.5,
              }}
            >
              <View className="mb-2.5 flex-row items-center justify-between gap-2">
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5 }} className="text-stone-700">
                  Copy last block
                </Text>
                {hasLastBlock && (
                  <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: "white", borderWidth: 1, borderColor: "#e9d3c6" }}>
                    <Text style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite, fontSize: 11 }}>
                      {latestBlockLabel} · {weeksAgo === 0 ? "just ended" : `${weeksAgo} week${weeksAgo === 1 ? "" : "s"} ago`}
                    </Text>
                  </View>
                )}
              </View>
              {hasLastBlock ? (
                (preview ?? []).map((line) => (
                  <Text key={line.sessionNumber} className="text-stone-600" style={{ fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}>
                    Session {line.sessionNumber}: {line.names.length > 0 ? line.names.join(", ") : "no exercises yet"}
                  </Text>
                ))
              ) : (
                <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
                  No previous block for this client yet.
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => setMode("blank")}
              className="flex-1 rounded-xl p-4"
              style={{
                borderWidth: mode === "blank" || !hasLastBlock ? 2 : 1,
                borderColor: mode === "blank" || !hasLastBlock ? colors.primary : "#ece7e1",
                backgroundColor: mode === "blank" || !hasLastBlock ? "#fdf6f2" : "white",
              }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5 }} className="mb-1 text-stone-700">
                Start blank
              </Text>
              <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
                Write the whole block from scratch.
              </Text>
            </Pressable>
          </View>

          <View className="mt-5">
            <Text className="mb-1.5 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
              Length
            </Text>
            <WeeksStepper value={lengthWeeks} onChange={setLengthWeeks} />
          </View>

          <View className="mt-5 flex-row justify-end gap-2.5">
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-2.5">
              <Text className="text-stone-600" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable onPress={handleCreate} disabled={saving || !lengthValid} className="rounded-lg px-[18px] py-2.5" style={{ opacity: saving || !lengthValid ? 0.5 : 1, backgroundColor: colors.primary }}>
              <Text className="text-white" style={{ fontFamily: fonts.sansBold, fontSize: 13 }}>
                {saving ? "Creating…" : "Start draft"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
