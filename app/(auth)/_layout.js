import { Redirect, Slot, usePathname } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";

export default function AuthLayout() {
  const { session, ready } = useAuth();
  const pathname = usePathname();

  // set-password is reached via a recovery/invite link. On web,
  // detectSessionInUrl mints a real session from that link's fragment
  // before this layout ever renders — gating on session alone bounced the
  // user straight to "/" the instant that happened, skipping the actual
  // set-password step they followed the link to reach.
  const isSetPassword = pathname === "/set-password";

  if (ready && session && !isSetPassword) {
    return <Redirect href="/" />;
  }

  return <Slot />;
}
