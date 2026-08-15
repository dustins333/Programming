import { ScrollViewStyleReset } from "expo-router/html";

// Customizes the root HTML document for the static web export (see
// docs.expo.dev/router/web/static-rendering) — this only runs in Node
// during export, never in the browser. Added so app.kovastrength.com can
// be "Add to Home Screen"-installed as a real PWA (icon + standalone
// window, no Safari chrome) rather than a plain bookmark — lets clients
// start using Kova on the web while the native App Store build is still
// pending review.
export default function Root({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover is what unlocks real env(safe-area-inset-*)
            values on iOS — without it they're always 0, so
            react-native-safe-area-context's useSafeAreaInsets() (which
            @react-navigation/bottom-tabs' BottomTabBar reads to size itself,
            same as every other insets.bottom usage in this app — the
            floating message bubble, the web push banner, etc.) silently
            reported no bottom clearance at all when installed as a
            standalone PWA. In a regular Safari tab this went unnoticed —
            Safari's own chrome already reserves that space — but a
            standalone PWA has no browser chrome, so the page itself has to
            claim the space the OS reserves for the home-indicator gesture
            area, which is exactly what was missing (tab bar rendering at
            its bare-minimum height, buttons reading as too small/cramped). */}
        {/* interactive-widget=resizes-content asks the browser to shrink the
            LAYOUT viewport when the on-screen keyboard opens, rather than
            only the visual one — which is what makes `height:100%` (see
            ScrollViewStyleReset below) stop covering the app with the
            keyboard. Chrome/Android honours it natively; iOS Safari ignores
            it, so components/WebKeyboardViewport.js does the same job there
            in JS. Unknown viewport keys are ignored, so this is inert
            everywhere else. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover, interactive-widget=resizes-content" />
        <ScrollViewStyleReset />

        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#a46a57" />

        {/* iOS ignores manifest.json's display:"standalone" on its own —
            these are the meta tags that actually get Safari to launch
            without its address bar/chrome once added to the home screen. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Kova Strength" />

        {/* The "blue boxes" on focused fields were Safari's UA FOCUS RING all
            along, not AutoFill — proven when the identical box showed up on
            desktop Safari with no keyboard (and no AutoFill bar) in sight.
            The original removal rule here was written as
            `input:focus:not(:focus-visible)`, which is dead code for text
            fields: per the CSS spec's :focus-visible heuristic, an element
            that supports keyboard input matches :focus-visible WHENEVER it
            is focused — clicked, tapped, or tabbed, the modality never
            matters for text fields (verified empirically against the real
            export, not just the spec). So the guard exempted exactly the
            elements it was written for, and the ring survived everywhere.

            input/textarea now drop the outline unconditionally — every text
            field in this app carries its own border/background styling and
            a visible caret, so keyboard-tab users still see where they are.
            A follow-up sweep for this same bug caught one more: a real
            mouse click on a <select> ALSO reports :focus-visible === true
            (measured, not assumed — the earlier draft of this comment
            claimed the opposite), so a guarded `select:focus:not(
            :focus-visible)` rule was dead code too, and every coach-side
            dropdown kept the browser's ring. Nothing here depends on that
            heuristic anymore: input/textarea/select all drop the UA
            outline unconditionally, and <select> — which has no caret, so
            it does need *some* focus indicator — gets an explicit
            brand-colored one. Whether an engine matches :focus-visible on
            click or only on tab, the worst case is now our own terracotta
            ring rather than the browser's blue box.

            The AutoFill Contact BAR on the iOS keyboard is a separate,
            OS-level affordance — that part page code still can't remove.
            The remaining rules cover the in-field contacts icon and the
            browser-painted autofill background. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
input[autocomplete="off"]::-webkit-contacts-auto-fill-button,
input[autocomplete="off"]::-webkit-credentials-auto-fill-button {
  visibility: hidden;
  display: none !important;
  height: 0;
  width: 0;
  margin: 0;
}
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:-webkit-autofill:active,
textarea:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 1000px transparent inset;
  -webkit-text-fill-color: #44403c;
  transition: background-color 600000s 0s;
}
input, textarea, select { -webkit-tap-highlight-color: transparent; }
input:focus,
textarea:focus,
select:focus {
  outline: none;
  outline-style: none;
}
select:focus-visible {
  outline: 2px solid #a46a57;
  outline-offset: 1px;
}
`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
