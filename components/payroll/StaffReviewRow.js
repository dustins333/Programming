import { useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney, entriesForCategory } from "../../lib/payroll/calc";
import { REVIEW_APPROVED, REVIEW_SENT_BACK, REVIEW_SUBMITTED, REVIEW_NOT_SUBMITTED } from "../../lib/payroll/finalizations";
import { formatDateMD } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

// The eight category columns, in the order the real Payroll Report uses.
// `value` reads the count/hours side of computeTotals (what the admin is
// actually reviewing — "9 SPC sessions" is checkable, "$584" isn't), while
// the Pay column carries the money. Amounts stay one column so the grid
// doesn't turn into sixteen.
export const REVIEW_COLUMNS = [
  { key: "group", label: "Group", unit: "sess", value: (t) => t.groupCount },
  { key: "spc", label: "SPC", unit: "sess", value: (t) => t.spcSessions },
  { key: "programs", label: "Programs", unit: "written", value: (t) => t.programsCount },
  { key: "welcome", label: "Welcome", unit: "sess", value: (t) => t.welcomeCount },
  { key: "strategy", label: "Strategy", unit: "sess", value: (t) => t.strategyCount },
  { key: "admin", label: "Admin", unit: "hrs", value: (t) => t.adminHours },
  { key: "ops", label: "Ops", unit: "hrs", value: (t) => t.opsHours },
  { key: "other", label: "Other", unit: "amt", value: (t) => t.otherAmount, money: true },
];

// 86, not 74: "STRATEGY" and "PROGRAMS" as uppercase header labels overflow
// anything narrower and visibly run into the next column's label. Measured
// in the browser rather than guessed.
const COL_WIDTH = 86;
const PAY_WIDTH = 110;
// 196, measured not guessed: Send back (86) + gap (8) + Approve (76) =
// 170, plus the cell's own 14px right padding and a little air. At 168 the
// pair overflowed left into the Other column.
const ACTION_WIDTH = 196;
export const COL_LABEL_STYLE = { fontFamily: fonts.sansBold, letterSpacing: 0.3, fontSize: 10.5 };

const STATE_STYLE = {
  [REVIEW_APPROVED]: { label: "Approved", color: "#4d6142", dot: "#4d6142" },
  [REVIEW_SUBMITTED]: { label: "Submitted", color: "#8a6d3b", dot: "#c08b3e" },
  [REVIEW_SENT_BACK]: { label: "Sent back", color: "#b23a22", dot: "#b23a22" },
  [REVIEW_NOT_SUBMITTED]: { label: "Not submitted", color: "#b23a22", dot: "#b23a22" },
};

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Cell({ children, width, align = "right", style }) {
  return (
    <View style={{ width, alignItems: align === "right" ? "flex-end" : "flex-start", ...style }}>
      {children}
    </View>
  );
}

function Num({ value, money, muted }) {
  const empty = !value;
  return (
    <Text
      style={{
        fontFamily: empty ? fonts.sans : fonts.sansSemiBold,
        fontSize: 13,
        color: empty ? "#c9c4bd" : muted ? "#78716c" : "#44403c",
      }}
    >
      {empty ? "—" : money ? formatMoney(value) : value}
    </Text>
  );
}

// The expanded line-item table under a row being reviewed. Deliberately
// flat and chronological rather than grouped by category — the admin is
// scanning for "did anything odd happen this fortnight", and an outlier is
// easier to spot against its own neighbours in time.
function EntryDetail({ entries, rateMaps, totals }) {
  const items = REVIEW_COLUMNS.concat({ key: "custom" })
    .flatMap((col) => entriesForCategory(entries, col.key, rateMaps).map((it) => ({ ...it, category: col.key })))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const LABELS = Object.fromEntries(REVIEW_COLUMNS.map((c) => [c.key, c.label]));
  LABELS.custom = "Custom";

  // "2× your average" style outlier marking, but only where it's real: a
  // single Admin/Ops entry more than double this coach's own mean for that
  // category over the period. Nothing is flagged when there's only one
  // entry to average against — that would flag every first entry.
  const meanByCategory = {};
  for (const key of ["admin", "ops"]) {
    const forKey = items.filter((i) => i.category === key);
    if (forKey.length > 1) meanByCategory[key] = forKey.reduce((s, i) => s + i.amount, 0) / forKey.length;
  }

  if (items.length === 0) {
    return (
      <Text className="px-4 py-4 text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
        No entries logged for this period.
      </Text>
    );
  }

  return (
    <View className="overflow-hidden rounded-xl border" style={{ borderColor: "#ece7e1", backgroundColor: "#ffffff" }}>
      <View className="flex-row px-4 py-2.5" style={{ backgroundColor: "#faf8f6", borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>
        <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, width: 72 }}>
          Date
        </Text>
        <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, width: 96 }}>
          Category
        </Text>
        <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, width: 84 }}>
          Qty
        </Text>
        <Text className="flex-1 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
          Notes
        </Text>
        <Text className="text-right text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, width: 84 }}>
          Total
        </Text>
      </View>
      {items.map((item, idx) => {
        const mean = meanByCategory[item.category];
        const outlier = mean != null && item.amount > mean * 2;
        // An "Other" line is only meaningful with its type spelled out —
        // "$90" under a category called "Other" tells a coach nothing. The
        // type (and its count) lead the Notes cell, with whatever free note
        // was typed after it; the Qty column then just carries the number.
        const isOther = item.category === "other";
        const otherQty = item.entry?.other_qty ?? 1;
        const qtyText = isOther ? `×${otherQty}` : item.quantityLabel;
        const notesText = isOther
          ? [item.entry?.other_type, item.notes].filter(Boolean).join(" · ")
          : item.notes || "";
        return (
          <View
            key={`${item.category}-${item.date}-${idx}`}
            className="flex-row items-center px-4 py-2.5"
            style={{
              backgroundColor: outlier ? "#fdf6f2" : undefined,
              ...(idx < items.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f5f2ee" } : null),
            }}
          >
            <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5, width: 72 }}>
              {formatDateMD(item.date)}
            </Text>
            <Text className="text-stone-600" style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, width: 96 }}>
              {LABELS[item.category]}
            </Text>
            <Text className="text-stone-600" style={{ fontFamily: fonts.sans, fontSize: 12.5, width: 84 }}>
              {qtyText}
            </Text>
            <View className="flex-1 pr-3">
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: notesText ? "#44403c" : "#c9c4bd" }}>
                {notesText || "—"}
                {outlier ? <Text style={{ fontFamily: fonts.sansSemiBold, color: "#b23a22" }}> · 2× your average</Text> : null}
              </Text>
            </View>
            <Text className="text-right" style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c", width: 84 }}>
              {formatMoney(item.amount)}
            </Text>
          </View>
        );
      })}
      <View className="flex-row items-center px-4 py-2.5" style={{ backgroundColor: "#faf8f6", borderTopWidth: 1, borderTopColor: "#ece7e1" }}>
        <Text className="flex-1 text-stone-500" style={{ fontFamily: fonts.sansMedium, fontSize: 12.5 }}>
          {items.length} entr{items.length === 1 ? "y" : "ies"}
        </Text>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>{formatMoney(totals.total)}</Text>
      </View>
    </View>
  );
}

export function StaffReviewRow({
  staff,
  totals,
  entries,
  rateMaps,
  state,
  finalization,
  expanded,
  busy,
  periodClosed,
  onToggleExpand,
  onApprove,
  onUnapprove,
  onSendBack,
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const tone = STATE_STYLE[state];
  const needsReview = state === REVIEW_SUBMITTED;

  const handleSendBack = async () => {
    await onSendBack(note);
    setNote("");
    setNoteOpen(false);
  };

  return (
    <View style={needsReview ? { borderLeftWidth: 3, borderLeftColor: colors.primary } : { borderLeftWidth: 3, borderLeftColor: "transparent" }}>
      <View className="flex-row items-center px-[15px] py-3.5">
        <Pressable onPress={onToggleExpand} className="flex-1 flex-row items-center gap-3" style={{ minWidth: 190 }}>
          <View className="items-center justify-center rounded-full" style={{ width: 34, height: 34, backgroundColor: "#fdf6f2" }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: colors.primaryOnWhite }}>{initials(staff.name)}</Text>
          </View>
          <View className="flex-1">
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700" numberOfLines={1}>
              {staff.name}
            </Text>
            <Text className="mt-0.5 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 11.5 }} numberOfLines={1}>
              {staff.role === "admin" ? "Admin" : "Coach"}
            </Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color="#c9c4bd" />
        </Pressable>

        {REVIEW_COLUMNS.map((col) => (
          <Cell key={col.key} width={COL_WIDTH}>
            <Num value={col.value(totals)} money={col.money} />
          </Cell>
        ))}

        {/* Actions get their own column so the money column stays pure —
            a row with buttons and a row without must not push their totals
            to different x positions. */}
        <Cell width={ACTION_WIDTH} align="right" style={{ paddingRight: 14 }}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : periodClosed ? null : state === REVIEW_SUBMITTED ? (
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => setNoteOpen((v) => !v)} className="rounded-lg border px-2.5 py-1.5" style={{ borderColor: "#d9d4cd" }}>
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: "#57534e" }}>Send back</Text>
              </Pressable>
              <Pressable onPress={onApprove} className="rounded-lg px-3 py-1.5" style={{ backgroundColor: "#4d6142" }}>
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 12 }}>
                  Approve
                </Text>
              </Pressable>
            </View>
          ) : state === REVIEW_APPROVED ? (
            <Pressable onPress={onUnapprove} hitSlop={6}>
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: "#a8a29e" }}>undo</Text>
            </Pressable>
          ) : null}
        </Cell>

        {/* Status sits above the money, and the money is the last thing on
            the row — so every total on this screen, the footer's included,
            lands on one right edge. */}
        <Cell width={PAY_WIDTH}>
          <View className="flex-row items-center gap-1.5">
            <View className="rounded-full" style={{ width: 6, height: 6, backgroundColor: tone.dot }} />
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: tone.color }}>{tone.label}</Text>
          </View>
          <Text className="mt-0.5" style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#44403c" }}>
            {formatMoney(totals.total)}
          </Text>
        </Cell>
      </View>

      {/* A send-back note is prose, so it gets a full-width line under the
          row rather than being squeezed into a column. */}
      {state === REVIEW_SENT_BACK && finalization?.send_back_note ? (
        <View className="px-[15px] pb-3">
          <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
            Sent back — “{finalization.send_back_note}”
          </Text>
        </View>
      ) : null}

      {noteOpen ? (
        <View className="px-[15px] pb-4">
          <View className="rounded-xl border p-3.5" style={{ borderColor: "#f0ddd2", backgroundColor: "#fdf6f2", maxWidth: 560 }}>
            <Text className="mb-2" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>
              What should {staff.name.split(/\s+/)[0]} fix?
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Ops hours on Aug 6 look doubled"
              multiline
              className="mb-2.5 rounded-lg border bg-white px-3 py-2.5"
              style={{ fontFamily: fonts.sans, fontSize: 13, borderColor: "#e7ddd5", minHeight: 60 }}
            />
            <Text className="mb-2.5 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 11.5 }}>
              Sending back unlocks their entries for this period so they can edit and re-submit.
            </Text>
            <View className="flex-row justify-end gap-2">
              <Pressable onPress={() => setNoteOpen(false)} className="rounded-lg border px-3 py-2" style={{ borderColor: "#d9d4cd" }}>
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#57534e" }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSendBack} disabled={!note.trim()} className="rounded-lg px-3 py-2" style={{ backgroundColor: "#b23a22", opacity: note.trim() ? 1 : 0.5 }}>
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>
                  Send back
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {expanded ? <View className="px-[15px] pb-4">{<EntryDetail entries={entries} rateMaps={rateMaps} totals={totals} />}</View> : null}
    </View>
  );
}

export { COL_WIDTH, PAY_WIDTH, ACTION_WIDTH };
