import { useEffect } from "react";
import { Platform } from "react-native";

// iOS Safari auto-zooms the viewport when a focused input's font-size is
// under 16px — the exact behavior that keeps the keyboard from covering a
// small text field on the web PWA, and desired as-is. But Safari has a
// longstanding bug where it doesn't zoom back out once the field blurs and
// the keyboard closes. Forcing the viewport meta's maximum-scale to 1 for a
// moment on blur, then restoring the original (zoom-in-capable) content, is
// the standard workaround — it snaps the visual viewport back to 1x without
// disabling the zoom-in behavior itself.
export function ViewportZoomReset() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return;
    const original = viewport.getAttribute("content");

    // blur doesn't bubble, so this needs the capture phase to catch it
    // from any input/textarea anywhere in the tree via one listener.
    const handleBlur = (e) => {
      const tag = e.target?.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA") return;
      viewport.setAttribute("content", `${original}, maximum-scale=1`);
      setTimeout(() => viewport.setAttribute("content", original), 100);
    };

    document.addEventListener("blur", handleBlur, true);
    return () => document.removeEventListener("blur", handleBlur, true);
  }, []);

  return null;
}
