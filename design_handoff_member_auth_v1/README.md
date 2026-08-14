# Member auth — sign in, reset, account setup (v1)

Approved direction: **11a, clay field with the spinning coin.** Seven screens covering everything under `app/(auth)/`.

Open `Kova Member Mobile - Directions.dc.html` and jump to `#11a` for the live version (the coin animation only reads in motion). Static frames are in `screenshots/` at 2×.

## Screens

| # | File | Route / state |
|---|---|---|
| 1 | `01-sign-in.png` | `(auth)/login.js` |
| 2 | `02-signing-in.png` | `login.js` — `loading` |
| 3 | `03-reset-email.png` | `reset-password.js` — `step: "email"` |
| 4 | `04-reset-code.png` | `reset-password.js` — `step: "code"` |
| 5 | `05-link-sent.png` | `reset-password.js` — `step: "emailSent"` |
| 6 | `06-register-email.png` | `register.js` — `step: "email"` |
| 7 | `07-register-code.png` | `register.js` — `step: "code"` |

Copy is lifted from the current source, so no string changes are implied except where noted below.

## The coin

Full-bleed `#a46a57`. The logo is built as a struck coin: two faces (front is `assets/kova-logo.jpg`, back is a clay disc with the K) separated by a stack of 13 gradient discs that form the machined edge — about 11px thick at 140px diameter.

- `kvSpin` — 360° on Y, 4.5s linear, infinite.
- `kvBob` — ±7px vertical, 4.5s, in phase with the spin.
- `kvShadow` — the blurred ellipse under it scales/fades on the same 4.5s cycle.
- Sign-in coin is 140px. The `Signing you in…` state reuses it at 110px spinning at 1.1s — that is the app's only loading spinner; don't add an `ActivityIndicator` next to it.
- Reset and setup screens use a flat 58px disc, no animation. The spin is a launch moment only.

In React Native the spin needs `Animated` + `rotateY` with `perspective` on the transform; the disc stack is fine as absolutely-positioned `View`s inside a `transform: [{perspective: 900}]` parent.

## Palette and type

- Ground `#a46a57`; overlay blobs `rgba(255,255,255,.06)` top-left and `rgba(42,33,28,.08)` bottom-right.
- Fields on colour: `rgba(255,255,255,.14)` fill, `1px rgba(255,255,255,.32)` border, `1.5px #fff` when focused, radius 14, height 54.
- Primary CTA inverts: `#faf8f6` fill, `#8a5140` text, radius 14, height 56. Disabled = 50% opacity (matches the existing inline-opacity fix, not `disabled:opacity-50`).
- Headings Protest Strike, 34px sign-in-secondary / 40px wordmark. Body Montserrat 13px, `rgba(255,255,255,.82)`.
- Field labels: Montserrat 700, 9.5px, `.12em` tracking, `rgba(255,255,255,.6)`.

## Two departures from shipping code

1. **Code entry is six boxes**, not one `maxLength={6}` field. Keep `autoComplete="one-time-code"` / `textContentType="oneTimeCode"` on the underlying input so SMS autofill still lands.
2. **"At least 8 characters" is stated under the password field.** Today the rule is only expressed by `verifyDisabled`, which reads as a dead button.

## Flow notes carried over from source

- Reset and setup are the same shape: email → texted 6-digit code → password → signed in. The **text is primary**; the email link is the fallback, and it stays available on the code step (staff accounts and accounts with no `ghl_contact_id` never receive the text and can't be detected client-side).
- Every screen carries `‹ Back to sign in` — `(auth)/_layout.js` is a bare `<Slot/>` with `headerShown: false`, so there's no gesture out.
- Privacy Policy link stays at the bottom of sign-in and setup.
- Error text renders in the same slot it does now, above the CTA; it wasn't drawn but the space is reserved.
