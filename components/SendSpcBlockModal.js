import { useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { fonts, colors } from "../lib/theme";
import { formatDateRange } from "../lib/formatDate";
import { useBlockMondays } from "../lib/programming/useBlockMondays";
import { MondayPicker } from "./MondayPicker";

// Sending a draft SPC block to the client (0089). This is the one moment a
// block gets a date, and it is the same date-picking language the group New
// block dialog already uses: Mondays only, weeks that already have a block
// greyed out, and the resulting range spelled underneath.
//
// The point of doing it HERE rather than at creation is that the coach picks
// the date knowing the block is finished. Before this, the date was decided
// the instant she clicked "Build next block" and the clock started on week 1
// while she was still writing it.

export function SendSpcBlockModal({
  visible,
  clientName,
  blockLabel,
  lengthWeeks,
  // Every session in the block, in the shape getSpcBlockDetail returns.
  sessions = [],
  // This client's other blocks — only the scheduled ones can be collided
  // with, so drafts are filtered out here rather than at every call site.
  existingBlocks = [],
  onClose,
  onSubmit,
}) {
  const [saving, setSaving] = useState(false);

  // Opens on the first Monday from this week on that the block actually fits
  // — for a client mid-block that's the Monday after hers ends. A starting
  // point, not a rail: every other free Monday is one tap away, which is the
  // whole reason a new client's first block no longer has to start the day the
  // coach happened to create it.
  const { startDate, setStartDate, takenMondays, blockedMondays, overlaps, endDate } = useBlockMondays({
    visible,
    lengthWeeks,
    existingBlocks,
  });

  const withLifts = sessions.filter((s) => (s.lifts?.length ?? 0) > 0);
  const empty = sessions.length - withLifts.length;
  const week1 = sessions
    .filter((s) => s.week_number === 1)
    .sort((a, b) => a.session_number - b.session_number);

  const nothingToSend = withLifts.length === 0;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit(startDate);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="max-h-[88vh] w-full max-w-md rounded-2xl bg-white p-6">
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 19 }} className="mb-1">
              Send this block
            </Text>
            <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
              {blockLabel} · {lengthWeeks} week{lengthWeeks === 1 ? "" : "s"} · goes to {clientName || "your client"} the
              moment you send it.
            </Text>

            {/* What she'll actually get. Week 1 by name, because since 0016
                every week of an SPC block is its own session list and there
                is no single list that represents the block. */}
            <View
              className="mb-4 rounded-xl p-4"
              style={{ borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "#fdf6f2" }}
            >
              <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
                Week 1
              </Text>
              {week1.length > 0 ? (
                week1.map((s) => (
                  <Text
                    key={s.id}
                    className="text-stone-600"
                    style={{ fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 18 }}
                  >
                    Session {s.session_number}
                    {s.title ? ` · ${s.title}` : ""}:{" "}
                    {s.lifts?.length
                      ? s.lifts.map((l) => l.exercises?.name).filter(Boolean).join(", ")
                      : "nothing programmed"}
                  </Text>
                ))
              ) : (
                <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
                  Nothing in week 1 yet.
                </Text>
              )}

              <Text className="mt-3" style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: empty > 0 ? "#b23a22" : "#4d6142" }}>
                {withLifts.length} of {sessions.length} sessions have lifts
                {empty > 0 ? ` · ${empty} empty, and those stay hidden until you fill them in` : " · all of them go out"}
              </Text>
            </View>

            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Starts
            </Text>
            <Text className="mb-2 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              Blocks run Monday to Sunday, so only Mondays can be picked. Greyed weeks already have a block.
            </Text>
            <View className="items-center">
              {/* Keyed on `visible` so it remounts each time the dialog opens
                  — MondayPicker seeds its opening month on first render only,
                  so without this it sits on whatever month was last viewed. */}
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
                ? "That would run into a block she already has — pick a later Monday."
                : `Runs ${formatDateRange(startDate, endDate)}`}
            </Text>
          </ScrollView>

          <View className="mt-5 flex-row justify-end gap-2.5">
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-2.5">
              <Text className="text-stone-600" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                Not yet
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving || overlaps || nothingToSend}
              className="rounded-lg px-[18px] py-2.5"
              style={{ opacity: saving || overlaps || nothingToSend ? 0.5 : 1, backgroundColor: colors.primary }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansBold, fontSize: 13 }}>
                {saving ? "Sending…" : nothingToSend ? "Nothing to send yet" : "Send to client"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
