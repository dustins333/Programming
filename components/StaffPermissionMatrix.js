import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { fonts, colors } from "../lib/theme";

// The four per-coach module flags on core.users. Shared by the web matrix
// below and settings.js's own native card list so the two can't drift on
// which flags exist or what each one defaults to — SPC/Nutrition/Exercise
// Library default on (0015), Ops Hours defaults off (0036), matching each
// column's own DB default rather than one blanket `?? true`.
export const PERMISSION_COLUMNS = [
  { field: "can_view_spc", label: "SPC", defaultValue: true },
  { field: "can_view_nutrition", label: "Nutrition", defaultValue: true },
  { field: "can_view_exercise_library", label: "Exercise Library", defaultValue: true },
  { field: "can_log_ops_hours", label: "Ops Hours", defaultValue: false },
];

const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// An admin's cells render checked-but-inert rather than being left blank:
// admin genuinely has every module, and an empty cell would read as "no
// access". Disabled styling (tan on tan) is what says it isn't editable.
function PermissionCheckbox({ checked, disabled, saving, onToggle, accessibilityLabel }) {
  const box = (
    <View
      className="items-center justify-center rounded-md"
      style={{
        width: 22,
        height: 22,
        borderWidth: checked ? 0 : 1.5,
        borderColor: "#d9d4cd",
        backgroundColor: checked ? (disabled ? "#e7e0d8" : "#4d6142") : "#ffffff",
        opacity: saving ? 0.5 : 1,
      }}
    >
      {checked ? <Ionicons name="checkmark" size={14} color={disabled ? "#b5aca1" : "#ffffff"} /> : null}
    </View>
  );
  if (disabled) return <View className="items-center">{box}</View>;
  return (
    <Pressable
      onPress={onToggle}
      disabled={saving}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      className="items-center"
    >
      {box}
    </Pressable>
  );
}

// Web-only: one row per staff member, one column per module flag, so "who
// can do what" reads down a column instead of needing five cards opened.
// Native keeps the per-coach card list in settings.js — four toggle rows
// per coach fit a phone; a five-column table doesn't.
export function StaffPermissionMatrix({ coaches, currentUserId, savingPermKey, onTogglePermission }) {
  const router = useRouter();

  return (
    <View className="rounded-2xl border bg-white" style={[{ borderColor: "#ece7e1", overflow: "hidden" }, CARD_SHADOW]}>
      <View className="flex-row items-center px-[18px] py-3" style={{ borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>
        <Text className="flex-1 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
          Staff member
        </Text>
        {PERMISSION_COLUMNS.map((col) => (
          <Text
            key={col.field}
            className="text-center text-xs uppercase text-stone-400"
            style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, width: 108 }}
          >
            {col.label}
          </Text>
        ))}
        <View style={{ width: 108 }} />
      </View>

      {coaches.map((coach, idx) => {
        const isAdmin = coach.role === "admin";
        const isSelf = coach.id === currentUserId;
        return (
          <View
            key={coach.id}
            className="flex-row items-center px-[18px] py-3.5"
            style={idx < coaches.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f2efeb" } : undefined}
          >
            <View className="flex-1 flex-row items-center gap-3">
              <View className="items-center justify-center rounded-full" style={{ width: 34, height: 34, backgroundColor: "#fdf6f2" }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.primaryOnWhite }}>{initials(coach.name)}</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
                    {coach.name}
                  </Text>
                  {isAdmin ? (
                    <View className="rounded-full px-2 py-[3px]" style={{ backgroundColor: "#44403c" }}>
                      <Text style={{ fontFamily: fonts.sansBold, color: "#ffffff", fontSize: 9.5, letterSpacing: 0.4 }}>ADMIN</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="mt-0.5 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12 }} numberOfLines={1}>
                  {coach.email}
                </Text>
              </View>
            </View>

            {PERMISSION_COLUMNS.map((col) => (
              <View key={col.field} style={{ width: 108 }}>
                <PermissionCheckbox
                  checked={isAdmin ? true : coach[col.field] ?? col.defaultValue}
                  disabled={isAdmin}
                  saving={savingPermKey === `${coach.id}:${col.field}`}
                  onToggle={() => onTogglePermission(coach, col.field, !(coach[col.field] ?? col.defaultValue))}
                  accessibilityLabel={`${col.label} access for ${coach.name}`}
                />
              </View>
            ))}

            <View className="items-end" style={{ width: 108 }}>
              {isSelf ? (
                <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
                  you
                </Text>
              ) : (
                <Pressable onPress={() => router.push(`/(coach)/clients/${coach.id}`)} hitSlop={6}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 12.5 }}>Own training ›</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
