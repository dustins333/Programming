import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { fonts, colors } from "../lib/theme";

// "Needs your attention" used to render as an always-expanded list of
// alert rows at the top of both coach dashboards. With a real roster
// that's a wall of terracotta before you reach anything else — per direct
// feedback it read as overwhelming. It's a single count tile now; the rows
// live in a popup you open when you actually want to work them.
//
// Shared by native (index.js) and web (index.web.js), which had a
// byte-identical copy of the row markup each.
const ALERT_BG = "#fdece5";
const ALERT_BORDER = "#f0d4c9";
const ALERT_TITLE = "#8a3a24";
const ALERT_BODY = "#a8574a";
const ALERT_CHEVRON = "#c2543a";

// The collapsed state. Sized to sit beside the Roster panel on web and to
// span the content column on native, so both get a plain "N things need
// you" glance with nothing to scroll past.
export function AttentionTile({ count, onPress, style }) {
  const clear = count === 0;
  return (
    <Pressable
      onPress={clear ? undefined : onPress}
      disabled={clear}
      accessibilityLabel={clear ? "Nothing needs attention" : `${count} items need your attention, open list`}
      className="rounded-2xl px-5 py-[18px]"
      style={[
        {
          borderWidth: 1,
          borderColor: clear ? "#ece7e1" : ALERT_BORDER,
          backgroundColor: clear ? "#ffffff" : ALERT_BG,
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text
        className="mb-1 text-xs uppercase"
        style={{ fontFamily: fonts.sansBold, letterSpacing: 0.6, fontSize: 11, color: clear ? "#a8a29e" : ALERT_TITLE }}
      >
        Needs your attention
      </Text>
      {clear ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}>
          You're all caught up.
        </Text>
      ) : (
        <View className="flex-row items-center justify-between gap-3">
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 30, color: ALERT_TITLE }}>
            {count}
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: ALERT_BODY }}>
              {count === 1 ? " item" : " items"}
            </Text>
          </Text>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: ALERT_CHEVRON }}>View ›</Text>
        </View>
      )}
    </Pressable>
  );
}

function AttentionRow({ title, subtitle, onPress, onDismiss }) {
  return (
    <View
      className="mb-2 flex-row items-center rounded-xl px-4 py-3.5"
      style={{ backgroundColor: ALERT_BG, borderWidth: 1, borderColor: ALERT_BORDER }}
    >
      <Pressable onPress={onPress} className="flex-1 flex-row items-center pr-2">
        <View className="flex-1 pr-2">
          <Text style={{ fontFamily: fonts.sansBold, color: ALERT_TITLE, fontSize: 13.5 }}>{title}</Text>
          <Text className="mt-0.5" style={{ fontFamily: fonts.sans, color: ALERT_BODY, fontSize: 12 }}>
            {subtitle}
          </Text>
        </View>
        <Text style={{ color: ALERT_CHEVRON, fontSize: 15 }}>›</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityLabel="Dismiss"
        className="ml-2 items-center justify-center rounded-full"
        style={{ width: 22, height: 22 }}
      >
        <Text style={{ color: ALERT_CHEVRON, fontSize: 15, fontFamily: fonts.sansBold }}>×</Text>
      </Pressable>
    </View>
  );
}

// Centered card rather than a bottom sheet — the coach-side convention for
// dialogs (CLAUDE.md's modal note), and this opens on desktop web as often
// as on a phone. Tapping a row navigates, so it closes itself first.
export function AttentionModal({ visible, items, onClose, onDismiss, onSelect }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center px-5" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="w-full rounded-2xl bg-white p-5"
          style={{ maxWidth: 560, maxHeight: "80%" }}
        >
          <View className="mb-3.5 flex-row items-center justify-between">
            <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.6, fontSize: 11 }}>
              Needs your attention
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Text style={{ color: "#a8a29e", fontSize: 18 }}>×</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {items.length === 0 ? (
              <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                Nothing needs attention right now — you're all caught up.
              </Text>
            ) : (
              items.map((item) => (
                <AttentionRow
                  key={item.key}
                  title={item.title}
                  subtitle={item.subtitle}
                  onPress={() => onSelect(item)}
                  onDismiss={() => onDismiss(item)}
                />
              ))
            )}
          </ScrollView>

          <Pressable onPress={onClose} className="mt-3 items-center py-2">
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
