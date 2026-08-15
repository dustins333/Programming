import { useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatMoney, formatQuantity, entriesForCategory } from "../../lib/payroll/calc";
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

// Fixed metrics, so every row lands on the same grid whatever it contains.
// The category labels dropped from 10.5px to 9.5px and lost their unit
// sublines, which is what let the numeric columns come in from 86 to 58 —
// the header label is the widest thing in these columns, and "PROGRAMS" at
// 9.5px bold fits 58 where at 10.5px with "written" underneath it did not.
// The staff column is the flexible one: every numeric column is a fixed
// width because the figures have to line up, so any width the window has
// beyond the table's minimum goes here. `STAFF_CELL` is spread into the
// header, every row and the footer so all three flex identically — a fixed
// width on one and a flex on another is exactly how the grid drifts.
export const STAFF_WIDTH = 200;
export const STAFF_CELL = { flexGrow: 1, flexShrink: 0, flexBasis: STAFF_WIDTH, minWidth: STAFF_WIDTH };
// 66, measured not guessed: at 9.5px bold with 0.9 letter-spacing the
// widest header label ("PROGRAMS") renders 66px, and anything narrower
// ellipsises it to "PROGRA…". The mock's 58 works in HTML only because a
// bare div overflows silently; RN's numberOfLines={1} truncates instead.
const COL_WIDTH = 66;
const PAY_WIDTH = 88;
// 194 = 96 primary + 8 gap + 90 secondary. A row with only one action (a
// coach who hasn't submitted, a sent-back row) spans the full 194 rather
// than sitting at one end, so the rail's edges line up down the whole table.
const ACTION_WIDTH = 194;
// 8, not the mock's 16: the mock lays out six numeric columns and this
// table keeps all eight, so the gap is where the extra width has to come
// from. At 16 the whole table came out wider than the version this
// replaces, which would have made the restyle a regression on the one axis
// that matters here.
export const CELL_GAP = 8;
export const COL_LABEL_STYLE = { fontFamily: fonts.sansBold, letterSpacing: 0.9, fontSize: 9.5 };

// Status moved out of the Pay column and under the staff name, where the
// avatar can carry the same tone — that leaves Pay as money and nothing
// else, so every figure on the screen (footer included) lands on one right
// edge without competing with a status pill for the same cell.
const STATE_STYLE = {
  [REVIEW_APPROVED]: { label: "Approved", color: "#4d6142", avatarBg: "#eef1e7", avatarFg: "#4d6142" },
  [REVIEW_SUBMITTED]: { label: "Submitted · needs review", color: "#8a5a2e", avatarBg: "#f4ede3", avatarFg: "#8a5a2e" },
  [REVIEW_SENT_BACK]: { label: "Sent back", color: "#b23a22", avatarBg: "#fdece5", avatarFg: "#b23a22" },
  [REVIEW_NOT_SUBMITTED]: { label: "Not finalized yet", color: "#a8a29e", avatarBg: "#f1efed", avatarFg: "#78716c" },
};

// The two-slot review rail. `primary` is the 96px action, `secondary` the
// 90px one; passing only `full` gives a single 194px control instead.
function ReviewRail({ children }) {
  return (
    <View style={{ width: ACTION_WIDTH, flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>{children}</View>
  );
}

function RailButton({ label, onPress, width, tone = "quiet", disabled }) {
  const TONES = {
    primary: { bg: colors.primary, border: colors.primary, fg: "#ffffff", font: fonts.sansSemiBold },
    done: { bg: "#eef1e7", border: "#cbd6bd", fg: "#4d6142", font: fonts.sansSemiBold },
    quiet: { bg: "#ffffff", border: "#e7e5e4", fg: "#78716c", font: fonts.sansMedium },
    muted: { bg: "#ffffff", border: "#e7e5e4", fg: "#a8a29e", font: fonts.sansMedium },
  };
  const t = TONES[tone];
  const body = (
    <View
      style={{
        width,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.bg,
        paddingVertical: 7,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ fontFamily: t.font, fontSize: 11.5, color: t.fg }}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      {body}
    </Pressable>
  );
}

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
      {empty ? "—" : money ? formatMoney(value) : formatQuantity(value)}
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
  onReopen,
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteShown, setNoteShown] = useState(false);
  const [note, setNote] = useState("");
  const tone = STATE_STYLE[state];
  const needsReview = state === REVIEW_SUBMITTED;
  const firstName = (staff.name ?? "").split(/\s+/)[0] || "them";

  const handleSendBack = async () => {
    await onSendBack(note);
    setNote("");
    setNoteOpen(false);
  };

  return (
    <View style={{ backgroundColor: needsReview ? "#fdf6f2" : undefined }}>
      <View className="flex-row items-center px-5 py-3.5" style={{ gap: CELL_GAP }}>
        <Pressable onPress={onToggleExpand} className="flex-row items-center" style={{ ...STAFF_CELL, gap: 10 }}>
          <View className="items-center justify-center rounded-full" style={{ width: 30, height: 30, backgroundColor: tone.avatarBg }}>
            <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 11, color: tone.avatarFg }}>
              {initials(staff.name)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c" }}>
              {staff.name}
            </Text>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansMedium, fontSize: 10.5, color: tone.color }}>
              {tone.label}
            </Text>
          </View>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={13} color="#c9c4bd" />
        </Pressable>

        {REVIEW_COLUMNS.map((col) => (
          <Cell key={col.key} width={COL_WIDTH}>
            <Num value={col.value(totals)} money={col.money} />
          </Cell>
        ))}

        <Cell width={PAY_WIDTH}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: 14, color: state === REVIEW_NOT_SUBMITTED ? "#78716c" : "#2a211c" }}>
            {formatMoney(totals.total)}
          </Text>
        </Cell>

        {busy ? (
          <View style={{ width: ACTION_WIDTH, alignItems: "flex-end" }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : periodClosed ? (
          <ReviewRail>
            <RailButton label="Closed" width={ACTION_WIDTH} tone="muted" />
          </ReviewRail>
        ) : state === REVIEW_SUBMITTED ? (
          <ReviewRail>
            <RailButton label="Approve" width={96} tone="primary" onPress={onApprove} />
            <RailButton label="Send back" width={90} onPress={() => setNoteOpen((v) => !v)} />
          </ReviewRail>
        ) : state === REVIEW_APPROVED ? (
          <ReviewRail>
            <RailButton label="✓ Approved" width={96} tone="done" />
            <RailButton label="Undo" width={90} onPress={onUnapprove} />
          </ReviewRail>
        ) : state === REVIEW_SENT_BACK ? (
          <ReviewRail>
            <RailButton
              label={finalization?.send_back_note ? (noteShown ? "Hide note" : "View note") : "Sent back"}
              width={ACTION_WIDTH}
              onPress={finalization?.send_back_note ? () => setNoteShown((v) => !v) : undefined}
            />
          </ReviewRail>
        ) : (
          <ReviewRail>
            <RailButton label={`Waiting on ${firstName}`} width={ACTION_WIDTH} tone="muted" />
          </ReviewRail>
        )}
      </View>

      {/* A send-back note is prose, so it gets a full-width line under the
          row rather than being squeezed into a column. Behind the rail's
          View note toggle now — on a table this dense, a note on every
          sent-back row was reading as an error state on the whole screen. */}
      {state === REVIEW_SENT_BACK && noteShown && finalization?.send_back_note ? (
        <View className="px-5 pb-3">
          <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12 }}>
            Sent back — “{finalization.send_back_note}”
          </Text>
        </View>
      ) : null}

      {noteOpen ? (
        <View className="px-5 pb-4">
          <View className="rounded-xl border p-3.5" style={{ borderColor: "#f0ddd2", backgroundColor: "#fdf6f2", maxWidth: 560 }}>
            <Text className="mb-2" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>
              {/* Guarded the same way initials() above is — a staff row can
                  carry a null name. */}
              What should {firstName} fix?
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
            <View className="flex-row items-center justify-between">
              {/* The rail only has two slots, so the plain unlock lives here
                  — at the moment it's relevant. Send back is for "fix this
                  specific thing"; this is for "they just asked to add a
                  day", which otherwise forces an admin to invent a
                  rejection reason to grant. */}
              {onReopen ? (
                <Pressable onPress={onReopen} hitSlop={6}>
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: "#8a5140" }}>Just reopen it, no note</Text>
                </Pressable>
              ) : (
                <View />
              )}
              <View className="flex-row gap-2">
                <Pressable onPress={() => setNoteOpen(false)} className="rounded-lg border px-3 py-2" style={{ borderColor: "#d9d4cd" }}>
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#57534e" }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSendBack}
                  disabled={!note.trim()}
                  className="rounded-lg px-3 py-2"
                  style={{ backgroundColor: "#b23a22", opacity: note.trim() ? 1 : 0.5 }}
                >
                  <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>
                    Send back
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {expanded ? <View className="px-5 pb-4">{<EntryDetail entries={entries} rateMaps={rateMaps} totals={totals} />}</View> : null}
    </View>
  );
}

export { COL_WIDTH, PAY_WIDTH, ACTION_WIDTH };
