import { View, Text, Pressable } from "react-native";
import { formatDateMDY } from "../lib/formatDate";
import { dateInBoise, daysBetween } from "../lib/boiseDate";
import { fonts, colors } from "../lib/theme";

// Column widths are fixed so every row lines up; the Client column takes
// the remaining width. Exported because the page sizes its own horizontal
// scroller from the same numbers — two sources of truth here would show up
// as a header that doesn't sit over its column.
export const COL = { client: 300, program: 150, lastSession: 130, week: 120, nutrition: 130, needs: 130 };
export const TABLE_WIDTH = COL.client + COL.program + COL.lastSession + COL.week + COL.nutrition + COL.needs + 36;

const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };
const TONE_COLOR = { good: "#4d6142", urgent: "#b23a22", normal: "#57534e", muted: "#a8a29e" };

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Since Feb 2024" — the coach's own shorthand for how long they've had
// someone. Anything inside a fortnight reads as "Joined N days ago"
// instead, because that's the window where it's still actionable.
//
// created_at is a timestamptz, so the Boise-local calendar date comes from
// dateInBoise, never toISOString().slice(0,10) — and the month/year are
// then read off that date string rather than from toLocaleDateString on
// the raw Date. Both shortcuts render a client who joined on Aug 1 as
// "Since Jul 2023" for anyone west of UTC. Caught in a real screenshot.
function sinceLabel(row, today) {
  if (!row.created_at) return null;
  const d = new Date(row.created_at);
  if (Number.isNaN(d.getTime())) return null;
  const iso = dateInBoise(d);
  const ageDays = daysBetween(today, iso);
  if (ageDays <= 14) return ageDays <= 0 ? "Joined today" : `Joined ${ageDays} day${ageDays === 1 ? "" : "s"} ago`;
  const [year, month] = iso.split("-");
  return `Since ${MONTHS[Number(month) - 1]} ${year}`;
}

// Segments are the client's own weekly target, so a 2x/week client's row
// fills at two, not four — the point is "did she do what she's on the hook
// for", not a fixed scale. Capped at six so an unusual target can't push
// the column out of shape.
function WeekStrip({ completed, target }) {
  if (!target) return <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#c9c4bd" }}>—</Text>;
  const segments = Math.min(target, 6);
  return (
    <View>
      <View className="flex-row gap-1">
        {Array.from({ length: segments }).map((_, i) => (
          <View key={i} className="rounded-full" style={{ width: 18, height: 5, backgroundColor: i < completed ? "#4d6142" : "#ece7e1" }} />
        ))}
      </View>
      <Text className="mt-1" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
        {completed} of {target}
      </Text>
    </View>
  );
}

// The one column that is an action rather than a readout. Priority order
// matters: an unassigned client needs a program before anything else is
// meaningful, and a long-quiet client needs a nudge before a check-in
// reminder does any good.
function NeedsCell({ row, onAssign, onMessage, onCheckin }) {
  if (row.unassigned) {
    return (
      <Pressable onPress={onAssign} className="rounded-lg px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
        <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 12 }}>
          Assign
        </Text>
      </Pressable>
    );
  }
  if (row.lastSession.days != null && row.lastSession.days >= 7) {
    return (
      <Pressable onPress={onMessage} className="rounded-lg border px-3 py-1.5" style={{ borderColor: "#d9d4cd" }}>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: "#57534e" }}>Message</Text>
      </Pressable>
    );
  }
  if (row.checkinDue) {
    return (
      <Pressable onPress={onCheckin} className="rounded-lg px-3 py-1.5" style={{ backgroundColor: "#fdece5" }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#b23a22" }}>Check-in due</Text>
      </Pressable>
    );
  }
  if (row.flagCount > 0) {
    return (
      <Pressable onPress={onMessage} className="rounded-lg px-3 py-1.5" style={{ backgroundColor: "#fdece5" }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#b23a22" }}>
          {row.flagCount} flag{row.flagCount === 1 ? "" : "s"}
        </Text>
      </Pressable>
    );
  }
  return <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#c9c4bd" }}>—</Text>;
}

export function ClientRosterTable({ rows, today, emptyMessage, onOpenClient, onMessage, onCheckin }) {
  return (
    <View className="rounded-2xl border bg-white" style={[{ borderColor: "#ece7e1", overflow: "hidden", width: TABLE_WIDTH }, CARD_SHADOW]}>
      <View className="flex-row items-center px-[18px] py-3" style={{ borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>
        <Text className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, width: COL.client }}>
          Client
        </Text>
        {[
          ["Program", COL.program],
          ["Last session", COL.lastSession],
          ["This week", COL.week],
          ["Nutrition", COL.nutrition],
          ["Needs", COL.needs],
        ].map(([label, width]) => (
          <Text key={label} className="text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5, width }} numberOfLines={1}>
            {label}
          </Text>
        ))}
      </View>

      {rows.length === 0 ? (
        <Text className="p-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          {emptyMessage}
        </Text>
      ) : (
        rows.map((row, idx) => (
          <Pressable
            key={row.id}
            onPress={() => onOpenClient(row)}
            className="flex-row items-center px-[18px] py-3.5"
            style={{
              backgroundColor: row.unassigned ? "#fdf6f2" : undefined,
              ...(idx < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f2efeb" } : null),
            }}
          >
            <View className="flex-row items-center gap-3" style={{ width: COL.client }}>
              <View className="items-center justify-center rounded-full" style={{ width: 36, height: 36, backgroundColor: "#fdf6f2" }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>{initials(row.name)}</Text>
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700" numberOfLines={1}>
                    {row.name}
                  </Text>
                  {row.neverRegistered ? (
                    <View className="rounded-full px-2 py-[2px]" style={{ backgroundColor: "#f1efed" }}>
                      <Text style={{ fontFamily: fonts.sansBold, color: "#78716c", fontSize: 9.5, letterSpacing: 0.3 }}>NOT REGISTERED</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="mt-0.5 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12 }} numberOfLines={1}>
                  {sinceLabel(row, today) ?? row.email}
                </Text>
              </View>
            </View>

            <View style={{ width: COL.program }}>
              <View className="flex-row flex-wrap items-center gap-1">
                {row.unassigned ? (
                  <View className="rounded-full border px-2.5 py-1" style={{ borderColor: "#d9d4cd", borderStyle: "dashed" }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, color: "#78716c", fontSize: 10.5 }}>Unassigned</Text>
                  </View>
                ) : (
                  row.tags.slice(0, 2).map((tag) => (
                    <View key={tag.key} className="rounded-full px-2.5 py-1" style={{ backgroundColor: "#eef1e7" }}>
                      <Text style={{ fontFamily: fonts.sansSemiBold, color: "#4d6142", fontSize: 10.5 }}>{tag.label}</Text>
                    </View>
                  ))
                )}
                {row.tags.length > 2 ? (
                  <Text style={{ fontFamily: fonts.sans, color: "#a8a29e", fontSize: 10.5 }}>+{row.tags.length - 2}</Text>
                ) : null}
              </View>
            </View>

            <View style={{ width: COL.lastSession }}>
              <Text
                style={{
                  fontFamily: row.lastSession.tone === "normal" || row.lastSession.tone === "muted" ? fonts.sans : fonts.sansSemiBold,
                  fontSize: 13,
                  color: TONE_COLOR[row.lastSession.tone],
                }}
              >
                {row.lastSession.label}
              </Text>
              {row.lastSessionDate ? (
                <Text className="mt-0.5" style={{ fontFamily: fonts.sans, fontSize: 11, color: "#c9c4bd" }}>
                  {formatDateMDY(row.lastSessionDate)}
                </Text>
              ) : null}
            </View>

            <View style={{ width: COL.week }}>
              <WeekStrip completed={row.weekCompleted} target={row.weeklyTarget} />
            </View>

            <View style={{ width: COL.nutrition }}>
              {row.nutritionEnrolled ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#57534e" }}>{row.nutritionDaysLogged ?? 0} of 7 days</Text>
              ) : (
                <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#c9c4bd" }}>not enrolled</Text>
              )}
            </View>

            <View style={{ width: COL.needs }}>
              <NeedsCell row={row} onAssign={() => onOpenClient(row)} onMessage={() => onMessage(row)} onCheckin={() => onCheckin(row)} />
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}
