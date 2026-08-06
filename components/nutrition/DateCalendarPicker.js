import { useMemo, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { todayInBoise, dayOfWeekInBoise } from "../../lib/boiseDate";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  // month is 1-12
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Pure calendar-grid math on plain year/month integers — deliberately never
// touches a Date object for anything beyond dayOfWeekInBoise's own internal
// noon-anchored parse, matching this app's standing "never trust device
// local time for date math" rule (lib/boiseDate.js).
function buildMonthGrid(year, month) {
  const monthStart = `${year}-${pad2(month)}-01`;
  const firstWeekday = dayOfWeekInBoise(monthStart); // 0=Sun
  const total = daysInMonth(year, month);

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= total; day++) cells.push(`${year}-${pad2(month)}-${pad2(day)}`);
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Bottom-sheet multi-select month calendar — tap days to toggle, "Assign N
// dates" bulk-adds them all at once. Replaces a plain YYYY-MM-DD text field
// per direct ask for something that actually feels like picking dates off a
// calendar. `alreadyAssigned` (a Set of date strings) renders those days as
// a fixed, non-interactive "already assigned" state so a coach can't
// double-add (objective_tracking_dates has a real unique(client_id, date)
// constraint) — the calendar itself doubles as a visual record of what's
// already on the books, no separate legend needed.
export function DateCalendarPicker({ visible, onClose, alreadyAssigned, onConfirm }) {
  const today = todayInBoise();
  const [year, initialMonth] = today.split("-").map(Number);
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [selected, setSelected] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const goMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  const toggleDate = (date) => {
    if (alreadyAssigned.has(date)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const handleClose = () => {
    setSelected(new Set());
    onClose();
  };

  const handleConfirm = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await onConfirm(Array.from(selected));
      setSelected(new Set());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <Pressable onPress={handleClose} className="flex-1 justify-end" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            maxHeight: "85%",
            width: "100%",
            maxWidth: 440,
            alignSelf: "center",
            backgroundColor: "#faf8f6",
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingTop: 18,
            paddingBottom: 20,
          }}
        >
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20 }}>
            <Text className="mb-4 text-lg" style={{ fontFamily: fonts.display, color: colors.primary }}>
              Assign tracking dates
            </Text>

            <View className="mb-3 flex-row items-center justify-between">
              <Pressable onPress={() => goMonth(-1)} hitSlop={10} className="px-2 py-1">
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.primaryOnWhite }}>‹</Text>
              </Pressable>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15 }}>
                {MONTH_LABELS[viewMonth - 1]} {viewYear}
              </Text>
              <Pressable onPress={() => goMonth(1)} hitSlop={10} className="px-2 py-1">
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, color: colors.primaryOnWhite }}>›</Text>
              </Pressable>
            </View>

            <View className="mb-1 flex-row">
              {WEEKDAY_LABELS.map((label, i) => (
                <View key={i} style={{ width: `${100 / 7}%` }} className="items-center py-1">
                  <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sansMedium }}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            <View className="flex-row flex-wrap">
              {cells.map((date, i) => {
                if (!date) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;

                const isAssigned = alreadyAssigned.has(date);
                const isSelected = selected.has(date);
                const isToday = date === today;
                const day = Number(date.slice(8, 10));

                let bg = "transparent";
                let textColor = "#292524";
                let borderColor = "transparent";
                if (isAssigned) {
                  bg = "#dbe8cf";
                  textColor = "#4d6142";
                } else if (isSelected) {
                  bg = colors.primary;
                  textColor = "white";
                } else if (isToday) {
                  borderColor = colors.primary;
                }

                return (
                  <View key={date} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} className="items-center justify-center p-0.5">
                    <Pressable
                      onPress={() => toggleDate(date)}
                      disabled={isAssigned}
                      className="items-center justify-center rounded-full"
                      style={{ width: "82%", height: "82%", backgroundColor: bg, borderWidth: borderColor === "transparent" ? 0 : 1.5, borderColor }}
                    >
                      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: textColor }}>{day}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View className="mt-4 flex-row items-center gap-4">
              <View className="flex-row items-center gap-1.5">
                <View className="rounded-full" style={{ width: 12, height: 12, backgroundColor: "#dbe8cf" }} />
                <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Already assigned
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="rounded-full" style={{ width: 12, height: 12, backgroundColor: colors.primary }} />
                <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Selected
                </Text>
              </View>
            </View>
          </ScrollView>

          <View className="mt-4 flex-row items-center justify-between" style={{ paddingHorizontal: 20 }}>
            <Pressable onPress={handleClose} hitSlop={8}>
              <Text style={{ fontFamily: fonts.sansMedium, color: "#78716c" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={selected.size === 0 || saving}
              className="rounded-lg px-5 py-3"
              style={{ backgroundColor: colors.primary, opacity: selected.size === 0 || saving ? 0.5 : 1 }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {saving ? "Assigning…" : `Assign ${selected.size || ""} date${selected.size === 1 ? "" : "s"}`.trim()}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
