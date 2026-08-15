import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";

// Landing screen for Payroll. Non-admins never see this — they land
// straight on My Entries, same as before this mode split existed. Admins
// get an explicit choice: log their own hours same as any coach (Staff
// View), or reach the admin-only surfaces — requests/pay
// periods/report/settings — kept fully separate so an admin's own pay
// never mixes with the staff-wide view on the same page, per explicit ask.
export default function PayrollLanding() {
  const { profile } = useAuth();
  const router = useRouter();

  if (!profile) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.canvas }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  if (profile.role !== "admin") {
    return <Redirect href="/(coach)/payroll/entries" />;
  }

  return (
    <CoachShell>
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: colors.canvas }}>
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Payroll
        </Text>
        <Text className="mb-8 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Which view do you want?
        </Text>
        <View className="w-full flex-row" style={{ gap: 16, maxWidth: 480 }}>
          <Pressable
            onPress={() => router.push("/(coach)/payroll/entries")}
            className="flex-1 items-center rounded-2xl bg-white px-6 py-10"
            style={{ borderWidth: 1, borderColor: "#ece7e1" }}
          >
            <Ionicons name="checkmark-circle-outline" size={30} color={colors.primaryOnWhite} />
            <Text className="mt-3" style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c" }}>
              Staff View
            </Text>
            <Text className="mt-1 text-center text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              Log your own hours, requests, and pay
            </Text>
          </Pressable>
          {/* Lands on This period, not Requests: reviewing and closing the
              open period is the job an admin comes here to do, and requests
              are usually empty. */}
          <Pressable
            onPress={() => router.push("/(coach)/payroll/admin/periods")}
            className="flex-1 items-center rounded-2xl bg-white px-6 py-10"
            style={{ borderWidth: 1, borderColor: "#ece7e1" }}
          >
            <Ionicons name="grid-outline" size={30} color={colors.primaryOnWhite} />
            <Text className="mt-3" style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c" }}>
              Admin View
            </Text>
            <Text className="mt-1 text-center text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              Review and close periods, requests, report
            </Text>
          </Pressable>
        </View>
      </View>
    </CoachShell>
  );
}
