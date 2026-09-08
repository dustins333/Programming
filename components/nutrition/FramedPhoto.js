import { View, Image } from "react-native";
import { framingPercentStyle } from "../../lib/nutrition/photoFraming";

// One place that knows how to draw a progress photo inside a frame.
//
// Every compare surface used to render its own <Image resizeMode="cover">,
// so a coach's framing adjustment would have had to be threaded through
// five near-identical call sites and would have drifted at the first one
// somebody forgot. This is that one call site.
//
// The frame is sized either explicitly (`width`/`height`, for the compare
// rail and the shareable board, which both compute real pixels) or by its
// container (`aspectRatio`, for the flex-and-percentage layouts). The image
// inside is positioned in PERCENTAGES either way, so nothing ever needs
// measuring -- see framingLayoutFractions for why that is worth doing.
//
// An UNADJUSTED photo takes the plain cover path deliberately, rather than
// falling through the layout maths with an identity framing. The two agree
// arithmetically, but a photo nobody has touched should be provably
// untouched, not merely computed back to where it started.
//
// The lightbox and the "fix a day's photos" editor deliberately do NOT use
// this: one is the full original, the other is where a coach works out
// which photo is which, and both want the raw truth.
export function FramedPhoto({
  uri,
  framing,
  width,
  height,
  aspectRatio,
  radius = 12,
  backgroundColor = "#f1efed",
  style,
  children,
}) {
  const fixed = width != null && height != null;
  const ratio = fixed ? width / height : aspectRatio ?? 3 / 4;
  const frame = fixed
    ? { width, height, borderRadius: radius, backgroundColor, overflow: "hidden" }
    : { width: "100%", aspectRatio: ratio, borderRadius: radius, backgroundColor, overflow: "hidden" };

  const positioned = uri ? framingPercentStyle(framing, ratio) : null;

  return (
    <View style={[frame, style]}>
      {uri && !positioned ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : null}
      {uri && positioned ? <Image source={{ uri }} style={positioned} resizeMode="cover" /> : null}
      {children}
    </View>
  );
}
