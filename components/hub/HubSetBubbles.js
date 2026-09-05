import { Text, View } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { deriveSetLabels, isRampUpSet } from "../../lib/programming/setLabels";

// The one set-bubble primitive on the hub board. Reps large, weight small
// beside it, each set in its own pill — used identically by a resting lift's
// chip row, the expanded card's last-week strip, and the dock's block
// history. Never rendered as a run of text ("8×65 · 8×65 · 7×65"), which
// reads as a sentence instead of as three sets you can compare at a glance.
//
// A pill with nothing logged is DASHED and shows that set's programmed
// target — the same "empty means not done, and here's what was asked for"
// language the member app uses inside its set boxes.
//
// The weight names its unit. Every caller renders these with no column
// header above them (a resting lift's chip row, a last-week strip, a coach's
// session popup), so "8 ×65" was a bare number with nothing on screen saying
// what it counted. The one exception is a row packed tight enough to be at
// xs (7+ sets, which real programming has never produced) — there the row
// must not clip, and the width the unit costs is the width it needs.

const LOGGED_BG = "#f3f6ef";
const LOGGED_BORDER = "#dbe8cf";
const LOGGED_TEXT = "#3f4a36";
// A ramp-up is her work, set aside: neutral where a working set is olive.
const RAMP_BG = "#f6f5f3";
const RAMP_BORDER = "#e4e0da";

const SIZES = {
  // xs exists only so a single-line row can never clip — see hubBubbleSize().
  xs: { reps: 12, weight: 8.5, padH: 5, padV: 2, minWidth: 32, gap: 4 },
  sm: { reps: 13, weight: 9.5, padH: 7, padV: 3, minWidth: 40, gap: 5 },
  md: { reps: 15, weight: 10.5, padH: 8, padV: 4, minWidth: 48, gap: 6 },
  lg: { reps: 17, weight: 11.5, padH: 9, padV: 5, minWidth: 56, gap: 6 },
};

// The hub board draws every set on one line in a fixed-height slot, so the
// bubble has to shrink rather than wrap. Measured in a 463px column (the
// four-up width, the tightest case) with three-digit weights: md fits 7, sm
// fits 7 with room, xs fits 8+. Real SPC programming is 2-3 sets and the
// most anyone has ever logged is 3, so this is headroom, not a common path.
// Exactly how many bubbles SetBubbleRow will draw for a given set of logs, so
// a caller sizing the row can't disagree with the row itself about how many
// there are — a ramp-up adds a bubble that neither the prescription nor the
// highest stored set number accounts for on its own.
export function bubbleCountFor(sets = [], targetCount = 0) {
  const real = (sets ?? []).filter((r) => r.reps != null || r.weight != null);
  const maxSet = real.reduce((m, r) => Math.max(m, r.set_number ?? 0), 0);
  const slots = maxSet > 0 ? maxSet : real.length;
  const ramps = real.filter(isRampUpSet).length;
  return Math.max(slots, ramps + targetCount);
}

export function hubBubbleSize(setCount) {
  // One step earlier than the original tuning, because naming the unit costs
  // roughly 13px a bubble: measured in the 463px four-up column with 3-digit
  // weights, 6 sets at sm now lands at 461. A row of 7+ drops the unit
  // entirely (see showWeightUnit below) rather than shrinking further.
  if (setCount >= 7) return "xs";
  if (setCount >= 5) return "sm";
  return "md";
}

// `suffix` names what the big number counts when it isn't plain reps ("s",
// "ft" — repUnit's own suffixes). Off by default: the hub board and the
// member card both print the unit once in a column header above the row, so
// repeating it on every bubble there would be noise. A reader with no such
// header (the coach's session popup) passes it, or a 60-second carry reads
// as 60 reps.
export function SetBubble({ reps, weight, target, rampUp = false, tracksWeight = true, size = "md", tone = "logged", stacked = true, suffix = "", showWeightUnit = true }) {
  const s = SIZES[size] ?? SIZES.md;
  const logged = reps != null || weight != null;
  const showWeight = tracksWeight && weight != null;
  return (
    <View
      style={{
        minWidth: s.minWidth,
        paddingHorizontal: s.padH,
        paddingVertical: s.padV,
        marginRight: s.gap,
        // A wrapping row needs the gap between its lines; a single-line row is
        // vertically centred in a fixed-height slot and must not be nudged.
        marginTop: stacked ? 4 : 0,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: logged ? "solid" : "dashed",
        borderColor: rampUp ? RAMP_BORDER : logged ? (tone === "plain" ? "#e7e0d8" : LOGGED_BORDER) : "#ddd6cd",
        backgroundColor: rampUp ? RAMP_BG : logged ? (tone === "plain" ? "white" : LOGGED_BG) : "transparent",
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.sansBold,
          fontSize: s.reps,
          color: rampUp ? colors.muted : logged ? (tone === "plain" ? "#292524" : LOGGED_TEXT) : colors.hint,
        }}
        numberOfLines={1}
      >
        {logged ? (reps == null ? "–" : `${reps}${suffix}`) : target ?? "–"}
      </Text>
      {showWeight ? (
        <Text
          style={{
            fontFamily: fonts.sansMedium,
            fontSize: s.weight,
            color: rampUp || tone === "plain" ? colors.muted : "#5c6b52",
            marginLeft: 3,
          }}
          numberOfLines={1}
        >
          ×{weight}
          {showWeightUnit ? " lb" : ""}
        </Text>
      ) : null}
    </View>
  );
}

// sets: log rows (or {reps, weight} drafts) keyed by set_number.
// targetCount / targetFor fill the row out to the programmed set count with
// dashed placeholders, so "3 × 8 but only two done" is visible as a shape.
export function SetBubbleRow({ sets = [], targetCount = 0, targetFor, tracksWeight = true, size = "md", tone = "logged", wrap = true, suffix = "", showWeightUnit = size !== "xs" }) {
  const real = (sets ?? []).filter((r) => r.reps != null || r.weight != null);
  const maxSet = real.reduce((m, r) => Math.max(m, r.set_number ?? 0), 0);

  // Laid out by STORED position first, exactly as the member's own card does,
  // so a gap she left (set 1 and set 3 logged, set 2 not) stays a gap instead
  // of closing up and claiming she did a set she skipped. Drafts coming off
  // the hub's own editing state carry no set_number, so those stay positional.
  const ordered =
    maxSet > 0 ? Array.from({ length: maxSet }, (_, i) => real.find((r) => (r.set_number ?? 0) === i + 1) ?? null) : real;

  // Then the target each bubble is asked to show is resolved by WORKING
  // position, not by stored position — a ramp-up (0116) was never asked for,
  // so it neither carries a target nor consumes one, and everything below it
  // would otherwise be judged against the wrong number.
  const labels = deriveSetLabels(ordered.map((r) => r ?? {}));
  const workingCount = labels.filter((l) => !l.rampUp).length;

  const bubbles = ordered.map((row, i) => (
    <SetBubble
      key={i}
      reps={row?.reps ?? null}
      weight={row?.weight ?? null}
      rampUp={labels[i].rampUp}
      target={!labels[i].rampUp && targetFor ? targetFor(labels[i].index) : null}
      tracksWeight={tracksWeight}
      showWeightUnit={showWeightUnit}
      size={size}
      tone={tone}
      stacked={wrap}
      suffix={suffix}
    />
  ));

  // Fill out to the programmed set count with dashed placeholders, so "3 × 8
  // but only two done" is still visible as a shape.
  for (let i = workingCount + 1; i <= targetCount; i++) {
    bubbles.push(
      <SetBubble
        key={`pad${i}`}
        reps={null}
        weight={null}
        target={targetFor ? targetFor(i) : null}
        tracksWeight={tracksWeight}
        showWeightUnit={showWeightUnit}
        size={size}
        tone={tone}
        stacked={wrap}
        suffix={suffix}
      />
    );
  }
  // wrap={false} keeps every set on ONE line. The hub board needs it: a
  // wrapped bubble row makes that lift taller, which pushes every lift below
  // it out of line with the same lift in the next column.
  return (
    <View style={{ flexDirection: "row", flexWrap: wrap ? "wrap" : "nowrap", alignItems: wrap ? "flex-start" : "center" }}>
      {bubbles}
    </View>
  );
}
