import { CodeAuthFlow } from "../../components/auth/CodeAuthFlow";

// Email -> SMS code (via GHL, using the account's stored ghl_contact_id —
// see import-client) -> set password -> signed in. For members created
// ahead of time by the GHL "won" webhook, who've never opened the app or
// set a password before. See CLAUDE.md's GHL import section for the full
// design and why this doesn't use email links (spam deliverability) or
// store a phone number itself (GHL stays the source of truth for that).
//
// This is the first screen a new member ever meets, and it used to be the
// thinner of the two versions of this flow — no explanation of which email
// to use, no resend, no way through at all if the text never arrived. The
// flow now lives in CodeAuthFlow so it can't fall behind /reset-password
// again; all that differs is the wording.
export default function Register() {
  return (
    <CodeAuthFlow
      copy={{
        emailHeading: "Set up your account.",
        codeBody: "Enter the 6-digit code we sent, then choose a password.",
        passwordLabel: "PASSWORD",
        passwordPlaceholder: "Password",
        verifyLabel: "Verify & sign in",
        emailSentBody: "for a link to finish setting up your account.",
      }}
    />
  );
}
