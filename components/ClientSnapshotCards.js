import { View, Text, Pressable } from "react-native";
import { formatDateMDY } from "../lib/formatDate";
import { fonts, colors } from "../lib/theme";

// The Programming and Nutrition halves of the client-detail header row.
// Notes and Limitations are their own files (they own real editing state);
// these two are pure readouts, so they live together.

function Label({ children }) {
  return (
    <Text className="mb-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.55 }}>
      {children}
    </Text>
  );
}

function StatRow({ label, value, tone }) {
  return (
    <View className="flex-row items-baseline justify-between py-1">
      <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: tone ?? "#44403c" }}>{value}</Text>
    </View>
  );
}

// "Current" vs "Behind" is the one judgement this card makes, and it is
// arithmetic only: behind means a real missed-session flag exists (a
// published session whose scheduled days have already passed unlogged).
// It never guesses from "hasn't trained in a while" — a client on holiday
// isn't behind, they're away, and this card can't tell the difference.
export function ProgrammingCard({ blockRows, flags, lastSession, weekCompleted, weeklyTarget, onOpenBlock, hasProgram }) {
  const behind = flags.length > 0;

  if (!hasProgram) {
    return (
      <View>
        <Label>Programming</Label>
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          Not on a program yet. Turn one on under Programs below.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Label>Programming</Label>
      <View className="mb-2 flex-row items-center gap-2">
        <View className="rounded-full" style={{ width: 7, height: 7, backgroundColor: behind ? "#b23a22" : "#4d6142" }} />
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, color: behind ? "#b23a22" : "#44403c" }}>{behind ? "Behind" : "Current"}</Text>
      </View>

      {/* Each membership links to its own block — a client can hold a group
          program and SPC at once, and one shared "open the block" button
          can't say which it means. */}
      {blockRows.map((row) => (
        <Pressable key={row.programId} onPress={() => onOpenBlock?.(row)} className="flex-row items-center justify-between py-0.5" hitSlop={4}>
          <Text className="text-stone-600" style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 }}>
            {row.programName} · Block week {row.weekNum} of {row.totalWeeks}
          </Text>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 12.5 }}>›</Text>
        </Pressable>
      ))}
      {blockRows.length === 0 ? (
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          No active block right now.
        </Text>
      ) : null}

      {behind ? (
        <Text className="mt-1.5" style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#b23a22" }}>
          {flags.length} session{flags.length === 1 ? "" : "s"} missed {flags[0]?.period ?? "this week"}
        </Text>
      ) : null}

      <View className="mt-3 border-t pt-2" style={{ borderTopColor: "#f0ede8" }}>
        <StatRow label="Last session" value={lastSession ? formatDateMDY(lastSession.date) : "never"} />
        <StatRow label="This week" value={weeklyTarget ? `${weekCompleted} of ${weeklyTarget}` : `${weekCompleted}`} />
      </View>
    </View>
  );
}

const CHECKIN_COPY = {
  pending: { label: "Not submitted yet", tone: "#8a6d3b" },
  ready: { label: "Waiting on you", tone: "#b23a22" },
  completed: { label: "Reviewed", tone: "#4d6142" },
};

export function NutritionCard({ enrolled, snapshot, error, onReview, onRetry }) {
  if (!enrolled) {
    return (
      <View>
        <Label>Nutrition &amp; check-in</Label>
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          Not enrolled.
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View>
        <Label>Nutrition &amp; check-in</Label>
        <Text className="text-red-600" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          Couldn't load: {error}
        </Text>
        {onRetry ? (
          <Pressable onPress={onRetry} className="mt-2 self-start" hitSlop={6}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View>
        <Label>Nutrition &amp; check-in</Label>
        <Text className="text-stone-400" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          Loading…
        </Text>
      </View>
    );
  }

  const checkin = CHECKIN_COPY[snapshot.checkinStatus] ?? CHECKIN_COPY.pending;
  const delta = snapshot.weightDelta;

  return (
    <View>
      <Label>Nutrition &amp; check-in</Label>
      <View className="mb-2 flex-row items-baseline gap-1.5">
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 24, color: "#4d6142" }}>{snapshot.daysLogged}</Text>
        <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
          of 7 days logged
        </Text>
      </View>

      <View className="flex-row gap-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} className="flex-1 rounded-full" style={{ height: 5, backgroundColor: i < snapshot.daysLogged ? "#4d6142" : "#ece7e1" }} />
        ))}
      </View>

      <View className="mt-3 border-t pt-2" style={{ borderTopColor: "#f0ede8" }}>
        <StatRow
          label="Weight trend"
          value={delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta} lb / ${snapshot.weightDeltaWeeks} wk`}
        />
        <StatRow label="Check-in" value={checkin.label} tone={checkin.tone} />
      </View>

      {/* The link named the check-in but landed on Dashboard, leaving the
          coach to find the tab themselves. The label and the destination are
          decided together here for that reason — split across two components
          is how they came apart in the first place. */}
      {onReview ? (
        <Pressable
          onPress={() => onReview(snapshot.checkinStatus === "ready" ? "checkin" : undefined)}
          className="mt-2.5 self-start"
          hitSlop={6}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>
            {snapshot.checkinStatus === "ready" ? "Review their check-in →" : "Open nutrition →"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
