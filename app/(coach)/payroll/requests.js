// The one and only home for custom pay, per direct ask — the entry screen's
// Custom tile is gone, so anything outside the standard rates starts as a
// request here and only becomes real money when an admin approves it
// (which writes the linked pay_entries row directly; see
// lib/payroll/requests.js's approveRequest).
//
// Laid out as collapsible cards because this is read on a phone and the
// lists are usually short or empty: submit a request, see what's pending,
// see what's been approved, without scrolling past three empty sections to
// get there.
import { useState, useCallback, useContext, useMemo, useRef } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getCurrentPeriodStart, getPayPeriod, isPeriodClosed } from "../../../lib/payroll/periods";
import { listOwnRequests, listPendingRequests, submitRequest, cancelOwnPendingRequest, approveRequest, denyRequest } from "../../../lib/payroll/requests";
import { formatDateMDY } from "../../../lib/formatDate";
import { toastError, toastSuccess } from "../../../lib/toast";
import { confirmDelete } from "../../../lib/confirmDialog";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { ExpandableCard } from "../../../components/payroll/ExpandableCard";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";
import { useKeyboardHeight, useScrollToKeyboard, DONE_BAR_HEIGHT } from "../../../lib/scrollToKeyboard";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function EmptyLine({ children }) {
  return (
    <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
      {children}
    </Text>
  );
}

// One of the requester's own requests. Status isn't repeated as a pill —
// the card it's sitting in already says Pending/Approved/Denied.
function OwnRequestRow({ request, onCancel }) {
  const approved = request.status === "approved";
  return (
    <View className="mb-2 rounded-xl px-3.5 py-3" style={{ borderWidth: 1, borderColor: "#ece7e1" }}>
      <View className="flex-row items-start justify-between">
        <Text className="flex-1 pr-3" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
          {request.description}
        </Text>
        <Text style={{ fontFamily: fonts.sansBold, color: approved ? "#4d6142" : colors.primaryOnWhite }}>
          {money(approved ? request.approved_amount : request.amount_requested)}
        </Text>
      </View>
      <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
        Requested {formatDateMDY(request.created_at?.slice(0, 10))}
        {approved && Number(request.approved_amount) !== Number(request.amount_requested)
          ? ` · asked ${money(request.amount_requested)}`
          : ""}
      </Text>
      {request.admin_notes ? (
        <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          Note: {request.admin_notes}
        </Text>
      ) : null}
      {onCancel ? (
        <Pressable onPress={onCancel} hitSlop={6} className="mt-2 self-start">
          <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: "#b23a22" }}>
            Cancel request
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Admin's approval queue row — buttons stack full-width rather than sitting
// side by side, so neither is a cramped tap target on a phone.
function ApprovalRow({ request, busy, onApprove, onDeny }) {
  return (
    <View className="mb-2 rounded-xl px-3.5 py-3" style={{ borderWidth: 1, borderColor: "#ece7e1" }}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{request.staff_name}</Text>
          <Text className="mt-0.5 text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
            {request.description}
          </Text>
        </View>
        <Text style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>{money(request.amount_requested)}</Text>
      </View>
      <Pressable
        onPress={onApprove}
        disabled={busy}
        className="mt-3 items-center rounded-lg px-4 py-2.5"
        style={{ backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }}
      >
        <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
          Approve {money(request.amount_requested)}
        </Text>
      </Pressable>
      <Pressable onPress={onDeny} disabled={busy} className="mt-2 items-center rounded-lg border border-stone-300 px-4 py-2.5">
        <Text style={{ fontFamily: fonts.sansMedium, color: "#78716c", fontSize: 13 }}>Deny</Text>
      </Pressable>
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

  // Explicit overrides only — anything not toggled falls back to the
  // section's own default (see isOpen below), so a coach with one pending
  // request lands with exactly that section already open.
  const [openSections, setOpenSections] = useState({});
  const toggle = (key) => setOpenSections((s) => ({ ...s, [key]: !isOpen(key) }));

  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const requestCardRef = useRef(null);
  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const keyboardPadding = Math.max(0, occludedHeight - tabBarHeight);

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

  const myPending = useMemo(() => ownRequests.filter((r) => r.status === "pending"), [ownRequests]);
  const myApproved = useMemo(() => ownRequests.filter((r) => r.status === "approved"), [ownRequests]);
  const myDenied = useMemo(() => ownRequests.filter((r) => r.status === "denied"), [ownRequests]);

  const defaultOpen = {
    new: ownRequests.length === 0,
    approvals: pendingRequests.length > 0,
    pending: myPending.length > 0,
    approved: false,
    denied: false,
  };
  function isOpen(key) {
    return openSections[key] ?? defaultOpen[key] ?? false;
  }

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
      setOpenSections((s) => ({ ...s, new: false, pending: true }));
      await load();
    } catch (err) {
      toastError("Failed to submit request", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id) => {
    if (!(await confirmDelete("Cancel this pending request? You can re-enter it later if needed.", "Cancel request?"))) return;
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
      toastSuccess(`Approved — ${money(request.amount_requested)} added to their payroll`);
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
      <ScrollView
        ref={scrollViewRef}
        style={{ backgroundColor: colors.canvas }}
        className="flex-1 px-8 pt-8"
        contentContainerStyle={{ paddingBottom: 40 + keyboardPadding }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
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
            <Text className="mb-4 max-w-xl text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
              Anything outside the standard rates — reimbursements, bonuses, one-offs. Submit it here and it's added to your
              pay once an admin approves it.
            </Text>

            <ExpandableCard title="New request" open={isOpen("new")} onToggle={() => toggle("new")}>
              {closed ? (
                <EmptyLine>This pay period is closed — new requests will apply to the next open period.</EmptyLine>
              ) : (
                <View ref={requestCardRef}>
                  <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                    Description
                  </Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    onFocus={() => scrollFieldIntoView(requestCardRef.current)}
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
                    onFocus={() => scrollFieldIntoView(requestCardRef.current)}
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
            </ExpandableCard>

            {isAdmin ? (
              <ExpandableCard
                title="Awaiting your approval"
                count={pendingRequests.length}
                tone="attention"
                subtitle="Everyone's requests, across the team"
                open={isOpen("approvals")}
                onToggle={() => toggle("approvals")}
              >
                {pendingRequests.length === 0 ? (
                  <EmptyLine>Nothing pending.</EmptyLine>
                ) : (
                  pendingRequests.map((r) => (
                    <ApprovalRow
                      key={r.id}
                      request={r}
                      busy={decidingId === r.id}
                      onApprove={() => handleApprove(r)}
                      onDeny={() => handleDeny(r)}
                    />
                  ))
                )}
              </ExpandableCard>
            ) : null}

            <ExpandableCard
              title="Your pending requests"
              count={myPending.length}
              tone="attention"
              open={isOpen("pending")}
              onToggle={() => toggle("pending")}
            >
              {myPending.length === 0 ? (
                <EmptyLine>Nothing waiting on an admin right now.</EmptyLine>
              ) : (
                myPending.map((r) => <OwnRequestRow key={r.id} request={r} onCancel={() => handleCancel(r.id)} />)
              )}
            </ExpandableCard>

            <ExpandableCard
              title="Approved"
              count={myApproved.length}
              tone="done"
              subtitle="Already added to your pay"
              open={isOpen("approved")}
              onToggle={() => toggle("approved")}
            >
              {myApproved.length === 0 ? (
                <EmptyLine>Nothing approved yet.</EmptyLine>
              ) : (
                myApproved.map((r) => <OwnRequestRow key={r.id} request={r} />)
              )}
            </ExpandableCard>

            {myDenied.length > 0 ? (
              <ExpandableCard title="Denied" count={myDenied.length} open={isOpen("denied")} onToggle={() => toggle("denied")}>
                {myDenied.map((r) => (
                  <OwnRequestRow key={r.id} request={r} />
                ))}
              </ExpandableCard>
            ) : null}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
