import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { graphicUrl } from "../lib/media/graphics";

// Renders a `graphics`-bucket image at its own aspect ratio, without ever
// cropping it.
//
// A Canva export could be square, 4:5, or a 9:16 story, and we don't know
// which until it loads — so the ratio is measured with Image.getSize and the
// box is sized from it. `minRatio` stops a very tall graphic from eating the
// whole screen: the box never gets taller than that ratio, and resizeMode
// "contain" letterboxes the image inside it rather than cutting anything
// off. `maxHeight` is the same guard in absolute terms, for a container
// whose width isn't known up front.
// `coverHeight` switches to card-header behaviour: a fixed-height,
// full-width band that crops rather than letterboxes. Use it where the
// image is a thumbnail leading into somewhere else (a list card); use the
// default contain sizing wherever the member is meant to actually READ the
// graphic, since a Canva poster is mostly text and cropping eats it.
export function GraphicImage({ path, minRatio = 0.75, maxHeight, coverHeight, radius = 12, style }) {
  const uri = graphicUrl(path);
  const [ratio, setRatio] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!uri) {
      setRatio(null);
      setFailed(false);
      return undefined;
    }
    let cancelled = false;
    setFailed(false);
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled && h > 0) setRatio(w / h);
      },
      () => {
        if (!cancelled) setFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  // Render nothing at all rather than an empty placeholder box. getSize
  // failing means the URL itself is unfetchable (both here and in the <img>
  // below — react-native-web's getSize uses the same load/error mechanism
  // the rendered image does), and reserving 260px of grey above an
  // announcement's title is worse than simply not showing a graphic.
  if (!uri || failed) return null;

  const effectiveRatio = ratio ? Math.max(ratio, minRatio) : 1;

  if (coverHeight) {
    return (
      <View style={{ width: "100%", height: coverHeight, borderRadius: radius, overflow: "hidden", backgroundColor: "#f1efed", ...style }}>
        <Image source={{ uri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} />
      </View>
    );
  }

  return (
    <View
      style={{
        width: "100%",
        aspectRatio: effectiveRatio,
        // A height budget has to be spent as a WIDTH cap, not a maxHeight.
        // `maxHeight` alongside `aspectRatio` doesn't shrink the box — the
        // width stays 100%, the height clamps, and the ratio breaks, so a
        // 4:5 poster ends up in a landscape box with grey bars down both
        // sides. Capping width at (budget x ratio) keeps the box exactly the
        // image's shape and bounds the height implicitly, since
        // height = width / ratio <= maxHeight.
        maxWidth: maxHeight ? maxHeight * effectiveRatio : undefined,
        alignSelf: "center",
        borderRadius: radius,
        overflow: "hidden",
        backgroundColor: "#f1efed",
        ...style,
      }}
    >
      <Image source={{ uri }} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
    </View>
  );
}
