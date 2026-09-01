import { useState } from "react";
import { View, Text, Pressable, Switch, ActivityIndicator } from "react-native";
import { WeeksStepper } from "./WeeksStepper";
import { fonts, colors } from "../lib/theme";

// The "this block shouldn't stop" controls, shared by the group and SPC
// block lists so both behave identically.
//
// Two separate answers to the same problem, deliberately kept apart:
//   Extend  — add weeks right now, once. Predictable, no background magic.
//   Ongoing — keep adding a week automatically as the end approaches, until
//             it's switched off. Stored as auto_extend (0049) and grown by
//             scan-spc-alerts nightly. Labelled "Ongoing" rather than
//             "Rolling" so it reads the same as SPC's own ongoing programs,
//             which is what coaches already call it.
//
// Both carry the block's last week forward by default, which is the whole
// point for a client repeating the same work; "Blank weeks" is there for
// the case where the next stretch is genuinely different.
export function BlockExtendControls({ block, onExtend, onToggleAutoExtend }) {
  const [open, setOpen] = useState(false);
  const [weeks, setWeeks] = useState("1");
  const [copyLastWeek, setCopyLastWeek] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rollingBusy, setRollingBusy] = useState(false);
  const [error, setError] = useState(null);

  const weeksValid = Number(weeks) >= 1;

  const handleExtend = async () => {
    setBusy(true);
    setError(null);
    try {
      await onExtend({ weeks: Number(weeks), copyLastWeek });
      setOpen(false);
      setWeeks("1");
    } catch (err) {
      // Shown inline rather than as a toast — the overlap message names
      // the block in the way and what to do about it, which is worth
      // keeping on screen next to the control that produced it.
      setError(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleRolling = async (next) => {
    setRollingBusy(true);
    setError(null);
    try {
      await onToggleAutoExtend(next);
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setRollingBusy(false);
    }
  };

  return (
    <View>
      <View className="flex-row items-center gap-3.5">
        <Pressable
          onPress={() => setOpen((prev) => !prev)}
          className="rounded-lg border px-3 py-1.5"
          style={{ borderColor: "#d9d4cd" }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
            {open ? "Cancel" : "Extend"}
          </Text>
        </Pressable>

        <View className="flex-row items-center gap-2">
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: block.auto_extend ? "#4d6142" : "#78716c" }}>
            Ongoing
          </Text>
          {rollingBusy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Switch
              value={Boolean(block.auto_extend)}
              onValueChange={handleToggleRolling}
              trackColor={{ true: "#4d6142" }}
              accessibilityLabel="Keep this block going"
            />
          )}
        </View>
      </View>

      {block.auto_extend && !open ? (
        <Text className="mt-1.5" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#4d6142" }}>
          No end date. A week is added automatically as this one runs out. Switch off to let it finish.
        </Text>
      ) : null}

      {open ? (
        <View className="mt-2.5 rounded-xl p-3" style={{ backgroundColor: "#faf8f6", borderWidth: 1, borderColor: "#ece7e1" }}>
          <Text className="mb-2 text-xs uppercase" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, color: "#a8a29e" }}>
            Add to this block
          </Text>
          <WeeksStepper value={weeks} onChange={setWeeks} />

          <View className="mt-3 flex-row gap-2">
            {[
              { key: true, label: "Repeat last week" },
              { key: false, label: "Blank weeks" },
            ].map((opt) => {
              const active = copyLastWeek === opt.key;
              return (
                <Pressable
                  key={String(opt.key)}
                  onPress={() => setCopyLastWeek(opt.key)}
                  className="rounded-full border px-3 py-1.5"
                  style={{
                    borderColor: active ? colors.primary : "#d9d4cd",
                    backgroundColor: active ? colors.primary : "white",
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: active ? "white" : "#57534e" }}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={handleExtend}
            disabled={busy || !weeksValid}
            className="mt-3 self-start rounded-lg px-4 py-2"
            style={{ opacity: busy || !weeksValid ? 0.5 : 1, backgroundColor: colors.primary }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansBold, fontSize: 12.5 }}>
              {busy ? "Extending…" : `Add ${weeksValid ? weeks : ""} week${Number(weeks) === 1 ? "" : "s"}`}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <Text className="mt-2" style={{ fontFamily: fonts.sans, fontSize: 12, color: "#b23a22" }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
