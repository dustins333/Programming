import { useId } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient as SvgLinearGradient, RadialGradient, Stop, Rect } from "react-native-svg";
import { fonts } from "../../lib/theme";

// design_handoff_photo_compare_v1, direction "3b Chop" — the shareable
// board, rebuilt. It replaces the earlier peach three-up card, which read
// flat for four reasons the handoff lays out: a warm pale ground fought the
// warm hallway light in the photos, uneven frames made the row ragged, the
// number that is the whole reason anyone posts this was a ~20px footnote,
// and the white bar underneath was a UI element on something meant to be a
// poster.
//
// Everything here is specced in pixels against a 1080-wide card and scaled
// by `width / 1080`, rather than in percentages. Percentages can't carry
// font sizes, and the alternative — measuring with onLayout — is both a
// frame late and unverifiable in this repo's preview browser (react-native-
// web implements onLayout with a ResizeObserver, which never fires there).
// A caller that knows its own width is simpler and testable at any size.
const DESIGN_W = 1080;

const ESPRESSO = "#241a15";
const ESPRESSO_GLOW = "#3d2a21";
const CELL_BACKING = "#1b120f";
const CREAM = "#f7f3ee";
const OLIVE = "#c9dbb4";
const RULE = "rgba(247,243,238,0.13)";

// The house circle mark in cream on transparent (from the handoff, itself
// derived from assets/kova-logo.jpg). It is stamped on the photo band, not
// the card ground, so it always sits over a photo — hence the dark disc
// behind it: cream line art over a pale floor or a white doorframe would
// otherwise disappear.
const MARK = require("../../assets/kova-mark-cream.png");

// Portrait cell shapes per photo count, from the handoff's table. Two and
// three are built and verified there; four is this repo's own derivation —
// the handoff's 2x2 arithmetic leaves a 119px footer, which cannot hold a
// 132px number, and squaring the cells off to make it fit contradicts its
// own "cells stay portrait" rule. A single row of four keeps the cells
// portrait and keeps the card reading as a progression rather than a grid.
const LAYOUTS = {
  2: { columns: 2, cell: 538 / 766 },
  3: { columns: 3, cell: 356 / 676 },
  4: { columns: 4, cell: 356 / 676 },
};
const DEFAULT_LAYOUT = LAYOUTS[3];

const HEADER_H = 105;
const FOOTER_H = 294;
const GAP = 4;

// The handoff fixes each count's card height (1080 square at three photos,
// 1350 at two) and lets the footer take the remainder. Holding the footer
// at 294 instead and letting the card height fall out lands on exactly 1080
// for the three-photo case — the spec's own headline size — while keeping
// the number the same distance off the bottom edge at every count. At two
// photos the handoff's fixed height would leave a 477px footer, which is
// half a card of empty espresso under the number.
function cardMetrics(count, s) {
  const { columns, cell } = LAYOUTS[count] ?? DEFAULT_LAYOUT;
  const rows = Math.ceil(count / columns);
  const cellW = (DESIGN_W - GAP * (columns - 1)) / columns;
  const cellH = cellW / cell;
  const bandH = cellH * rows + GAP * (rows - 1);
  // The two hairline rules stay 1px at any scale — a rule that scales below
  // a pixel disappears — so the card's height is the scaled bands plus two
  // real pixels, not the design height scaled. Get this wrong and
  // `overflow: hidden` quietly clips the bottom of the footer.
  return { cellW: cellW * s, cellH: cellH * s, bandH: bandH * s, height: HEADER_H * s + 1 + bandH * s + 1 + FOOTER_H * s };
}


function weeksBetween(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const days = (new Date(`${endDate}T12:00:00`) - new Date(`${startDate}T12:00:00`)) / 86400000;
  return Math.max(0, Math.round(days / 7));
}

function shortDate(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function headerRange(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const year = new Date(`${endDate}T12:00:00`).getFullYear();
  const start = shortDate(startDate).toUpperCase();
  const end = shortDate(endDate).toUpperCase();
  return start === end ? `${start} · ${year}` : `${start} → ${end} · ${year}`;
}

// U+2212, not a hyphen: at 132px a hyphen reads as a stray dash rather than
// a minus sign.
function formatDelta(n) {
  const body = Math.abs(n).toFixed(1);
  return n < 0 ? `−${body}` : `+${body}`;
}

function Cell({ slot, url, w, h, s, showDetails, firstDate, gradientId }) {
  // A photo with no weigh-in still earns its place in the row — it carries
  // an image, not a number. It gets soft copy in the same slot rather than
  // a blank line, because a hole in the caption row is what made the old
  // card's captions look broken.
  const weekLabel = slot && firstDate ? `week ${(weeksBetween(firstDate, slot.date) ?? 0) + 1}` : "";
  return (
    <View style={{ width: w, height: h, backgroundColor: CELL_BACKING, overflow: "hidden" }}>
      {slot && url ? <Image source={{ uri: url }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : null}
      {slot && showDetails ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 104 * s, paddingHorizontal: 24 * s, paddingBottom: 24 * s }}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <SvgLinearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor="#140d0a" stopOpacity="0.9" />
                <Stop offset="0.45" stopColor="#140d0a" stopOpacity="0.34" />
                <Stop offset="1" stopColor="#140d0a" stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
          </Svg>
          <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: 29 * s, lineHeight: 32 * s, color: CREAM }}>
            {shortDate(slot.date)}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontFamily: fonts.sans, fontSize: 21 * s, marginTop: 2 * s, color: slot.weight != null ? "rgba(247,243,238,0.68)" : "rgba(247,243,238,0.55)" }}
          >
            {slot.weight != null ? `${slot.weight} lb` : weekLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// `slots`: 2-4 {date, weight} | null entries, oldest-first. `urls` maps a
// slot's date to its signed photo URL. `width` is the rendered card width;
// everything else scales from it.
//
// `showDetails` gates every private figure in one switch: the header's date
// range, each photo's own date and weight, and the footer's "183.2 → 179.2
// LB" line. The big delta survives it deliberately — a change of 4 lb is
// the achievement being posted, where an absolute bodyweight is the number
// a client may not want on the internet.
//
// The client's name is never rendered here at all, under any setting. The
// handoff's mock carries one; a board is shared publicly often enough that
// naming her can't be one toggle away from being on.
//
// Adherence is deliberately never shown either — a coach shouldn't have a
// bad adherence number end up on a client's social post.
export function PhotoCompareBoard({ slots, urls, showDetails = true, width = DESIGN_W }) {
  const uid = useId();
  const s = width / DESIGN_W;
  const { cellW, cellH, bandH, height } = cardMetrics(slots.length, s);

  const dated = slots.filter(Boolean);
  const firstDate = dated[0]?.date ?? null;
  const lastDate = dated[dated.length - 1]?.date ?? null;

  // The delta is computed from the SELECTED photos' own weigh-ins, never
  // from the account — an account-wide fallback is what let the old card
  // claim a change that happened over 13 days as if it spanned the whole
  // photo range. Under two weigh-ins, the whole delta block is dropped and
  // the photos carry the card.
  const weighed = dated.filter((x) => x.weight != null);
  const firstWeighed = weighed[0];
  const lastWeighed = weighed[weighed.length - 1];
  const delta = weighed.length >= 2 ? Math.round((lastWeighed.weight - firstWeighed.weight) * 10) / 10 : null;
  const weeks = weeksBetween(firstDate, lastDate);

  return (
    <View style={{ width, height, borderRadius: 18 * s, overflow: "hidden", backgroundColor: ESPRESSO }}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id={`${uid}-ground`} cx="50%" cy="0%" rx="118%" ry="76%">
            <Stop offset="0" stopColor={ESPRESSO_GLOW} />
            <Stop offset="0.64" stopColor={ESPRESSO} />
            <Stop offset="1" stopColor={ESPRESSO} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${uid}-ground)`} />
      </Svg>

      {/* Always this tall whether or not the range renders, so toggling the
          details can never move the photos or change the card's height. */}
      <View style={{ height: HEADER_H * s, paddingTop: 46 * s, paddingHorizontal: 44 * s, alignItems: "flex-end" }}>
        {showDetails ? (
          <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: 15 * s, letterSpacing: 3 * s, color: "rgba(247,243,238,0.5)" }}>
            {headerRange(firstDate, lastDate)}
          </Text>
        ) : null}
      </View>
      <View style={{ height: 1, backgroundColor: RULE }} />

      <View style={{ height: bandH }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP * s }}>
          {slots.map((slot, i) => (
            <Cell
              key={i}
              slot={slot}
              url={slot ? urls[slot.date] : null}
              w={cellW}
              h={cellH}
              s={s}
              showDetails={showDetails}
              firstDate={firstDate}
              gradientId={`${uid}-scrim-${i}`}
            />
          ))}
        </View>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: 24 * s,
            bottom: 24 * s,
            width: 150 * s,
            height: 150 * s,
            borderRadius: 75 * s,
            backgroundColor: "rgba(20,13,10,0.34)",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#140d0a",
            shadowOffset: { width: 0, height: 3 * s },
            shadowOpacity: 0.34,
            shadowRadius: 16 * s,
          }}
        >
          <Image source={MARK} resizeMode="contain" style={{ width: 124 * s, height: 124 * s }} />
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: RULE }} />
      <View style={{ height: FOOTER_H * s, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingTop: 26 * s, paddingHorizontal: 44 * s, paddingBottom: 34 * s }}>
        <View>
          {delta !== null ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 14 * s }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 132 * s, lineHeight: 114 * s, letterSpacing: -2 * s, color: OLIVE }}>{formatDelta(delta)}</Text>
                <Text style={{ fontFamily: fonts.display, fontSize: 38 * s, color: "rgba(201,219,180,0.6)" }}>LB</Text>
              </View>
              {showDetails ? (
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 16 * s, letterSpacing: 2.6 * s, marginTop: 14 * s, color: "rgba(247,243,238,0.45)" }}>
                  {`${firstWeighed.weight} → ${lastWeighed.weight} LB`}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
        {weeks !== null ? (
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 40 * s, color: CREAM }}>{weeks}</Text>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 14 * s, letterSpacing: 2.2 * s, marginTop: 2 * s, color: "rgba(247,243,238,0.38)" }}>WEEKS</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
