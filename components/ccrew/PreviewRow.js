import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FLAG_KINDS } from "../../lib/ccrew/preview";
import { colors, fonts } from "../../lib/theme";

export default function PreviewRow({ e, compact }) {
  const tone = e.qualified ? "#4d6142" : e.eligible ? colors.muted : colors.hint;
  return (
    <View className="flex-row items-center gap-3 border-b py-2" style={{ borderColor: "#f1efed" }}>
      <View className="flex-1" style={{ minWidth: 0 }}>
        <View className="flex-row items-center gap-1.5">
          {/* flexShrink + minWidth:0 are load-bearing, not decoration:
              numberOfLines={1} compiles to white-space:nowrap on web, and a
              nowrap Text with no shrink demands its full intrinsic width —
              which at phone width squeezed the name to zero and rendered
              the row with the badge but no person on it. */}
          <Text
            numberOfLines={1}
            style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: "#44403c", flexShrink: 1, minWidth: 0 }}
          >
            {e.name}
          </Text>
          {e.staffFloorApplied ? (
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.5, color: colors.primaryOnWhite, flexShrink: 0 }}>
              STAFF 2x
            </Text>
          ) : null}
          {e.flags.some((f) => FLAG_KINDS[f].severity === "high") ? (
            <Ionicons name="alert-circle" size={13} color="#b23a22" />
          ) : null}
        </View>
        {!compact ? (
          <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 10.5, color: colors.hint }}>
            {e.packages || "no packages"}
          </Text>
        ) : null}
      </View>

      <Text style={{ width: compact ? 34 : 42, textAlign: "right", fontFamily: fonts.sansMedium, fontSize: 13, color: "#44403c" }}>
        {e.attendance}
      </Text>
      {/* The two derived columns are dropped on a phone — at 375px they and
          the status column together leave the name nothing to live in. The
          upload flow is web-first anyway (the file picker is web-only), so
          this view on a phone is for reading, not scrutinising. */}
      {!compact ? (
        <>
          <Text style={{ width: 56, textAlign: "right", fontFamily: fonts.sans, fontSize: 12, color: colors.muted }}>
            {e.target ? `of ${e.target * 4}` : "—"}
          </Text>
          {/* Deliberately blank for someone who was never eligible: their
              package resolves to 1x, so they aren't being measured at all
              and a percentage beside "not eligible" reads as a bug. */}
          <Text style={{ width: 48, textAlign: "right", fontFamily: fonts.sans, fontSize: 12, color: colors.muted }}>
            {e.eligible ? `${Math.round(e.ratio * 100)}%` : "—"}
          </Text>
        </>
      ) : null}
      <Text
        numberOfLines={1}
        style={{ width: compact ? 72 : 74, textAlign: "right", fontFamily: fonts.sansSemiBold, fontSize: 12, color: tone, flexShrink: 0 }}
      >
        {e.qualified ? `${e.tier}x group` : e.eligible ? "missed" : "not eligible"}
      </Text>
    </View>
  );
}
