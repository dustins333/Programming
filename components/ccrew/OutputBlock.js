import { useState } from "react";
import { View, Text, Pressable, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../../lib/theme";
import { toastSuccess, toastError } from "../../lib/toast";

const isWeb = Platform.OS === "web";

// The wall list, ready to paste onto the Canva slides. Delivery is
// deliberately a copy-paste block for now — not a CSV, not Canva automation.
export default function OutputBlock({ text, title = "Copy for the slides", subtitle }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toastSuccess("Copied");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toastError("Couldn't copy — select the text and copy it by hand", err);
    }
  }

  return (
    <View
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: "#ece7e1" }}
    >
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#44403c" }}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {isWeb ? (
          <Pressable
            onPress={handleCopy}
            className="flex-row items-center gap-2 rounded-lg px-3 py-2"
            style={{ backgroundColor: copied ? "#eef1e7" : colors.primary }}
          >
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={15}
              color={copied ? "#4d6142" : "#fff"}
            />
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: copied ? "#4d6142" : "#fff" }}>
              {copied ? "Copied" : "Copy"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Selectable on native too — there's no clipboard dependency in this
          app, so on a phone the honest affordance is press-and-hold to copy
          rather than a button that can't do anything. */}
      <ScrollView
        style={{ maxHeight: 320, backgroundColor: colors.canvas, borderRadius: 10 }}
        contentContainerStyle={{ padding: 12 }}
      >
        <Text
          selectable
          style={{
            fontFamily: Platform.select({ web: "ui-monospace, SFMono-Regular, Menlo, monospace", default: "Courier" }),
            fontSize: 13,
            lineHeight: 20,
            color: "#44403c",
          }}
        >
          {text}
        </Text>
      </ScrollView>
      {!isWeb ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.muted, marginTop: 8 }}>
          Press and hold to select and copy.
        </Text>
      ) : null}
    </View>
  );
}
