import { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FLAG_KINDS } from "../../lib/ccrew/preview";
import { colors, fonts } from "../../lib/theme";

const isWeb = Platform.OS === "web";

const SEVERITY_STYLE = {
  high: { bg: "#fdece5", border: "#f0c7b6", text: "#b23a22", icon: "alert-circle" },
  medium: { bg: "#f4ede3", border: "#e4d5bf", text: "#8a5a2e", icon: "help-circle" },
  info: { bg: "#f1efed", border: "#e7e5e4", text: "#57534e", icon: "information-circle" },
};

export default function FlagGroup({ kind, entries, kovaUsers, onLink }) {
  const [open, setOpen] = useState(FLAG_KINDS[kind].severity === "high");
  const meta = FLAG_KINDS[kind];
  const s = SEVERITY_STYLE[meta.severity];
  return (
    <View className="mb-2.5 rounded-xl border" style={{ backgroundColor: s.bg, borderColor: s.border }}>
      <Pressable onPress={() => setOpen((o) => !o)} className="flex-row items-center gap-2.5 p-3">
        <Ionicons name={s.icon} size={17} color={s.text} />
        <View className="flex-1">
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: s.text }}>
            {meta.title} · {entries.length}
          </Text>
          {open ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: s.text, marginTop: 3, opacity: 0.9 }}>
              {meta.help}
            </Text>
          ) : null}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={s.text} />
      </Pressable>
      {open ? (
        <View className="px-3 pb-3">
          {entries.map((e) => (
            <View
              key={e.email}
              className="mb-1.5 rounded-lg bg-white p-2.5"
            >
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: "#44403c" }}>{e.name}</Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.muted }}>
                  {e.attendance} sessions · target {e.target || "—"}
                </Text>
              </View>
              {kind === "unknownPackage" ? (
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: "#b23a22", marginTop: 3 }}>
                  {e.unknown.join(", ")}
                </Text>
              ) : (
                <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.muted, marginTop: 3 }}>
                  {e.packages || "no packages"}
                </Text>
              )}
              {/* The manual match table — taught once, remembered forever.
                  Terra's own Kilo email isn't her Kova login, and without the
                  link she'd be judged at 3x instead of the 2x staff floor. */}
              {(kind === "staffMismatch" || kind === "noKovaAccount") && isWeb ? (
                <View className="mt-2 flex-row items-center gap-2">
                  <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: colors.muted }}>Kova account:</Text>
                  <select
                    value={e.linkedUserId || ""}
                    onChange={(ev) => onLink(e.email, ev.target.value || null)}
                    style={{ fontFamily: fonts.sans, fontSize: 12, padding: "4px 6px", borderRadius: 6, border: "1px solid #d6d3d1", maxWidth: 260 }}
                  >
                    <option value="">— not linked —</option>
                    {kovaUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email} {u.role !== "member" ? `(${u.role})` : ""}
                      </option>
                    ))}
                  </select>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
