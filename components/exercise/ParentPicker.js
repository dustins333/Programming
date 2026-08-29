import { useState } from "react";
import { View, Text, TextInput, ScrollView, Modal } from "react-native";
import { toastError } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";
import { PressFade } from "../PressFade";
import { Eyebrow } from "../Eyebrow";
import { INPUT_BORDER, ROW_RULE, INK } from "./tokens";

// Single-select against the parent RECORDS (0095), not against other
// exercises. That's what makes this list ~18 entries instead of the 135
// parent-less lifts it used to have to offer, since before 0095 any
// exercise could turn out to be a parent.
//
// "+ New parent" is inline rather than a trip to another screen: the moment
// you need one is the moment you're adding the variation, and sending
// someone away mid-form to create it is how you end up with the variation
// saved unparented and never fixed.
//
// The v1 library handoff replaced the web `<select>` with a real panel and
// gave the phone a bottom sheet — a raw select couldn't carry the "+ New
// parent" row inside the list it belongs to, so that action had to sit
// underneath as a separate line that read as unrelated to the field.
//
// `wide` (not Platform.OS) picks between them, matching the form shell
// around it: the installed PWA is a phone running the web build.

const NONE_LABEL = "None (stands on its own)";

function OptionRow({ label, selected, muted, onPress, last, wide }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: wide ? 9 : 11,
        paddingHorizontal: wide ? 13 : 2,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: ROW_RULE,
      }}
    >
      <Text
        maxFontSizeMultiplier={1.2}
        style={{
          flex: 1,
          fontFamily: selected ? fonts.sansBold : fonts.sansMedium,
          fontSize: wide ? 12.5 : 13.5,
          color: muted ? colors.muted : INK,
        }}
      >
        {label}
      </Text>
      <Text maxFontSizeMultiplier={1} style={{ width: 16, fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>
        {selected ? "✓" : ""}
      </Text>
    </PressFade>
  );
}

// The create-a-parent affordance, shared by both platforms: a link that
// swaps in place for a name field. Submitting selects the new parent and
// closes the picker, because selecting it is the entire point of having
// created it here.
function NewParentRow({ onCreate, onDone, wide }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await onCreate(trimmed);
      setCreating(false);
      setName("");
      onDone(created ?? null);
    } catch (e) {
      toastError(e.message ?? "Couldn't add that parent.");
    } finally {
      setBusy(false);
    }
  };

  if (!creating) {
    return (
      <PressFade
        onPress={() => setCreating(true)}
        hitSlop={8}
        style={{ paddingVertical: 11, paddingHorizontal: wide ? 13 : 2 }}
      >
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.primaryOnWhite }}>
          + New parent
        </Text>
      </PressFade>
    );
  }

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: wide ? 13 : 2,
      }}
    >
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        placeholder="New parent name…"
        placeholderTextColor={colors.hint}
        onSubmitEditing={submit}
        style={{
          flex: 1,
          minWidth: 0,
          height: 40,
          borderWidth: 1,
          borderColor: colors.primary,
          borderRadius: 10,
          backgroundColor: "#fff",
          paddingHorizontal: 12,
          fontFamily: fonts.sans,
          fontSize: 13,
          color: INK,
        }}
      />
      <PressFade
        onPress={submit}
        disabled={busy || !name.trim()}
        style={{
          justifyContent: "center",
          borderRadius: 10,
          backgroundColor: colors.primary,
          paddingHorizontal: 15,
          opacity: busy || !name.trim() ? 0.5 : 1,
        }}
      >
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: "#fff" }}>
          Add
        </Text>
      </PressFade>
      <PressFade
        onPress={() => {
          setCreating(false);
          setName("");
        }}
        style={{ justifyContent: "center", paddingHorizontal: 4 }}
      >
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.muted }}>
          Cancel
        </Text>
      </PressFade>
    </View>
  );
}

export function ParentPicker({ value, options, onChange, onCreate, wide }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const label = selected ? selected.name : NONE_LABEL;

  const pick = (id) => {
    onChange(id);
    setOpen(false);
  };

  const trigger = (
    <PressFade
      onPress={() => setOpen((v) => !v)}
      accessibilityLabel="Parent movement"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderWidth: 1,
        borderColor: INPUT_BORDER,
        borderRadius: 10,
        backgroundColor: "#fff",
        paddingVertical: 11,
        paddingHorizontal: 13,
      }}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 13, color: selected ? INK : colors.hint }}
      >
        {label}
      </Text>
      <Text maxFontSizeMultiplier={1} style={{ fontSize: wide ? 10 : 14, color: "#a8a29e" }}>
        {wide ? "▾" : "›"}
      </Text>
    </PressFade>
  );

  // Wide: the panel expands in flow beneath the trigger rather than floating.
  // Inside a 460px drawer that already scrolls, an absolutely-positioned
  // menu either clips at the drawer edge or has to fight it for z-index.
  if (wide) {
    return (
      <View>
        {trigger}
        {open ? (
          <View style={{ borderWidth: 1, borderColor: INPUT_BORDER, borderRadius: 10, backgroundColor: "#fff", marginTop: 6, overflow: "hidden" }}>
            <OptionRow wide={wide} label={NONE_LABEL} muted={!value} selected={!value} onPress={() => pick("")} />
            {options.map((o) => (
              <OptionRow key={o.id} wide={wide} label={o.name} selected={o.id === value} onPress={() => pick(o.id)} />
            ))}
            <NewParentRow
              wide={wide}
              onCreate={onCreate}
              onDone={(created) => {
                if (created) onChange(created.id);
                setOpen(false);
              }}
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      {trigger}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <PressFade
          onPress={() => setOpen(false)}
          pressedOpacity={1}
          accessibilityLabel="Close parent picker"
          style={{ flex: 1, backgroundColor: "rgba(42,33,28,0.4)", justifyContent: "flex-end" }}
        >
          {/* An inner non-closing press target: without it, a tap anywhere
              on the sheet bubbles to the backdrop and shuts it. */}
          <PressFade
            onPress={() => {}}
            pressedOpacity={1}
            style={{
              backgroundColor: "#fff",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              paddingTop: 10,
              paddingHorizontal: 20,
              paddingBottom: 26,
              maxHeight: "75%",
            }}
          >
            <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: "#e0dbd4", marginBottom: 14 }} />
            <Eyebrow>Parent movement</Eyebrow>
            <ScrollView style={{ marginTop: 6 }} keyboardShouldPersistTaps="handled">
              <OptionRow wide={wide} label={NONE_LABEL} muted={!value} selected={!value} onPress={() => pick("")} />
              {options.map((o) => (
                <OptionRow key={o.id} wide={wide} label={o.name} selected={o.id === value} onPress={() => pick(o.id)} />
              ))}
              <NewParentRow
                wide={wide}
                onCreate={onCreate}
                onDone={(created) => {
                  if (created) onChange(created.id);
                  setOpen(false);
                }}
              />
            </ScrollView>
          </PressFade>
        </PressFade>
      </Modal>
    </View>
  );
}
