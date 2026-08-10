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
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
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

        {/* Safari's AutoFill Contact over the member's number fields on the
            installed iOS PWA — the blue highlight box on the focused field
            plus an "AutoFill Contact" bar on the keyboard. Safari ignores
            autocomplete="off" outright, so the real fix is field-level:
            lib/webAutofillSuppression.js hands those inputs type="search",
            which Safari classifies as needing no AutoFill. The rules here
            are the leftovers that CSS can cover — the in-field contacts
            icon, a browser-painted autofill background, and the UA focus
            ring on tap (:not(:focus-visible) keeps the ring for real
            keyboard tabbing on the coach's desktop web). */}
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
input:focus:not(:focus-visible),
textarea:focus:not(:focus-visible),
select:focus:not(:focus-visible) { outline: none; }
`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
