import { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { todayInBoise, mondayOnOrBefore, addDays } from "../lib/boiseDate";
import { rangesOverlap } from "../lib/dateRange";
import { formatDateRange } from "../lib/formatDate";
import { WeeksStepper } from "./WeeksStepper";
import { MondayPicker } from "./MondayPicker";

// How far ahead the calendar knows about existing blocks. Every Monday past
// this is pickable, which is fine — createBlock still refuses a real overlap,
// and nobody schedules a block three years out.
const WINDOW_WEEKS = 160;

// Every Monday the calendar needs an answer for: from the earliest thing that
// matters (this week, or the start of the oldest block if that's further
// back, so past blocks still show as taken) forward.
function mondayWindow(blocks) {
  const thisMonday = mondayOnOrBefore(todayInBoise());
  const earliest = blocks.reduce((min, b) => (b.block_start_date < min ? b.block_start_date : min), thisMonday);
  const start = mondayOnOrBefore(earliest);
  return Array.from({ length: WINDOW_WEEKS }, (_, i) => addDays(start, i * 7));
}

export function NewBlockModal({
  visible,
  programs,
  // programId -> that program's existing blocks, so the calendar can show
  // which weeks are already spoken for.
  blocksByProgram = {},
  // Which program to open on — the grid's per-gap button names one.
  initialProgramId = null,
  lengthSeedByProgram = {},
  gymDefaultLength = 4,
  onClose,
  onSubmit,
}) {
  const [groupProgramId, setGroupProgramId] = useState(null);
  // A block always starts on a Monday so its weeks line up with calendar
  // weeks — the picker below only offers Mondays, and this seed is the
  // current week's, so a brand-new block covers today rather than leaving
  // the client with nothing until next week.
  const [startDate, setStartDate] = useState(mondayOnOrBefore(todayInBoise()));
  // Same copy-vs-blank choice NewSpcBlockChoiceModal already offers —
  // group blocks used to always be born empty, restarting every cycle's
  // programming from zero.
  const [copyFromLatest, setCopyFromLatest] = useState(true);
  // Seeded from the selected program's default but editable per block
  // (migration 0049) — a one-off longer cycle no longer means editing the
  // program's default and changing every future block along with it.
  const [lengthWeeks, setLengthWeeks] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedProgram = (programs ?? []).find((p) => p.id === groupProgramId) ?? null;

  useEffect(() => {
    if (visible) {
      setGroupProgramId(initialProgramId ?? programs?.[0]?.id ?? null);
      setCopyFromLatest(true);
    }
  }, [visible, programs, initialProgramId]);

  const blocks = useMemo(() => blocksByProgram[groupProgramId] ?? [], [blocksByProgram, groupProgramId]);
  const mondays = useMemo(() => mondayWindow(blocks), [blocks]);

  // Mondays sitting inside a block that already exists. These are what the
  // calendar marks — "this week already has a block" rather than a bare no.
  const takenMondays = useMemo(
    () => mondays.filter((m) => blocks.some((b) => b.block_start_date <= m && m <= b.block_end_date)),
    [mondays, blocks]
  );

  // Mondays a block of THIS length couldn't start on. A superset of the taken
  // ones: starting in a free week is still no good if the block would run
  // into the next one, which is why this recomputes as the length changes.
  const length = Number(lengthWeeks);
  const blockedMondays = useMemo(() => {
    if (!(length >= 1)) return takenMondays;
    return mondays.filter((m) =>
      blocks.some((b) => rangesOverlap(m, addDays(m, length * 7 - 1), b.block_start_date, b.block_end_date))
    );
  }, [mondays, blocks, length, takenMondays]);

  // Follows whichever program is selected, including a switch mid-dialog.
  //
  // Length seeds from that program's MOST RECENT block — "same as last time"
  // is what a coach wants nearly every time, and it stays right as a program's
  // typical cycle changes without anyone maintaining a stored default. The
  // gym-wide default is only reached for a program's very first block.
  //
  // The start date then defaults to the first Monday from this week on that
  // the new block actually fits in — for a program mid-block that's the Monday
  // after it ends. Still fully editable; this is a starting point, not a rail.
  useEffect(() => {
    if (!visible || !selectedProgram) return;
    const seed = Number(lengthSeedByProgram[selectedProgram.id] ?? gymDefaultLength) || 4;
    setLengthWeeks(String(seed));

    const thisMonday = mondayOnOrBefore(todayInBoise());
    const clashes = (m) =>
      blocks.some((b) => rangesOverlap(m, addDays(m, seed * 7 - 1), b.block_start_date, b.block_end_date));
    setStartDate(mondays.find((m) => m >= thisMonday && !clashes(m)) ?? thisMonday);
    // Deliberately not keyed on `mondays`/`blocks` identity beyond the program
    // — this is the OPENING default, and re-running it would stomp a date the
    // coach had already picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedProgram?.id]);

  const lengthValid = length >= 1;
  const overlaps = blockedMondays.includes(startDate);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSubmit({ groupProgramId, startDate, copyFromLatest, lengthWeeks: Number(lengthWeeks) });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
          <Text className="mb-4 text-xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            New block
          </Text>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Program
          </Text>
          <View className="mb-4 flex-row gap-2">
            {(programs ?? []).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setGroupProgramId(p.id)}
                className={`rounded-full border px-3.5 py-2.5 ${
                  groupProgramId === p.id ? "border-primary bg-primary" : "border-stone-300"
                }`}
              >
                <Text
                  className={groupProgramId === p.id ? "text-white" : "text-stone-700"}
                  style={{ fontFamily: "Montserrat_400Regular" }}
                >
                  {/* Just the name — this used to append the program's own
                      block_length_weeks, which is no longer maintained or
                      used as the seed, so it would have shown a number the
                      Length stepper below then disagreed with. */}
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Start from
          </Text>
          <View className="mb-4 flex-row gap-2">
            {[
              { key: true, label: "Copy latest block" },
              { key: false, label: "Start blank" },
            ].map((opt) => (
              <Pressable
                key={String(opt.key)}
                onPress={() => setCopyFromLatest(opt.key)}
                className={`rounded-full border px-3.5 py-2.5 ${copyFromLatest === opt.key ? "border-primary bg-primary" : "border-stone-300"}`}
              >
                <Text className={copyFromLatest === opt.key ? "text-white" : "text-stone-700"} style={{ fontFamily: "Montserrat_400Regular" }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Length
          </Text>
          <View className="mb-4">
            <WeeksStepper value={lengthWeeks} onChange={setLengthWeeks} />
          </View>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
            Starts
          </Text>
          <Text className="mb-2 text-xs text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
            Blocks run Monday to Sunday, so only Mondays can be picked. Greyed weeks already have a block.
          </Text>
          {/* Keyed on `visible` AND the program so it remounts whenever the
              default start date jumps — MondayPicker seeds its opening month
              on first render only, so without this it would sit on whatever
              month was last viewed instead of the one the new default is in. */}
          <MondayPicker
            key={`${visible ? "open" : "closed"}-${groupProgramId ?? "none"}`}
            value={startDate}
            onChange={setStartDate}
            markedDates={takenMondays}
            disabledDates={blockedMondays}
          />
          {lengthValid && (
            <Text
              className="mt-2 text-xs"
              style={{ fontFamily: "Montserrat_500Medium", color: overlaps ? "#b23a22" : "#57534e" }}
            >
              {overlaps
                ? "That would run into a block this program already has — pick a later Monday, or shorten it."
                : formatDateRange(startDate, addDays(startDate, length * 7 - 1))}
            </Text>
          )}
          <View className="mb-6" />

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-3">
              <Text style={{ fontFamily: "Montserrat_500Medium" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={saving || !groupProgramId || !startDate || !lengthValid || overlaps}
              style={{ opacity: saving || !groupProgramId || !startDate || !lengthValid || overlaps ? 0.5 : 1 }}
              className="rounded-lg bg-primary px-4 py-3"
            >
              <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                {saving ? "Creating…" : "Create block"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
