import { CodeAuthFlow } from "../../components/auth/CodeAuthFlow";

// Text-first password reset, with email as the fallback.
//
// SMS leads because that's the route that actually reaches people — the
// invite emails this replaced had real deliverability problems (see
// CLAUDE.md's GHL import section). It reuses register.js's two Edge
// Functions verbatim: verify-registration-code sets the password via the
// Admin API and doesn't care whether the account has been registered
// before, so it doubles as recovery with no server-side change.
//
// Shares CodeAuthFlow with /register — same three steps, different words.
export default function ResetPassword() {
  return (
    <CodeAuthFlow
      copy={{
        emailHeading: "Reset your password.",
        codeBody: "Enter the 6-digit code we sent, then pick a new password.",
        passwordLabel: "NEW PASSWORD",
        passwordPlaceholder: "New password",
        verifyLabel: "Reset & sign in",
        emailSentBody: "for a link to set a new password.",
      }}
    />
  );
}
