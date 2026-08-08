import { useState, useCallback } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { getCurrentPeriodStart, computePeriodEnd } from "../../../../lib/payroll/periods";
import { listAllRequests, approveRequest, denyRequest } from "../../../../lib/payroll/requests";
import { formatDateMD, formatDateMDY } from "../../../../lib/formatDate";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { fonts, colors } from "../../../../lib/theme";
import { CoachShell } from "../../../../components/CoachShell";
import { AdminPayrollTabBar } from "../../../../components/AdminPayrollTabBar";

const STATUS_TONE = {
  pending: { bg: "#f4ede3", text: "#8a5a2e" },
  approved: { bg: "#eef1e7", text: "#4d6142" },
  denied: { bg: "#fdece5", text: "#b23a22" },
};

function StatusPill({ status }) {
  const tone = STATUS_TONE[status] || STATUS_TONE.pending;
  return (
    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: tone.bg }}>
      <Text style={{ fontFamily: fonts.sansMedium, color: tone.text, fontSize: 11 }}>{status}</Text>
    </View>
  );
}

function RequestRow({ r, decidingId, onApprove, onDeny }) {
  return (
    <View key={r.id} className="mb-2 max-w-xl rounded-xl border border-stone-200 p-4">
      <View className="mb-2 flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{r.staff_name}</Text>
          <Text className="mt-0.5 text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
            {r.description}
          </Text>
          <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            Requested {formatDateMDY(r.created_at?.slice(0, 10))}
          </Text>
        </View>
        <View className="items-end gap-1.5">
          <Text style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>${Number(r.amount_requested).toFixed(2)}</Text>
          {r.status !== "pending" ? <StatusPill status={r.status} /> : null}
        </View>
      </View>
      {r.status === "pending" && onApprove ? (
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => onApprove(r)}
            disabled={decidingId === r.id}
            className="rounded-lg px-4 py-2"
            style={{ backgroundColor: colors.primary, opacity: decidingId === r.id ? 0.6 : 1 }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
              Approve ${Number(r.amount_requested).toFixed(2)}
            </Text>
          </Pressable>
          <Pressable onPress={() => onDeny(r)} disabled={decidingId === r.id} className="rounded-lg border border-stone-300 px-4 py-2">
            <Text style={{ fontFamily: fonts.sansMedium, color: "#78716c", fontSize: 13 }}>Deny</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function AdminPayrollRequests() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";

  const [currentPeriodStart, setCurrentPeriodStart] = useState(null);
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [start, requests] = await Promise.all([getCurrentPeriodStart(), listAllRequests()]);
      setCurrentPeriodStart(start);
      setAllRequests(requests);
    } catch (err) {
      toastError("Failed to load requests", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (profile && !isAdmin) {
    return <Redirect href="/(coach)/payroll" />;
  }

  const currentPeriodRequests = allRequests.filter((r) => r.pay_period_start === currentPeriodStart);
  const historyRequests = allRequests.filter((r) => r.pay_period_start !== currentPeriodStart);
  const historyByPeriod = new Map();
  for (const r of historyRequests) {
    if (!historyByPeriod.has(r.pay_period_start)) historyByPeriod.set(r.pay_period_start, []);
    historyByPeriod.get(r.pay_period_start).push(r);
  }
  const historyPeriods = Array.from(historyByPeriod.keys()).sort((a, b) => (a < b ? 1 : -1));

  const handleApprove = async (request) => {
    setDecidingId(request.id);
    try {
      await approveRequest(request, request.amount_requested, profile.id);
      toastSuccess(`Approved — $${Number(request.amount_requested).toFixed(2)} added to their payroll`);
      await load();
    } catch (err) {
      toastError("Failed to approve", err);
    } finally {
      setDecidingId(null);
    }
  };

  const handleDeny = async (request) => {
    setDecidingId(request.id);
    try {
      await denyRequest(request.id, profile.id);
      toastSuccess("Denied");
      await load();
    } catch (err) {
      toastError("Failed to deny", err);
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <CoachShell>
      <ScrollView style={{ backgroundColor: colors.canvas }} className="flex-1 px-8 pt-8" contentContainerStyle={{ paddingBottom: 40 }}>
        {Platform.OS !== "web" ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/payroll"))} className="mb-4 self-start">
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Payroll — Admin
        </Text>
        <AdminPayrollTabBar active="requests" />

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              This period{currentPeriodStart ? ` — ${formatDateMD(currentPeriodStart)} – ${formatDateMD(computePeriodEnd(currentPeriodStart))}` : ""}
            </Text>
            {currentPeriodRequests.length === 0 ? (
              <Text className="mb-8 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                No requests for this period.
              </Text>
            ) : (
              <View className="mb-8">
                {currentPeriodRequests.map((r) => (
                  <RequestRow key={r.id} r={r} decidingId={decidingId} onApprove={handleApprove} onDeny={handleDeny} />
                ))}
              </View>
            )}

            <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              History
            </Text>
            {historyPeriods.length === 0 ? (
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                No prior requests.
              </Text>
            ) : (
              historyPeriods.map((periodStart) => (
                <View key={periodStart} className="mb-6">
                  <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansSemiBold, color: "#78716c" }}>
                    {formatDateMD(periodStart)} – {formatDateMD(computePeriodEnd(periodStart))}
                  </Text>
                  {historyByPeriod.get(periodStart).map((r) => (
                    <RequestRow key={r.id} r={r} decidingId={decidingId} onApprove={null} onDeny={null} />
                  ))}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
