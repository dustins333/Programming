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
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
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
      </head>
      <body>{children}</body>
    </html>
  );
}
