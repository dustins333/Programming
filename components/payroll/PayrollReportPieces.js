import { View, Text, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney } from "../../lib/payroll/calc";
import { formatDateMD } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

const isWeb = Platform.OS === "web";

function periodLabel(period) {
  if (!period) return "";
  return period.label || `${formatDateMD(period.start_date)} – ${formatDateMD(period.end_date)}`;
}

// Shared by every report screen (own report + admin all-employee) — a
// dropdown on web, a Pressable-opens-modal-list on native would be more
// consistent with the rest of the app, but this list is short (a couple
// dozen periods at most) and reads fine as simple prev/next arrows plus a
// label, which is lighter to build and matches how a coach actually wants
// to use it (mostly "this period" or "one back").
export function PeriodPicker({ options, selected, onChange }) {
  const index = options.findIndex((p) => p.start_date === selected);
  const goPrev = () => {
    if (index < options.length - 1) onChange(options[index + 1].start_date);
  };
  const goNext = () => {
    if (index > 0) onChange(options[index - 1].start_date);
  };
  const current = options[index];

  return (
    <View className="mb-5 flex-row items-center gap-3">
      <Pressable onPress={goPrev} disabled={index >= options.length - 1} hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color={index >= options.length - 1 ? "#d6d3d1" : colors.primaryOnWhite} />
      </Pressable>
      <View className="min-w-[160px] items-center">
        <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{periodLabel(current)}</Text>
        {current?.closed ? (
          <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            Closed
          </Text>
        ) : null}
      </View>
      <Pressable onPress={goNext} disabled={index <= 0} hitSlop={8}>
        <Ionicons name="chevron-forward" size={20} color={index <= 0 ? "#d6d3d1" : colors.primaryOnWhite} />
      </Pressable>
    </View>
  );
}

const ROWS = [
  { key: "group", label: "Group", amountKey: "groupAmount", countKey: "groupCount", countLabel: "sessions" },
  { key: "strategy", label: "Strategy sessions", amountKey: "strategyAmount", countKey: "strategyCount", countLabel: "sessions" },
  { key: "programs", label: "Programs written", amountKey: "programsAmount", countKey: "programsCount", countLabel: "programs" },
  { key: "admin", label: "Admin", amountKey: "adminAmount", countKey: "adminHours", countLabel: "hours" },
  { key: "welcome", label: "Welcome sessions", amountKey: "welcomeAmount", countKey: "welcomeCount", countLabel: "sessions" },
  { key: "ops", label: "Ops", amountKey: "opsAmount", countKey: "opsHours", countLabel: "hours" },
  { key: "spc", label: "SPC", amountKey: "spcAmount", countKey: "spcAttendees", countLabel: "attendees" },
  { key: "other", label: "Other", amountKey: "otherAmount" },
  { key: "custom", label: "Custom", amountKey: "customAmount" },
];

// Mirrors the real Glide Payroll Report screen's category-by-category
// layout (amount + a count/hours side by side per row).
export function CategoryBreakdown({ totals }) {
  return (
    <View className="max-w-md rounded-2xl border border-stone-200 p-5">
      {ROWS.map((row) => {
        const amount = totals[row.amountKey] || 0;
        if (!amount && (!row.countKey || !totals[row.countKey])) return null;
        return (
          <View key={row.key} className="mb-3 flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                {row.label}
              </Text>
              {row.countKey ? (
                <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                  {totals[row.countKey]} {row.countLabel}
                </Text>
              ) : null}
            </View>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{formatMoney(amount)}</Text>
          </View>
        );
      })}
      <View className="mt-2 flex-row items-center justify-between border-t border-stone-200 pt-3">
        <Text style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>Total</Text>
        <Text className="text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
          {formatMoney(totals.total)}
        </Text>
      </View>
    </View>
  );
}
