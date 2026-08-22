import { Text, View } from "react-native";
import { fonts, colors } from "../../lib/theme";

// The one set-bubble primitive on the hub board. Reps large, weight small
// beside it, each set in its own pill — used identically by a resting lift's
// chip row, the expanded card's last-week strip, and the dock's block
// history. Never rendered as a run of text ("8×65 · 8×65 · 7×65"), which
// reads as a sentence instead of as three sets you can compare at a glance.
//
// A pill with nothing logged is DASHED and shows that set's programmed
// target — the same "empty means not done, and here's what was asked for"
// language the member app uses inside its set boxes.

const LOGGED_BG = "#f3f6ef";
const LOGGED_BORDER = "#dbe8cf";
const LOGGED_TEXT = "#3f4a36";

const SIZES = {
  sm: { reps: 13, weight: 9.5, padH: 7, padV: 3, minWidth: 40, gap: 5 },
  md: { reps: 15, weight: 10.5, padH: 8, padV: 4, minWidth: 48, gap: 6 },
  lg: { reps: 17, weight: 11.5, padH: 9, padV: 5, minWidth: 56, gap: 6 },
};

export function SetBubble({ reps, weight, target, tracksWeight = true, size = "md", tone = "logged" }) {
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
        marginTop: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: logged ? "solid" : "dashed",
        borderColor: logged ? (tone === "plain" ? "#e7e0d8" : LOGGED_BORDER) : "#ddd6cd",
        backgroundColor: logged ? (tone === "plain" ? "white" : LOGGED_BG) : "transparent",
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: fonts.sansBold,
          fontSize: s.reps,
          color: logged ? (tone === "plain" ? "#292524" : LOGGED_TEXT) : colors.hint,
        }}
        numberOfLines={1}
      >
        {logged ? reps ?? "–" : target ?? "–"}
      </Text>
      {showWeight ? (
        <Text
          style={{
            fontFamily: fonts.sansMedium,
            fontSize: s.weight,
            color: tone === "plain" ? colors.muted : "#5c6b52",
            marginLeft: 3,
          }}
        >
          ×{weight}
        </Text>
      ) : null}
    </View>
  );
}

// sets: log rows (or {reps, weight} drafts) keyed by set_number.
// targetCount / targetFor fill the row out to the programmed set count with
// dashed placeholders, so "3 × 8 but only two done" is visible as a shape.
export function SetBubbleRow({ sets = [], targetCount = 0, targetFor, tracksWeight = true, size = "md", tone = "logged" }) {
  const real = (sets ?? []).filter((r) => r.reps != null || r.weight != null);
  const maxSet = real.reduce((m, r) => Math.max(m, r.set_number ?? 0), 0);
  const count = Math.max(targetCount, maxSet, real.length);
  const bubbles = [];
  for (let i = 1; i <= count; i++) {
    const row = real.find((r) => (r.set_number ?? 0) === i) ?? (maxSet === 0 ? real[i - 1] : undefined);
    bubbles.push(
      <SetBubble
        key={i}
        reps={row?.reps ?? null}
        weight={row?.weight ?? null}
        target={targetFor ? targetFor(i) : null}
        tracksWeight={tracksWeight}
        size={size}
        tone={tone}
      />
    );
  }
  return <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{bubbles}</View>;
}
