// Web half of the how-to video player. A raw <video> element rather than
// anything from react-native-web: RNW has no video primitive, and on web the
// React reconciler IS react-dom, so a lowercase tag renders exactly as it
// would in any page (same reasoning as RailResizer's raw <div>).
//
// See HelpVideoPlayer.js for native, which has no video library installed and
// hands off to the browser instead. Both expose { url, title }.
//
// NEVER import the native sibling from in here — Metro's platform-extension
// resolution would resolve "./HelpVideoPlayer" straight back to this file and
// recurse until the tab dies.

// preload="metadata" fetches headers only, so a screen of players costs a few
// KB rather than downloading every video the moment Help opens.
export function HelpVideoPlayer({ url, title }) {
  if (!url) return null;
  return (
    <video
      src={url}
      controls
      preload="metadata"
      playsInline
      aria-label={title || "How-to video"}
      style={{
        display: "block",
        width: "100%",
        // A phone screen recording is portrait (1080x1920), and the browser
        // preserves the intrinsic aspect ratio — so capping the HEIGHT makes
        // the element NARROWER than its card (301px in a 343px card,
        // measured), not letterboxed. Hence the auto margins: without them a
        // portrait clip sits left with a dead gap down the right.
        maxHeight: "min(460px, 62vh)",
        marginLeft: "auto",
        marginRight: "auto",
        borderRadius: 12,
        backgroundColor: "#000",
      }}
    />
  );
}
