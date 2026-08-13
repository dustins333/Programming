import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { deriveCalories } from "../../lib/nutrition/targets";
import { colorForTarget } from "../../lib/nutrition/weekCycle";
import { fonts } from "../../lib/theme";

// The macro-average rings shared by the Nutrition queue preview (17), the
// client Dashboard (19) and the Check-In tab (22) — one component so the
// three can never disagree about what "148 of 150" means.
//
// This is a coach-side READ of a completed week, which is why it colors
// differently from the member's own MacroDial. A member's dial is never red
// because her day fills in cumulatively and being under at noon is normal;
// a finished week's average genuinely is either inside the ±10% band or
// outside it, and the coach needs to see which. Same band the Weeks table
// colors on (colorForTarget), so the two agree.
const TRACK = "#f0ece6";
const OLIVE = "#4d6142";
const CLAY = "#a46a57";
const NO_TARGET = "#c9c4bd";

function Ring({ size, stroke, value, goal, digits }) {
  const hasValue = value !== null && value !== undefined;
  const onTrack = hasValue && goal ? colorForTarget(value, goal) === "green" : false;
  const color = !hasValue || !goal ? NO_TARGET : onTrack ? OLIVE : CLAY;
  const progress = hasValue && goal ? Math.max(0, Math.min(1, value / goal)) : 0;

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const shown = hasValue ? Math.round(value * 10 ** digits) / 10 ** digits : null;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={center} cy={center} r={radius} stroke={TRACK} strokeWidth={stroke} fill="none" />
        {progress > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference * progress} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.display, fontSize: size >= 72 ? 17 : 15, color, includeFontPadding: false }}>
        {shown === null ? "–" : shown >= 1000 ? shown.toLocaleString() : shown}
      </Text>
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sans, fontSize: 9, color: "#a8a29e", marginTop: 1 }}>
        {goal ? `of ${goal >= 1000 ? goal.toLocaleString() : goal}` : "no goal"}
      </Text>
    </View>
  );
}

// `days` opts in to the trailing "days logged" ring the Dashboard carries
// and the narrower queue preview doesn't — same visual grammar, but it is
// counting days rather than grams, so it only appears where there's room to
// label it properly.
export function MacroRingRow({ averages, target, size = 72, stroke = 6, days = null }) {
  const calorieGoal = target ? Math.round(deriveCalories(target)) : null;
  const rings = [
    { key: "protein_g", label: "Protein", value: averages?.protein_g ?? null, goal: target?.protein_g ?? null, digits: 0 },
    { key: "carb_g", label: "Carbs", value: averages?.carb_g ?? null, goal: target?.carb_g ?? null, digits: 0 },
    { key: "fat_g", label: "Fat", value: averages?.fat_g ?? null, goal: target?.fat_g ?? null, digits: 0 },
    { key: "calories", label: "Calories", value: averages?.calories ?? null, goal: calorieGoal, digits: 0 },
  ];

  const columns = days ? [...rings, { key: "days", label: "Days logged", value: days.logged, goal: days.of, digits: 0 }] : rings;

  return (
    // Each column flexes so the row spreads evenly across whatever card it's
    // in, rather than clustering at the left edge while the card grows around
    // it. `minWidth` is the wrap point, not the width.
    <View className="flex-row flex-wrap" style={{ gap: 18 }}>
      {columns.map((ring) => (
        <View key={ring.key} style={{ flex: 1, alignItems: "center", minWidth: size }}>
          <Ring size={size} stroke={stroke} value={ring.value} goal={ring.goal} digits={ring.digits} />
          <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: "#44403c", marginTop: 8 }}>
            {ring.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// The seven-dot logging strip — a filled pill per day she logged. Reads as
// "5 of 7" at a glance without a number, and sits next to one anyway on the
// queue preview because the pattern of WHICH days matters as much as the
// count (three weekdays and nothing at the weekend is a different problem
// from five scattered days).
export function LoggingDots({ dates, loggedDates }) {
  const logged = new Set(loggedDates);
  return (
    <View className="flex-row" style={{ gap: 4 }}>
      {dates.map((date) => (
        <View
          key={date}
          style={{
            flex: 1,
            height: 7,
            borderRadius: 4,
            backgroundColor: logged.has(date) ? OLIVE : "#ece7e1",
          }}
        />
      ))}
    </View>
  );
}
