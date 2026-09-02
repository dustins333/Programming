import { useMemo, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MondayPicker } from "../MondayPicker";
import { SegmentedControl } from "../SegmentedControl";
import { fonts, colors } from "../../lib/theme";
import { formatDateMDY } from "../../lib/formatDate";
import { todayInBoise, mondayOnOrBefore, addDays } from "../../lib/boiseDate";

// Assigning a template to a client, in either of the two shapes.
//
// The shapes are named by SHAPE, not by purpose, and that is deliberate. A
// welcome week is a single session; a trial is a single session; an away
// block is several across weeks. If the buttons said "one-off" and "away"
// then assigning a welcome week would mean pressing Away, which is the
// naming problem this is meant to solve. The purpose lives in the
// template's category and in the name the coach types below.

const MAX_SESSIONS = 3;
const WEEK_CHOICES = [1, 2, 3, 4, 6, 8];

function SectionLabel({ children }) {
  return (
    <Text
      className="mb-2 text-xs uppercase text-stone-400"
      style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}
    >
      {children}
    </Text>
  );
}

function TemplateRow({ template, categoryName, selected, index, onToggle, disabled }) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={{ opacity: disabled ? 0.4 : 1 }}
      className={`mb-2 flex-row items-center rounded-lg border px-3.5 py-3 ${
        selected ? "border-primary bg-[#fdf6f2]" : "border-stone-200"
      }`}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: selected ? 0 : 1.5,
          borderColor: "#d9d4cd",
          backgroundColor: selected ? colors.primary : "transparent",
          alignItems: "center",
          justifyContent: "center",
          marginRight: 10,
        }}
      >
        {selected ? (
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 11 }}>
            {index + 1}
          </Text>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansMedium }} numberOfLines={1}>
          {template.name}
        </Text>
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
          {categoryName ?? "Uncategorised"}
        </Text>
      </View>
    </Pressable>
  );
}

export function AssignAlternateModal({ visible, templates, existingPrograms = [], onClose, onAssignSingle, onAssignRun }) {
  const [shape, setShape] = useState("single");
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [weeks, setWeeks] = useState(2);
  const [startDate, setStartDate] = useState(() => mondayOnOrBefore(todayInBoise()));
  const [pauseFlags, setPauseFlags] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pickedTemplates = useMemo(
    () => picked.map((id) => templates.find((t) => t.id === id)).filter(Boolean),
    [picked, templates]
  );

  // Defaults from the category of the first session picked, so the common
  // case ("Away programming") needs no typing, while a coach who wants
  // "Italy trip" just types over it. Stops defaulting the moment they edit.
  const defaultName = pickedTemplates[0]?.template_categories?.name ?? "Alternate programming";
  const effectiveName = nameTouched ? name : defaultName;

  const endDate = addDays(startDate, weeks * 7 - 1);

  // Mondays already covered by another run for this client. Shown as
  // unpickable rather than accepted and then refused by the write, which is
  // what assignAlternateProgram would otherwise do.
  const takenMondays = useMemo(() => {
    const out = [];
    for (const program of existingPrograms) {
      const end = program.ended_at && program.ended_at < addDays(program.start_date, program.weeks * 7 - 1)
        ? program.ended_at
        : addDays(program.start_date, program.weeks * 7 - 1);
      let cursor = program.start_date;
      while (cursor <= end) {
        out.push(cursor);
        cursor = addDays(cursor, 7);
      }
    }
    return out;
  }, [existingPrograms]);

  const overlapsExisting = useMemo(() => {
    for (const monday of takenMondays) {
      if (monday >= startDate && monday <= endDate) return true;
    }
    return false;
  }, [takenMondays, startDate, endDate]);

  // Suppressed while submitting. The parent refreshes its roster after a
  // successful assign, and that refresh flows straight back into
  // existingPrograms — so the run being created counts itself as a clash
  // for the moment between the write landing and this modal closing.
  const collides = overlapsExisting && !busy;

  const reset = () => {
    setShape("single");
    setPicked([]);
    setName("");
    setNameTouched(false);
    setWeeks(2);
    setStartDate(mondayOnOrBefore(todayInBoise()));
    setPauseFlags(true);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const toggle = (template) => {
    setError(null);
    setPicked((prev) => {
      if (prev.includes(template.id)) return prev.filter((id) => id !== template.id);
      // A single session assigns each pick as its own independent
      // assignment, so there's no cap there. A run maps its picks onto the
      // week's sessions, which tops out at three.
      if (shape === "run" && prev.length >= MAX_SESSIONS) return prev;
      return [...prev, template.id];
    });
  };

  // A ref, not the `busy` state: two clicks in the same tick both read the
  // same render's `busy`, and two concurrent assigns can each pass the
  // overlap check before either has inserted, which would create two
  // genuinely overlapping runs (nothing in the schema forbids that).
  const submittingRef = useRef(false);

  const handleAssign = async () => {
    if (!pickedTemplates.length || submittingRef.current) return;
    submittingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      if (shape === "single") {
        await onAssignSingle(pickedTemplates);
      } else {
        await onAssignRun({
          name: effectiveName.trim() || defaultName,
          startDate,
          weeks,
          pauseMissedFlags: pauseFlags,
          templates: pickedTemplates,
        });
      }
      close();
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  const canAssign = pickedTemplates.length > 0 && !(shape === "run" && overlapsExisting);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="w-full max-w-md rounded-2xl bg-white" style={{ maxHeight: "88%" }}>
          <View className="px-6 pt-6">
            <Text className="mb-4 text-xl" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
              Alternate programming
            </Text>
            <SegmentedControl
              segments={[
                { key: "single", label: "Single session" },
                { key: "run", label: "Across weeks" },
              ]}
              activeKey={shape}
              dense
              onSelect={(next) => {
                setShape(next);
                setError(null);
                if (next === "run") setPicked((prev) => prev.slice(0, MAX_SESSIONS));
              }}
            />
            <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
              {shape === "single"
                ? "Open until they finish it, no dates. Each one you pick is assigned on its own."
                : "The sessions you pick repeat every week of the run. Same numbers each week."}
            </Text>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 24 }}>
            <SectionLabel>
              {shape === "run" ? `Sessions (up to ${MAX_SESSIONS})` : "Sessions"}
            </SectionLabel>
            {templates.length === 0 ? (
              <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
                No templates yet. Build one under Templates first.
              </Text>
            ) : (
              templates.map((template) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  categoryName={template.template_categories?.name}
                  selected={picked.includes(template.id)}
                  index={picked.indexOf(template.id)}
                  onToggle={() => toggle(template)}
                  disabled={
                    shape === "run" && !picked.includes(template.id) && picked.length >= MAX_SESSIONS
                  }
                />
              ))
            )}

            {shape === "run" ? (
              <>
                <View style={{ height: 12 }} />
                <SectionLabel>What they see it called</SectionLabel>
                <TextInput
                  value={effectiveName}
                  onChangeText={(text) => {
                    setNameTouched(true);
                    setName(text);
                  }}
                  placeholder={defaultName}
                  className="mb-4 rounded-lg border border-stone-300 px-4 py-3"
                  style={{ fontFamily: fonts.sans }}
                />

                <SectionLabel>How many weeks</SectionLabel>
                <View className="mb-4 flex-row flex-wrap gap-2">
                  {WEEK_CHOICES.map((choice) => (
                    <Pressable
                      key={choice}
                      onPress={() => setWeeks(choice)}
                      className={`rounded-full border px-4 py-2 ${
                        weeks === choice ? "border-primary bg-primary" : "border-stone-300"
                      }`}
                    >
                      <Text
                        className={weeks === choice ? "text-white" : "text-stone-700"}
                        style={{ fontFamily: fonts.sansMedium }}
                      >
                        {choice}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <SectionLabel>Starting</SectionLabel>
                <MondayPicker value={startDate} onChange={setStartDate} markedDates={takenMondays} />
                <Text
                  className="mb-4 mt-2"
                  style={{ fontFamily: fonts.sans, fontSize: 13, color: collides ? "#b23a22" : colors.muted }}
                >
                  {collides
                    ? "Another assignment already covers part of those weeks. Pick a different start, or end that one first."
                    : `${formatDateMDY(startDate)} to ${formatDateMDY(endDate)}`}
                </Text>

                <Pressable
                  onPress={() => setPauseFlags((prev) => !prev)}
                  className="mb-4 flex-row items-start rounded-lg border border-stone-200 px-3.5 py-3"
                >
                  <Ionicons
                    name={pauseFlags ? "checkbox" : "square-outline"}
                    size={20}
                    color={pauseFlags ? "#4d6142" : colors.muted}
                    style={{ marginRight: 10, marginTop: 1 }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: fonts.sansMedium }}>Don't mark their normal sessions missed</Text>
                    <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
                      Their usual program still shows the whole time. It just can't go red while this runs.
                    </Text>
                  </View>
                </Pressable>
              </>
            ) : null}

            {error ? (
              <Text className="mb-3" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
                {error}
              </Text>
            ) : null}
          </ScrollView>

          <View className="flex-row gap-2 px-6 pb-6 pt-4">
            <Pressable onPress={close} className="flex-1 rounded-lg border border-stone-300 px-4 py-3">
              <Text className="text-center" style={{ fontFamily: fonts.sansMedium }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={handleAssign}
              disabled={busy || !canAssign}
              style={{ opacity: busy || !canAssign ? 0.5 : 1 }}
              className="flex-1 rounded-lg bg-primary px-4 py-3"
            >
              <Text className="text-center text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {busy ? "Assigning…" : "Assign"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
