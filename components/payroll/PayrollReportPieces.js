import { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { entriesForCategory, formatMoney } from "../../lib/payroll/calc";
import { formatDateMD, formatDateMDY } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";
import { PayrollBottomSheet } from "./PayrollBottomSheet";

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
// layout (amount + a count/hours side by side per row). `entries`/
// `rateMaps` are optional — when provided, every row becomes tappable and
// opens a popup listing every individual date/entry that summed to that
// row's total ("tap Group, see every date and quantity that period").
// Reused as-is by the admin per-coach drill-down popup (D6), which just
// passes that one coach's own entries instead of the viewer's own.
export function CategoryBreakdown({ totals, entries, rateMaps }) {
  const [openCategoryKey, setOpenCategoryKey] = useState(null);
  const drillable = Boolean(entries && rateMaps);
  const openRow = ROWS.find((r) => r.key === openCategoryKey);
  const drillItems = openRow && drillable ? entriesForCategory(entries, openRow.key, rateMaps) : [];

  return (
    <View className="max-w-md rounded-2xl border border-stone-200 p-5">
      {ROWS.map((row) => {
        const amount = totals[row.amountKey] || 0;
        if (!amount && (!row.countKey || !totals[row.countKey])) return null;
        const RowWrapper = drillable ? Pressable : View;
        return (
          <RowWrapper
            key={row.key}
            className="mb-3 flex-row items-center justify-between"
            {...(drillable ? { onPress: () => setOpenCategoryKey(row.key) } : {})}
          >
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
            <View className="flex-row items-center gap-1.5">
              <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{formatMoney(amount)}</Text>
              {drillable ? <Ionicons name="chevron-forward" size={14} color="#d6d3d1" /> : null}
            </View>
          </RowWrapper>
        );
      })}
      <View className="mt-2 flex-row items-center justify-between border-t border-stone-200 pt-3">
        <Text style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>Total</Text>
        <Text className="text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
          {formatMoney(totals.total)}
        </Text>
      </View>

      {drillable ? (
        <PayrollBottomSheet visible={Boolean(openCategoryKey)} onClose={() => setOpenCategoryKey(null)} title={openRow?.label || ""}>
          {drillItems.length === 0 ? (
            <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
              Nothing logged for this period.
            </Text>
          ) : (
            drillItems.map((item, i) => (
              <View
                key={`${item.date}-${i}`}
                className="mb-2 flex-row items-center justify-between rounded-xl bg-white px-4 py-3"
                style={{ borderWidth: 1, borderColor: "#ece7e1" }}
              >
                <View>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>{formatDateMDY(item.date)}</Text>
                  <Text className="mt-0.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                    {item.quantityLabel}
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>{formatMoney(item.amount)}</Text>
              </View>
            ))
          )}
        </PayrollBottomSheet>
      ) : null}
    </View>
  );
}
