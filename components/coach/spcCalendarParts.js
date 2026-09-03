import { View, Text, Modal } from "react-native";
import { formatDateRange } from "../../lib/formatDate";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";
import { DAY_LETTERS, barLabel, packLines } from "./spcCalendarModel";

// Presentational half of the SPC block calendar. Both SpcBlockCalendar.js
// (native) and SpcBlockCalendar.web.js render these, so the two platforms
// cannot drift on what a state looks like — only on how a session is moved
// (native: a week picker; web: drag).

// The dashed states carry redundant cues (wording + colour) on purpose — a
// fully-rounded dashed border can render solid on iOS, and these must still
// be tellable apart if it does.
export const CANVAS_PEACH = "#fdf6f2";
export const BORDER = "#ece7e1";
export const BORDER_STRONG = "#ddd5cd";
export const OLIVE = "#4d6142";
export const OLIVE_TINT = "#dbe8cf";
export const ALERT = "#b23a22";
export const LABEL_WIDTH = 116;
export const LABEL_GAP = 14;
// Matches the mock's own breakpoint: above it the week label sits in a left
// column, below it it stacks above the track so the seven day columns get the
// full width (at 390px that is ~50px a column, enough for a done chip).
export const WIDE_AT = 620;

const TONES = {
  pending: { borderColor: colors.primary, borderStyle: "solid", color: colors.primaryOnWhite, font: fonts.sansSemiBold },
  pastOpen: { borderColor: BORDER_STRONG, borderStyle: "dashed", color: colors.muted, font: fonts.sansSemiBold },
  draft: { borderColor: BORDER_STRONG, borderStyle: "dashed", color: colors.hint, font: fonts.sans },
  notWritten: { borderColor: BORDER_STRONG, borderStyle: "dashed", color: colors.hint, font: fonts.sans },
};

// A bar that has been moved keeps a small tag naming the week it was written
// in — without it a make-up sitting next to that week's own sessions reads as
// a session the coach forgot she'd already programmed.
function MovedTag({ week }) {
  return (
    <View style={{ backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 9, letterSpacing: 0.5, color: "#fff" }}>
        WK {week}
      </Text>
    </View>
  );
}

// `action` is the "Do this week" pill; `dragging` renders the drag preview.
export function Bar({ bar, onPress, action, dragging = false }) {
  const tone = TONES[bar.state];
  const pressable = Boolean(bar.workout && onPress);
  const style = {
    borderRadius: 999,
    borderWidth: 1.5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderColor: tone.borderColor,
    borderStyle: tone.borderStyle,
    backgroundColor: bar.movedFrom || dragging ? "#fff" : "transparent",
    ...(dragging ? { shadowColor: "#44403c", shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 } : null),
  };
  const inner = (
    <>
      {bar.movedFrom ? <MovedTag week={bar.movedFrom} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ flexShrink: 1, fontFamily: tone.font, fontSize: 12, color: tone.color }}>
        {barLabel(bar)}
      </Text>
      {action ? <View style={{ marginLeft: "auto" }}>{action}</View> : null}
    </>
  );
  return pressable ? (
    <PressFade onPress={() => onPress(bar.workout)} style={style}>
      {inner}
    </PressFade>
  ) : (
    <View style={style}>{inner}</View>
  );
}

export function ActionPill({ label, onPress, disabled }) {
  return (
    <PressFade
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={{
        backgroundColor: colors.primary,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 0.3, color: "#fff" }}>
        {label}
      </Text>
    </PressFade>
  );
}

// A started session sits on the day she trained exactly as a finalized one
// does — the difference is the fill, not the position. Filling it would claim
// she'd said she was done; leaving it as a plain bar would put a session's
// worth of work back in the "nothing happened" pile.
function DoneChip({ bar, onPress }) {
  const started = bar.state === "started";
  const chip = (
    <View
      style={{
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: OLIVE,
        backgroundColor: started ? "transparent" : OLIVE_TINT,
        paddingVertical: 6,
        paddingHorizontal: 8,
        minHeight: 32,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text numberOfLines={1} maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 11.5, color: OLIVE }}>
        S{bar.sessionNumber}
      </Text>
    </View>
  );
  return bar.workout && onPress ? (
    <PressFade onPress={() => onPress(bar.workout)} style={{}}>
      {chip}
    </PressFade>
  ) : (
    chip
  );
}

// Two sessions finalized on different days of the same week share one line —
// "a week fills in left to right". Laid out as seven equal cells with each
// chip in one of them, because RN has no CSS grid.
function DoneLine({ bars, onPress }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {DAY_LETTERS.map((_, i) => {
        const bar = bars.find((b) => b.day === i);
        return (
          <View key={i} style={{ flex: 1, paddingHorizontal: 1.5 }}>
            {bar ? <DoneChip bar={bar} onPress={onPress} /> : null}
          </View>
        );
      })}
    </View>
  );
}

// `renderBar` lets each platform wrap a bar in its own drag machinery while
// the packing, the today line and the row chrome stay in one place.
export function BarsArea({ row, onSelectSession, renderBar }) {
  return (
    <View style={{ flex: 1 }}>
      {/* The today marker is two pieces on purpose: the caption sits in normal
          flow above the bars and the line is the only thing absolutely
          positioned, over a container with no padding of its own. Yoga offsets
          an absolute child by its parent's padding, so a line drawn inside a
          padded box overflows the bottom by exactly that padding. */}
      {row.todayIndex == null ? null : (
        <View style={{ flexDirection: "row", marginBottom: 2 }}>
          {DAY_LETTERS.map((_, d) => (
            <View key={d} style={{ flex: 1, alignItems: "center" }}>
              {d === row.todayIndex ? (
                <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 8.5, letterSpacing: 0.9, color: ALERT }}>
                  TODAY
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      <View style={{ position: "relative" }}>
        {row.todayIndex == null ? null : (
          <View style={{ position: "absolute", left: 0, right: 0, top: -3, bottom: -3, flexDirection: "row", pointerEvents: "none" }}>
            {DAY_LETTERS.map((_, d) => (
              <View key={d} style={{ flex: 1, alignItems: "center" }}>
                {d === row.todayIndex ? <View style={{ flex: 1, width: 2, borderRadius: 2, backgroundColor: ALERT }} /> : null}
              </View>
            ))}
          </View>
        )}

        <View style={{ gap: 7 }}>
          {packLines(row.bars).map((line) =>
            line.kind === "done" ? (
              <DoneLine key={line.bars[0].key} bars={line.bars} onPress={onSelectSession} />
            ) : (
              <View key={line.bar.key}>{renderBar(line.bar)}</View>
            )
          )}
        </View>
      </View>
    </View>
  );
}

// `dropActive` outlines the row while something is being dragged over it.
export function WeekRow({ row, wide, last, dropActive, children }) {
  const label = (
    <View style={wide ? { paddingTop: 2 } : { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 7 }}>
      <Text
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: fonts.sansBold, fontSize: 13, color: row.isCurrent ? colors.primaryOnWhite : "#44403c" }}
      >
        Week {row.week}
      </Text>
      <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: colors.muted }}>
        {formatDateRange(row.start, row.end)}
      </Text>
    </View>
  );
  return (
    <View
      style={{
        flexDirection: wide ? "row" : "column",
        gap: wide ? LABEL_GAP : 0,
        alignItems: wide ? "flex-start" : "stretch",
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: BORDER,
        ...(row.isCurrent
          ? { backgroundColor: CANVAS_PEACH, borderRadius: 12, marginHorizontal: -10, paddingHorizontal: 10, borderBottomColor: "transparent" }
          : null),
        ...(dropActive
          ? {
              backgroundColor: CANVAS_PEACH,
              borderRadius: 12,
              borderWidth: 2,
              borderStyle: "dashed",
              borderColor: colors.primary,
              marginHorizontal: -10,
              paddingHorizontal: 8,
              borderBottomColor: colors.primary,
            }
          : null),
      }}
    >
      {wide ? <View style={{ width: LABEL_WIDTH }}>{label}</View> : label}
      {children}
    </View>
  );
}

function DayHeader() {
  return (
    <View style={{ flexDirection: "row", marginBottom: 5 }}>
      {DAY_LETTERS.map((letter, i) => (
        <View key={i} style={{ flex: 1, alignItems: "center" }}>
          <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.8, color: colors.hint }}>
            {letter}
          </Text>
        </View>
      ))}
    </View>
  );
}

function LegendSwatch({ state }) {
  const common = { width: 26, height: 13, borderRadius: 999, borderWidth: 1.5 };
  if (state === "done") return <View style={{ ...common, width: 14, borderColor: OLIVE, backgroundColor: OLIVE_TINT }} />;
  if (state === "started") return <View style={{ ...common, width: 14, borderColor: OLIVE }} />;
  if (state === "pending") return <View style={{ ...common, borderColor: colors.primary }} />;
  return <View style={{ ...common, borderColor: BORDER_STRONG, borderStyle: "dashed", opacity: state === "notWritten" ? 0.55 : 1 }} />;
}

const LEGEND = [
  { state: "pending", label: "Pending — any day this week" },
  { state: "done", label: "Done — the day she finalized" },
  { state: "started", label: "Logged, not finalized" },
  { state: "pastOpen", label: "Past & still open" },
  { state: "notWritten", label: "Not written yet" },
];

export function CalendarCard({ meta, wide, hint, children, footer }) {
  return (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: BORDER, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 }}>
      {meta ? (
        <Text
          maxFontSizeMultiplier={1.15}
          style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 8 }}
        >
          {meta}
        </Text>
      ) : null}

      {/* Drawn once for the whole calendar rather than per row — every row's
          track is the same seven columns wide, so one header reads them all. */}
      <View style={{ flexDirection: "row", gap: wide ? LABEL_GAP : 0, marginBottom: 2 }}>
        {wide ? <View style={{ width: LABEL_WIDTH }} /> : null}
        <View style={{ flex: 1 }}>
          <DayHeader />
        </View>
      </View>

      {children}
      {footer}

      {hint ? (
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: colors.hint, marginTop: 12 }}>
          {hint}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER }}>
        {LEGEND.map((item) => (
          <View key={item.state} style={{ flexDirection: "row", alignItems: "center", gap: 7, marginRight: 12 }}>
            <LegendSwatch state={item.state} />
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: colors.muted }}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function EmptyCalendar() {
  return (
    <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: BORDER, borderRadius: 18, padding: 18 }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted }}>
        This block has no dates yet — it gets its weeks when you send it.
      </Text>
    </View>
  );
}

export function ShowAllToggle({ showAll, length, onPress }) {
  return (
    <PressFade onPress={onPress} hitSlop={8} style={{ paddingTop: 12, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>
        {showAll ? "Show weeks near today" : `Show all ${length} weeks`}
      </Text>
    </PressFade>
  );
}

// The native move affordance. Web drags instead, so this is only mounted
// there for the "put it back" case, which a drag can't express as clearly.
export function MoveWeekSheet({ bar, length, onPick, onClose }) {
  if (!bar) return null;
  const weeks = Array.from({ length }, (_, i) => i + 1);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <PressFade onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.35)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.canvas, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, maxHeight: "70%" }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#2a211c", marginBottom: 3 }}>
            Move S{bar.sessionNumber} to
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginBottom: 14 }}>
            Written in week {bar.authoredWeek}. Moving it doesn't change what's in it.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {weeks.map((n) => {
              const here = n === bar.week;
              return (
                <PressFade
                  key={n}
                  onPress={() => onPick(n)}
                  style={{
                    borderWidth: 1.5,
                    borderColor: here ? colors.primary : BORDER,
                    backgroundColor: here ? CANVAS_PEACH : "#fff",
                    borderRadius: 999,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: here ? colors.primaryOnWhite : "#44403c" }}>
                    Week {n}
                  </Text>
                </PressFade>
              );
            })}
          </View>
        </View>
      </PressFade>
    </Modal>
  );
}
