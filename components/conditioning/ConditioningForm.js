import { useEffect, useState } from "react";
import { View, Text, TextInput, Platform } from "react-native";
import { PressFade } from "../PressFade";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import {
  FEEL_OPTIONS,
  parseConditioningForm,
  createConditioningLog,
  updateConditioningLog,
  deleteConditioningLog,
} from "../../lib/programming/conditioning";
import { formatDateMDY } from "../../lib/formatDate";
import { confirmDelete } from "../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../lib/toast";
import { fonts, colors, type } from "../../lib/theme";

// The whole conditioning session, on one card: average heart rate, time, how
// it felt, notes. There is no programming behind it, so there is nothing to
// work through, only four facts to record and one button.
//
// `log` null = a new session for today. An existing log edits in place and
// keeps the day she did it.

const CARD_BORDER = "#ece7e1";
const INK = "#44403c";
const CLAY = "#a46a57";
const FIELD_BORDER = "#ddd6cd";

function Label({ children, hint }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
      <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansBold, fontSize: 13, color: INK }}>
        {children}
      </Text>
      {hint ? (
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function NumberField({ value, onChangeText, unit, placeholder, accessibilityLabel }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1.5,
        borderColor: value ? "#dbe8cf" : FIELD_BORDER,
        backgroundColor: value ? "#f3f6ef" : "#fdfbf8",
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 50,
      }}
    >
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        inputAccessoryViewID={NUMERIC_DONE_ID}
        placeholder={placeholder}
        placeholderTextColor={colors.hint}
        accessibilityLabel={accessibilityLabel}
        maxLength={3}
        style={{ flex: 1, minWidth: 0, fontFamily: fonts.sansBold, fontSize: 20, color: INK }}
      />
      <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted }}>
        {unit}
      </Text>
    </View>
  );
}

export function FeelPicker({ value, onChange, readOnly = false }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {FEEL_OPTIONS.map((option) => {
        const selected = Number(value) === option.value;
        return (
          <PressFade
            key={option.value}
            onPress={readOnly ? undefined : () => onChange(selected ? null : option.value)}
            disabled={readOnly}
            accessibilityLabel={`${option.label}, ${option.value} of 5`}
            pressedOpacity={0.6}
            style={{
              flex: 1,
              minWidth: 0,
              alignItems: "center",
              paddingVertical: 9,
              borderRadius: 12,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? CLAY : CARD_BORDER,
              backgroundColor: selected ? "#fdf6f2" : "#fff",
              opacity: value && !selected ? 0.55 : 1,
            }}
          >
            <Text maxFontSizeMultiplier={1} style={{ fontSize: 24 }}>
              {option.emoji}
            </Text>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.1}
              style={{ fontFamily: selected ? fonts.sansBold : fonts.sansMedium, fontSize: 11.5, color: selected ? colors.primaryOnWhite : colors.muted, marginTop: 3 }}
            >
              {option.label}
            </Text>
          </PressFade>
        );
      })}
    </View>
  );
}

export function ConditioningForm({ userId, log, onSaved, onDeleted }) {
  const [heartRate, setHeartRate] = useState("");
  const [minutes, setMinutes] = useState("");
  const [feel, setFeel] = useState(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Seeded from the log whenever a DIFFERENT log is opened. Keyed on the id,
  // not the object, so a parent re-render can't wipe what she is typing.
  const logId = log?.id ?? null;
  useEffect(() => {
    setHeartRate(log?.avg_heart_rate != null ? String(log.avg_heart_rate) : "");
    setMinutes(log?.duration_minutes != null ? String(log.duration_minutes) : "");
    setFeel(log?.feel ?? null);
    setNotes(log?.notes ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logId]);

  const handleSave = async () => {
    const parsed = parseConditioningForm({ heartRate, minutes, feel, notes });
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = log
        ? await updateConditioningLog(log.id, parsed.values)
        : await createConditioningLog({ userId, ...parsed.values });
      toastSuccess(log ? "Session updated." : "Conditioning logged, nice work!");
      onSaved?.(saved);
    } catch (err) {
      toastError("Couldn't save that session", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!log) return;
    if (!(await confirmDelete("Delete this conditioning session? It can't be recovered.", "Delete session?"))) return;
    try {
      await deleteConditioningLog(log.id);
      toastSuccess("Session deleted.");
      onDeleted?.(log);
    } catch (err) {
      toastError("Couldn't delete that session", err);
    }
  };

  const canSave = String(minutes).trim().length > 0;

  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: CARD_BORDER, padding: 16, marginBottom: 16 }}>
      {log ? (
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansSemiBold, fontSize: type.caption, color: "#4d6142", marginBottom: 12 }}>
          Logged {formatDateMDY(log.performed_on)}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label>Time</Label>
          {/* A dash, never a sample number: a grey "45" reads as already
              entered (the warm-up placeholders taught us that one). */}
          <NumberField value={minutes} onChangeText={setMinutes} unit="min" placeholder="–" accessibilityLabel="Time in minutes" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Label hint="optional">Avg heart rate</Label>
          <NumberField value={heartRate} onChangeText={setHeartRate} unit="bpm" placeholder="–" accessibilityLabel="Average heart rate" />
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <Label>How did it feel?</Label>
        <FeelPicker value={feel} onChange={setFeel} />
      </View>

      <View style={{ marginTop: 18 }}>
        <Label hint="optional">Notes</Label>
        {/* Fixed height, not auto-growing: on web an input sized off its own
            content measurement feeds back on itself (see CLAUDE.md). */}
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Anything worth remembering"
          placeholderTextColor={colors.hint}
          textAlignVertical="top"
          style={{
            height: 96,
            borderWidth: 1,
            borderColor: FIELD_BORDER,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 10,
            fontFamily: fonts.sans,
            fontSize: 15,
            color: INK,
            backgroundColor: "#fdfbf8",
            ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
          }}
        />
      </View>

      {error ? (
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: "#b23a22", marginTop: 12 }}>
          {error}
        </Text>
      ) : null}

      <PressFade
        onPress={handleSave}
        disabled={saving}
        accessibilityLabel={log ? "Save changes" : "Log session"}
        style={{
          marginTop: 16,
          height: 50,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: log ? "#4d6142" : colors.primary,
          opacity: saving ? 0.5 : canSave ? 1 : 0.45,
        }}
      >
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#fff" }}>
          {saving ? "Saving…" : log ? "Save changes" : "Log session"}
        </Text>
      </PressFade>

      {log ? (
        <PressFade onPress={handleDelete} style={{ alignSelf: "center", marginTop: 12, paddingVertical: 6, paddingHorizontal: 12 }}>
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#b23a22" }}>
            Delete this session
          </Text>
        </PressFade>
      ) : null}
    </View>
  );
}
