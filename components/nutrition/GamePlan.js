import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { toastError } from "../../lib/toast";
import { updateGamePlan } from "../../lib/nutrition/coachClient";
import { fonts, colors } from "../../lib/theme";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";

const MIN_HEIGHT = 100;

// Exposes saveIfDirty() so a container that closes on a tap-away — the
// floating notes bubble — can flush an unsaved edit instead of dropping it.
// The visible Save button still works exactly as before for every other
// caller, which passes no ref and is unaffected.
export const GamePlan = forwardRef(function GamePlan({ userId, initialGamePlan, onSaved }, ref) {
  const [text, setText] = useState(initialGamePlan ?? "");
  // What's actually persisted, so "dirty" survives a save without waiting
  // for the parent to reload and hand down a fresh initialGamePlan.
  const savedRef = useRef(initialGamePlan ?? "");
  const textRef = useRef(initialGamePlan ?? "");
  textRef.current = text;
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const persist = async (value) => {
    await updateGamePlan(userId, value);
    savedRef.current = value;
    onSaved?.(value);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await persist(text);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      toastError("Failed to save notes", err);
    } finally {
      setBusy(false);
    }
  };

  useImperativeHandle(ref, () => ({
    // Read through refs, not the closed-over `text`: the caller fires this
    // from a tap-away handler that may have been created on an earlier
    // render, and a stale closure would save the wrong thing.
    // Three outcomes, not a boolean: a caller closing on tap-away has to
    // tell "nothing to do" apart from "the write failed", or it closes over
    // an unsaved note and the coach loses what she just typed.
    async saveIfDirty() {
      if (textRef.current === savedRef.current) return "unchanged";
      try {
        await persist(textRef.current);
        return "saved";
      } catch (err) {
        toastError("Failed to save notes", err);
        return "failed";
      }
    },
  }));

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={setText}
        onContentSizeChange={(e) => setHeight(Math.max(MIN_HEIGHT, e.nativeEvent.contentSize.height))}
        multiline
        inputAccessoryViewID={NUMERIC_DONE_ID}
        placeholder="Freeform notes, visible to the client…"
        className="mb-2 rounded border border-stone-300 px-3 py-2 text-sm"
        style={{ fontFamily: fonts.sans, textAlignVertical: "top", height }}
      />
      <View className="flex-row items-center gap-2">
        <Pressable onPress={handleSave} disabled={busy} className="self-start rounded px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
          <Text className="text-sm text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {busy ? "Saving…" : "Save notes"}
          </Text>
        </Pressable>
        {saved ? (
          <Text className="text-sm" style={{ fontFamily: fonts.sans, color: "#4d6142" }}>
            Saved
          </Text>
        ) : null}
      </View>
    </View>
  );
});
