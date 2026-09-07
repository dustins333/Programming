import { Modal, View, Text, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../../PressFade";
import { useKeyboardInset } from "../../../lib/useKeyboardInset";
import { MOBILE_BREAKPOINT } from "../../CoachShell";
import { CHEVRON } from "./DashboardParts";
import { TONE_INK } from "../../../lib/programming/dashboardModel";
import { fonts, colors } from "../../../lib/theme";

// The list behind a figure. Every sub-tile on the dashboard opens something —
// a filtered screen where one exists, and this where one doesn't ("who logged
// today", "who hasn't been seen in a week"). A number a coach can't get
// behind is decoration.
//
// One component at both widths, presented the way each side of the app
// already presents a modal: a bottom sheet on a phone, a centred card on
// desktop web. Two components would be two chances for the same list to say
// different things.

export function DashboardSheet({ visible, onClose, title, subtitle, footerLabel, onFooterPress, children }) {
  const { keyboardInset, visibleHeight } = useKeyboardInset();
  const { width } = useWindowDimensions();
  const wide = width >= MOBILE_BREAKPOINT;

  const panel = (
    <Pressable
      onPress={(e) => e.stopPropagation?.()}
      style={
        wide
          ? { width: "100%", maxWidth: 560, maxHeight: "86%", backgroundColor: colors.canvas, borderRadius: 18, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18, overflow: "hidden" }
          : {
              backgroundColor: colors.canvas,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 26,
              // px off the VISIBLE height on web, so the sheet keeps the same
              // proportion of what's on screen instead of 85% of a layout
              // viewport that never shrank when the keyboard opened.
              maxHeight: visibleHeight ? Math.round(visibleHeight * 0.85) : "85%",
            }
      }
    >
      {wide ? null : (
        <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 99, backgroundColor: "#dcd6ce", marginBottom: 14 }} />
      )}
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 19, color: colors.primaryOnWhite }}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted, marginTop: 2 }}>{subtitle}</Text>
          ) : null}
        </View>
        {wide ? (
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color="#a8a29e" />
          </Pressable>
        ) : null}
      </View>
      <ScrollView style={{ marginTop: 12, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {/* The "just take me to the whole module" escape hatch, outside the
          ScrollView so a long list can't push it off the bottom. */}
      {footerLabel ? (
        <PressFade
          onPress={onFooterPress}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            marginTop: 12,
            paddingVertical: 13,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: "#fdf6f2",
          }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.primaryOnWhite }}>{footerLabel}</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.primaryOnWhite} />
        </PressFade>
      ) : null}
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType={wide ? "fade" : "slide"} transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(68,64,60,0.35)",
          ...(wide
            ? { alignItems: "center", justifyContent: "center", padding: 16 }
            : { justifyContent: "flex-end", paddingBottom: keyboardInset }),
        }}
      >
        {panel}
      </Pressable>
    </Modal>
  );
}

// Every row in every sheet navigates — that's the point of opening one.
export function SheetRow({ title, detail, trailing, tone, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}
    >
      {tone ? <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: TONE_INK[tone] ?? TONE_INK.good }} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: colors.text }}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 1 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {typeof trailing === "string" ? (
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>{trailing}</Text>
      ) : (
        trailing ?? null
      )}
      <Ionicons name="chevron-forward" size={15} color={CHEVRON} />
    </PressFade>
  );
}

export function SheetEmpty({ children }) {
  return <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: colors.muted, paddingVertical: 16 }}>{children}</Text>;
}
