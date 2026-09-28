import { Text, View } from "react-native";
import { fonts } from "../../../lib/theme";
import { formatTimeInBoise } from "../../../lib/boiseDate";

// Strategy Sessions (coach mobile). Tokens straight from the design handoff
// (design_handoff_strategy_sessions_v1/README.md). Type here runs a step
// larger than the member app on purpose: coaches read it standing, at arm's
// length.
export const T = {
  canvas: "#faf8f6",
  card: "#fff",
  border: "#ece7e1",
  inputBorder: "#d9d4cd",
  dashed: "#ddd6cd",
  ink: "#44403c",
  ink2: "#57534e",
  ink3: "#78716c",
  ink4: "#a8a29e",
  clay: "#a46a57",
  // Clay TEXT under 24px, for contrast.
  clayText: "#8a5140",
  clayTint: "#fdf6f2",
  clayTintBorder: "#f0ddd2",
  sand: "#beac95",
  ochre: "#c68a3e",
  greyPill: "#f1efed",
  olive: "#4d6142",
  oliveTint: "#f3f6ef",
  needsBg: "#f4ede3",
  needsText: "#8a5a2e",
  inset: "#f5f1ec",
};

export const MAX_WIDTH = 760;
export const GUTTER = 18;

export const cardShadow = {
  shadowColor: "#44403c",
  shadowOpacity: 0.045,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 1,
};

export function Eyebrow({ children, color = T.ink3, style }) {
  return (
    <Text
      maxFontSizeMultiplier={1.2}
      style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.15, textTransform: "uppercase", color, ...style }}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style }) {
  return (
    <View
      style={{
        backgroundColor: T.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: T.border,
        overflow: "hidden",
        ...cardShadow,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dates. Everything takes Boise YYYY-MM-DD strings and splits them rather
// than parsing through Date, which would read them as UTC midnight and show
// the previous day west of Greenwich.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parts(iso) {
  const [y, m, d] = (iso ?? "").split("-").map(Number);
  return { y, m, d };
}

// "Sept 29"
export function shortDate(iso) {
  if (!iso) return "";
  const { m, d } = parts(iso);
  return `${MONTHS[m - 1]} ${d}`;
}

// "June 1, 2026"
export function longDate(iso) {
  if (!iso) return "";
  const { y, m, d } = parts(iso);
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}

// "Tuesday"
export function weekday(iso) {
  const { y, m, d } = parts(iso);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
}

// "Tuesday, Sept 29"
export function weekdayDate(iso) {
  return `${weekday(iso)}, ${shortDate(iso)}`;
}

// { time: "7:45", meridiem: "AM" } in Boise time.
export function timeParts(isoTimestamp) {
  const [time, meridiem] = formatTimeInBoise(isoTimestamp).split(" ");
  return { time: time ?? "", meridiem: meridiem ?? "" };
}

export function firstName(name) {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

// "Leslie Romero" -> "Leslie". Coaches go by first name everywhere here.
export const coachShort = firstName;
