import { Redirect, Slot } from "expo-router";
import { useAuth } from "../../lib/auth/AuthProvider";

export default function AuthLayout() {
  const { session, ready } = useAuth();

  if (ready && session) {
    return <Redirect href="/" />;
  }

  return <Slot />;
}
