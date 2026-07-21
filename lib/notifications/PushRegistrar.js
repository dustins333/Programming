import { useEffect } from "react";
import { useAuth } from "../auth/AuthProvider";
import { registerPushToken } from "./registerPushToken";

// Renders nothing — just registers/refreshes this device's push token
// whenever a profile becomes available. Split out from AuthProvider so
// auth state and push registration stay separately testable.
export function PushRegistrar() {
  const { profile } = useAuth();

  useEffect(() => {
    if (profile?.id) {
      registerPushToken(profile.id);
    }
  }, [profile?.id]);

  return null;
}
