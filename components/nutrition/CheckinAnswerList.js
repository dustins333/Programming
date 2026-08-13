import { View, Text } from "react-native";
import { HighlightableAnswer } from "./HighlightableAnswer";
import { fonts } from "../../lib/theme";

// A submitted check-in's answers, each against what she said last week
// (coach web v2, screen 22).
//
// Nothing in here interprets anything — no summary, no "she seems", no
// suggested target change. Text answers show verbatim, last week's shows
// underneath in grey, and reading them is the coach's job. That's the
// handoff's explicit decision and it's the whole reason this reads as a
// transcript rather than a report.

function AnswerRow({ item, highlights, onChangeHighlights, last }) {
  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: "#f6f3ef" }}>
      <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
        <Text className="flex-1" maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
          {item.question}
        </Text>
        {/* A question written for this client alone, not inherited from the
            gym template — worth marking, because it's usually the one she
            was asked about a specific injury or experiment. */}
        {item.hersOnly ? (
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: "#fdece5" }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, color: "#b23a22", letterSpacing: 0.4 }}>HERS ONLY</Text>
          </View>
        ) : null}
      </View>

      <View className="mt-1.5">
        <HighlightableAnswer text={item.answer || "—"} ranges={highlights} onChangeRanges={onChangeHighlights} />
      </View>

      {item.hasPrior ? (
        <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 12, color: "#c9c4bd", marginTop: 5 }}>
          last week — “{item.lastAnswer || "—"}”
        </Text>
      ) : null}
    </View>
  );
}

// Every answer, every week, in the order she wrote them. An earlier version
// folded the ones matching last week word-for-word behind a count — reading
// the whole check-in is the job, and deciding for the coach which parts are
// worth her time is not this screen's call.
export function CheckinAnswerList({ paired, highlights, onChangeHighlights }) {
  if (paired.length === 0) {
    return (
      <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
        No answers on this check-in.
      </Text>
    );
  }

  return (
    <View>
      {paired.map((item, i) => (
        <AnswerRow
          key={item.index}
          item={item}
          last={i === paired.length - 1}
          highlights={highlights?.[item.index]}
          onChangeHighlights={(ranges) => onChangeHighlights(item.index, ranges)}
        />
      ))}
    </View>
  );
}

// The metric strip above the answers — this week's averages with the change
// from the week before. A delta is never colored good or bad: which
// direction is which depends entirely on what she's working toward, and the
// game plan on the right says what that is.
export function CheckinMetricStrip({ metrics }) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 10 }}>
      {metrics.map((metric) => {
        const value =
          metric.value === null || metric.value === undefined
            ? "–"
            : (Math.round(metric.value * 10 ** metric.digits) / 10 ** metric.digits).toLocaleString();
        const delta =
          metric.delta === null || metric.delta === undefined
            ? null
            : Math.round(metric.delta * 10 ** metric.digits) / 10 ** metric.digits;
        return (
          <View
            key={metric.key}
            className="rounded-xl px-3.5 py-2.5"
            style={{ flex: 1, minWidth: 108, borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "#faf8f6" }}
          >
            <Text
              maxFontSizeMultiplier={1.15}
              numberOfLines={1}
              style={{ fontFamily: fonts.sansBold, fontSize: 9.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              {metric.label}
            </Text>
            <View className="mt-1 flex-row flex-wrap items-baseline" style={{ gap: 5 }}>
              <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.display, fontSize: 17, color: "#2a211c" }}>
                {value}
                {metric.unit ?? ""}
              </Text>
              <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                {delta === null ? "—" : delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
