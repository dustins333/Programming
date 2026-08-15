import { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { entriesForCategory, formatMoney, formatQuantity } from "../../lib/payroll/calc";
import { formatDateMD, formatDateMDY, formatDateRange } from "../../lib/formatDate";
import { daysBetween } from "../../lib/boiseDate";
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

// My Pay's header — the one dark surface in the whole payroll flow, because
// this is the screen a coach opens to see what they've earned and the money
// should be the first and largest thing on it. The period stepper and the
// open/closed state ride in the same band so the number is never ambiguous
// about which fortnight it belongs to.
//
// The bar is ELAPSED PERIOD TIME, not days logged — deliberate, per direct
// call: most coaches don't work every day, so a bar that filled with
// submissions would imply a daily submit is owed and read as "behind" to
// someone who simply wasn't rostered. It answers "how much of this period
// is left", nothing more.
export function PayPeriodBand({ options, selected, onChange, total, today }) {
  const index = options.findIndex((p) => p.start_date === selected);
  const current = options[index];
  const goPrev = () => {
    if (index < options.length - 1) onChange(options[index + 1].start_date);
  };
  const goNext = () => {
    if (index > 0) onChange(options[index - 1].start_date);
  };

  const start = current?.start_date;
  const end = current?.end_date;
  // Month-name range here rather than periodLabel's MM/DD — this is a
  // heading, not a grid cell, and it should read the same as the Log
  // header and the finalize sheet.
  const label = formatDateRange(start, end) || periodLabel(current);
  const length = start && end ? daysBetween(end, start) + 1 : 0;
  // Only the period that actually contains today gets a progress bar: on a
  // finished period it would always read full, and on a future one empty,
  // neither of which tells anyone anything.
  const elapsed = start && today ? daysBetween(today, start) + 1 : null;
  const showProgress = Boolean(length && elapsed !== null && elapsed >= 1 && elapsed <= length);
  const pct = showProgress ? Math.round((elapsed / length) * 100) : 0;

  const statusLabel = current?.closed ? "Closed" : showProgress ? "Open" : "Ended";

  return (
    <View style={{ backgroundColor: "#3b3531", borderRadius: 20, paddingVertical: 16, paddingHorizontal: 18 }}>
      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <Pressable onPress={goPrev} disabled={index >= options.length - 1} hitSlop={10} style={{ opacity: index >= options.length - 1 ? 0.4 : 1 }}>
            <Text style={{ fontSize: 15, color: "#a99f96", fontFamily: fonts.sansMedium }}>‹</Text>
          </Pressable>
          <Text style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: "white" }}>{label}</Text>
          <Pressable onPress={goNext} disabled={index <= 0} hitSlop={10} style={{ opacity: index <= 0 ? 0.4 : 1 }}>
            <Text style={{ fontSize: 15, color: "#a99f96", fontFamily: fonts.sansMedium }}>›</Text>
          </Pressable>
        </View>
        <View style={{ borderWidth: 1, borderColor: "#6b625b", borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 }}>
          <Text maxFontSizeMultiplier={1.1} style={{ fontSize: 10, fontFamily: fonts.sansSemiBold, color: "#c9beb4" }}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 9.5, fontFamily: fonts.sansBold, letterSpacing: 1.1, color: "#a99f96", marginBottom: 3 }}>
        PAY THIS PERIOD
      </Text>
      <Text style={{ fontSize: 38, fontFamily: fonts.sansBold, color: "white", lineHeight: 42 }}>{formatMoney(total)}</Text>

      {showProgress ? (
        <View className="mt-3 flex-row items-center" style={{ gap: 7 }}>
          <View style={{ flex: 1, height: 6, borderRadius: 99, backgroundColor: "#544c46", overflow: "hidden" }}>
            <View style={{ width: `${pct}%`, height: "100%", borderRadius: 99, backgroundColor: "#8fb473" }} />
          </View>
          <Text maxFontSizeMultiplier={1.1} style={{ fontSize: 10.5, fontFamily: fonts.sansSemiBold, color: "#c9beb4" }}>
            Day {elapsed} of {length}
          </Text>
        </View>
      ) : null}
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

  const visible = ROWS.filter((row) => (totals[row.amountKey] || 0) || (row.countKey && totals[row.countKey]));

  return (
    <View style={{ maxWidth: 460, backgroundColor: "white", borderWidth: 1, borderColor: "#ece7e1", borderRadius: 16, paddingHorizontal: 14 }}>
      {visible.map((row, i) => {
        const amount = totals[row.amountKey] || 0;
        const RowWrapper = drillable ? Pressable : View;
        return (
          <RowWrapper
            key={row.key}
            className="flex-row items-center justify-between"
            style={{
              paddingVertical: 11,
              // Every row but the last carries the hairline, so the card
              // never ends on a divider with nothing under it.
              ...(i < visible.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f4f0ec" } : null),
            }}
            {...(drillable ? { onPress: () => setOpenCategoryKey(row.key) } : {})}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{row.label}</Text>
              {row.countKey ? (
                <Text numberOfLines={1} style={{ fontSize: 10.5, fontFamily: fonts.sans, color: "#b5aea7", marginTop: 2 }}>
                  {formatQuantity(totals[row.countKey])} {row.countLabel}
                </Text>
              ) : null}
            </View>
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontFamily: fonts.sansBold, color: "#2a211c" }}>{formatMoney(amount)}</Text>
              {drillable ? <Ionicons name="chevron-forward" size={13} color="#d6cec7" /> : null}
            </View>
          </RowWrapper>
        );
      })}
      {visible.length === 0 ? (
        <Text style={{ paddingVertical: 14, fontSize: 12.5, fontFamily: fonts.sans, color: "#a8a29e" }}>
          Nothing logged for this period yet.
        </Text>
      ) : null}
      <View className="flex-row items-center justify-between" style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#ece7e1" }}>
        <Text style={{ fontSize: 12.5, fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>Total</Text>
        <Text style={{ fontSize: 15, fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>{formatMoney(totals.total)}</Text>
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
                className="mb-2 flex-row items-start justify-between rounded-xl bg-white px-4 py-3"
                style={{ borderWidth: 1, borderColor: "#ece7e1" }}
              >
                <View className="flex-1 pr-3">
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>{formatDateMDY(item.date)}</Text>
                  <Text className="mt-0.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                    {item.quantityLabel}
                  </Text>
                  {item.notes ? (
                    <Text className="mt-1 text-xs" style={{ fontFamily: fonts.sans, color: "#a8a29e", fontStyle: "italic" }}>
                      {item.notes}
                    </Text>
                  ) : null}
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
