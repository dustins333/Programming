import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ActivityIndicator } from "react-native";
import { fonts, colors } from "../lib/theme";
import { listSpcWorkoutsForBlock } from "../lib/programming/spcBlocks";
import { formatDateMDY } from "../lib/formatDate";

// The SPC client page's "Print block" button: two steps — which block
// (newest at the top), then which session — then the caller opens the print
// view for that block+session. `blocks` is the page's already-labelled,
// newest-first list; sessions are fetched here for whichever block gets
// picked, since the page only ever holds the selected block's detail.
export function PrintBlockPickerModal({ visible, blocks, onClose, onPick }) {
  const [block, setBlock] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible) {
      setBlock(null);
      setSessions(null);
      setError(null);
    }
  }, [visible]);

  const chooseBlock = async (b) => {
    setBlock(b);
    setSessions(null);
    setError(null);
    try {
      const rows = await listSpcWorkoutsForBlock(b.id);
      setSessions([...new Set(rows.map((w) => w.session_number))].sort((x, y) => x - y));
    } catch (err) {
      setError(err.message ?? String(err));
    }
  };

  const step = block ? "session" : "block";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-sm rounded-2xl bg-white p-6">
          <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 19 }} className="mb-1">
            {step === "block" ? "Print which block?" : `${block.label} — which session?`}
          </Text>
          <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
            {step === "block"
              ? "Newest first."
              : "Opens in a new tab and brings up the print dialog — Save as PDF from there."}
          </Text>

          {step === "block" ? (
            blocks.length === 0 ? (
              <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
                No blocks yet.
              </Text>
            ) : (
              <View className="gap-2.5">
                {blocks.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => chooseBlock(b)}
                    className="rounded-xl border px-4 py-3"
                    style={{ borderColor: "#ece7e1" }}
                  >
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
                      {b.label}
                    </Text>
                    <Text style={{ fontFamily: fonts.sans, fontSize: 12 }} className="text-stone-500">
                      {formatDateMDY(b.block_start_date)} – {formatDateMDY(b.block_end_date)} · {b.block_length_weeks} wk
                    </Text>
                  </Pressable>
                ))}
              </View>
            )
          ) : error ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22" }}>{error}</Text>
          ) : !sessions ? (
            <ActivityIndicator color={colors.primary} />
          ) : sessions.length === 0 ? (
            <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
              This block has no sessions yet.
            </Text>
          ) : (
            <View className="gap-2.5">
              {sessions.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => onPick(block, n)}
                  className="rounded-xl border px-4 py-3.5"
                  style={{ borderColor: "#ece7e1" }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
                    Session {n}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View className="mt-5 flex-row justify-end gap-2">
            {step === "session" ? (
              <Pressable onPress={() => setBlock(null)} className="rounded-lg border border-stone-300 px-4 py-2.5">
                <Text className="text-stone-600" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                  ‹ Blocks
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-2.5">
              <Text className="text-stone-600" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
