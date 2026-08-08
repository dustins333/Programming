import { useState, useCallback } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getCurrentPeriodStart, getPayPeriod, isPeriodClosed } from "../../../lib/payroll/periods";
import { listOwnRequests, listPendingRequests, submitRequest, cancelOwnPendingRequest, approveRequest, denyRequest } from "../../../lib/payroll/requests";
import { formatDateMDY } from "../../../lib/formatDate";
import { toastError, toastSuccess } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";

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

export default function PayrollRequests() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";

  const [periodStart, setPeriodStart] = useState(null);
  const [period, setPeriod] = useState(null);
  const [ownRequests, setOwnRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decidingId, setDecidingId] = useState(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const start = await getCurrentPeriodStart();
      const [periodRow, mine, pending] = await Promise.all([
        getPayPeriod(start),
        listOwnRequests(profile.id),
        isAdmin ? listPendingRequests() : Promise.resolve([]),
      ]);
      setPeriodStart(start);
      setPeriod(periodRow);
      setOwnRequests(mine);
      setPendingRequests(pending);
    } catch (err) {
      toastError("Failed to load requests", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const closed = isPeriodClosed(period);

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!description.trim() || !Number.isFinite(amt) || amt <= 0) {
      toastError("A description and a positive amount are both required");
      return;
    }
    setSubmitting(true);
    try {
      await submitRequest(profile.id, periodStart, description.trim(), amt);
      toastSuccess("Request submitted");
      setDescription("");
      setAmount("");
      await load();
    } catch (err) {
      toastError("Failed to submit request", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id) => {
    try {
      await cancelOwnPendingRequest(id);
      await load();
    } catch (err) {
      toastError("Failed to cancel request", err);
    }
  };

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
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/payroll/entries"))} className="mb-4 self-start">
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Payroll
        </Text>
        <PayrollTabBar active="requests" profile={profile} />

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            {isAdmin ? (
              <View className="mb-8">
                <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
                  Pending requests
                </Text>
                {pendingRequests.length === 0 ? (
                  <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                    Nothing pending.
                  </Text>
                ) : (
                  pendingRequests.map((r) => (
                    <View key={r.id} className="mb-2 max-w-xl rounded-xl border border-stone-200 p-4">
                      <View className="mb-2 flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{r.staff_name}</Text>
                          <Text className="mt-0.5 text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
                            {r.description}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>${Number(r.amount_requested).toFixed(2)}</Text>
                      </View>
                      <View className="flex-row gap-2">
                        <Pressable
                          onPress={() => handleApprove(r)}
                          disabled={decidingId === r.id}
                          className="rounded-lg px-4 py-2"
                          style={{ backgroundColor: colors.primary, opacity: decidingId === r.id ? 0.6 : 1 }}
                        >
                          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                            Approve ${Number(r.amount_requested).toFixed(2)}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeny(r)}
                          disabled={decidingId === r.id}
                          className="rounded-lg border border-stone-300 px-4 py-2"
                        >
                          <Text style={{ fontFamily: fonts.sansMedium, color: "#78716c", fontSize: 13 }}>Deny</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}

            <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              Request a custom amount
            </Text>
            {closed ? (
              <Text className="mb-6 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                This pay period is closed — new requests will apply to the next open period.
              </Text>
            ) : (
              <View className="mb-8 max-w-xl rounded-2xl border border-stone-200 p-5">
                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                  Description
                </Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. CPR training reimbursement"
                  className="mb-4 rounded-lg border border-stone-300 px-3 py-2.5"
                  style={{ fontFamily: fonts.sans }}
                />
                <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                  Amount ($)
                </Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  inputAccessoryViewID={NUMERIC_DONE_ID}
                  className="mb-4 rounded-lg border border-stone-300 px-3 py-2.5"
                  style={{ fontFamily: fonts.sans }}
                />
                <Pressable
                  onPress={handleSubmit}
                  disabled={submitting}
                  className="items-center rounded-lg px-5 py-3"
                  style={{ backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }}
                >
                  <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                    {submitting ? "Submitting…" : "Submit request"}
                  </Text>
                </Pressable>
              </View>
            )}

            <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              Your requests
            </Text>
            {ownRequests.length === 0 ? (
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                No requests yet.
              </Text>
            ) : (
              ownRequests.map((r) => (
                <View key={r.id} className="mb-2 max-w-xl flex-row items-start justify-between rounded-xl border border-stone-200 p-4">
                  <View className="flex-1 pr-3">
                    <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{r.description}</Text>
                    <Text className="mt-0.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                      Requested {formatDateMDY(r.created_at?.slice(0, 10))} · ${Number(r.amount_requested).toFixed(2)}
                      {r.status === "approved" ? ` · Paid $${Number(r.approved_amount).toFixed(2)}` : ""}
                    </Text>
                    {r.admin_notes ? (
                      <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                        Note: {r.admin_notes}
                      </Text>
                    ) : null}
                  </View>
                  <View className="items-end gap-1.5">
                    <StatusPill status={r.status} />
                    {r.status === "pending" ? (
                      <Pressable onPress={() => handleCancel(r.id)}>
                        <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                          Cancel
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
