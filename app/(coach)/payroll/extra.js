// Extra pay — everything that isn't logged day by day on the Log screen.
//
// Requests and 1:1 Nutrition used to be two separate tabs, which meant four
// tabs on a phone and a horizontal ScrollView to reach them. They're the
// same idea (pay that doesn't come off the daily tiles) and both are usually
// short or empty, so they're two segments of one screen instead.
// can_view_nutrition now gates the *segment* rather than a whole tab, so a
// coach without it sees Requests as the entire screen and never an empty
// tab.
//
// Custom pay has only ever lived here since the entry screen's Custom tile
// was removed — a request becomes real money when an admin approves it,
// which writes the linked pay_entries row directly (see approveRequest).
// The approval queue itself is deliberately absent: admins have their own
// login and their own Admin View → Requests screen, and having a second
// copy of it on the staff side meant the same queue in two places.
import { useState, useCallback, useContext, useMemo, useRef, useEffect } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import {
  getCurrentPeriodStart,
  getPayPeriod,
  isPeriodClosed,
  computePeriodEnd,
  listPayPeriodOptions,
  listWritablePeriods,
} from "../../../lib/payroll/periods";
import { listOwnRequests, submitRequest, cancelOwnPendingRequest } from "../../../lib/payroll/requests";
import { listClientsForCoach } from "../../../lib/nutrition/clients";
import {
  listOwnNutritionAssignments,
  addNutritionAssignment,
  updateNutritionAssignment,
  removeNutritionAssignment,
} from "../../../lib/payroll/nutritionAssignments";
import { formatDateMDY, formatDateMD } from "../../../lib/formatDate";
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

// Requests / 1:1 Nutrition. Rendered as a pair of pill segments rather than
// a second row of underline tabs, so it reads as a filter on one screen and
// can't be mistaken for the tab bar above it.
function SegmentSwitch({ segments, value, onChange }) {
  return (
    <View className="mb-4 flex-row" style={{ gap: 8 }}>
      {segments.map((s) => {
        const active = s.key === value;
        return (
          <Pressable
            key={s.key}
            onPress={() => onChange(s.key)}
            className="flex-1 items-center"
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: active ? "#2a211c" : "#ece7e1",
              backgroundColor: active ? "#2a211c" : "white",
              paddingVertical: 12,
            }}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
              style={{ fontFamily: active ? fonts.sansBold : fonts.sansMedium, fontSize: 13, color: active ? "white" : "#78716c" }}
            >
              {s.label}
              {s.count ? ` · ${s.count}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// One of the coach's own requests. Status isn't repeated as a pill — the
// card it sits in already says Pending / Approved / Denied.
function OwnRequestRow({ request, onCancel }) {
  const approved = request.status === "approved";
  return (
    <View className="mb-2 rounded-xl px-3.5 py-3" style={{ borderWidth: 1, borderColor: "#ece7e1" }}>
      <View className="flex-row items-start justify-between">
        <Text className="flex-1 pr-3" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
          {request.description}
        </Text>
        {/* A blank-amount request stores 0, and "$0.00" next to a pending
            row reads as "you are getting nothing" rather than "an admin
            still has to set this". */}
        <Text style={{ fontFamily: fonts.sansBold, color: approved ? "#4d6142" : colors.primaryOnWhite }}>
          {approved
            ? money(request.approved_amount)
            : Number(request.amount_requested) === 0
              ? "amount TBD"
              : money(request.amount_requested)}
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

export default function PayrollExtraPay() {
  const { profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const isAdmin = profile?.role === "admin";
  const canNutrition = isAdmin || Boolean(profile?.can_view_nutrition);

  const [segment, setSegment] = useState(params.segment === "nutrition" ? "nutrition" : "requests");

  const [periodStart, setPeriodStart] = useState(null);
  const [period, setPeriod] = useState(null);
  // Any open period can take a request — unlike pay entries, custom_requests
  // has no finalization gate in RLS, only the closed check, so this is the
  // plain open-period list with no finalizations passed.
  const [writablePeriods, setWritablePeriods] = useState([]);
  const [currentPeriodStart, setCurrentPeriodStart] = useState(null);
  const [ownRequests, setOwnRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [clients, setClients] = useState([]);
  const [assignments, setAssignments] = useState([]);
  // The nutrition roster is a real query per coach, so it's only fetched
  // once that segment is actually opened rather than on every visit to a
  // screen most coaches open for Requests.
  const [nutritionLoaded, setNutritionLoaded] = useState(false);
  const [nutritionLoading, setNutritionLoading] = useState(false);
  const [newDayByClient, setNewDayByClient] = useState({});
  const [addingClientId, setAddingClientId] = useState(null);
  const [editingDay, setEditingDay] = useState({});

  const [openSections, setOpenSections] = useState({});
  const toggle = (key) => setOpenSections((s) => ({ ...s, [key]: !isOpen(key) }));

  const scrollViewRef = useRef(null);
  const scrollOffsetRef = useRef(0);
  const scrollFieldIntoView = useScrollToKeyboard(scrollViewRef, scrollOffsetRef);
  const requestCardRef = useRef(null);
  // loadRequests runs on every focus and must read the actual choice, not
  // the value captured when the callback was first created.
  const selectedPeriodRef = useRef(null);
  const newDayRowRefs = useRef(new Map());
  const editDayRowRefs = useRef(new Map());
  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const keyboardPadding = Math.max(0, occludedHeight - tabBarHeight);

  const loadRequests = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const [current, options, mine] = await Promise.all([
        getCurrentPeriodStart(),
        listPayPeriodOptions(),
        listOwnRequests(profile.id),
      ]);
      setCurrentPeriodStart(current);
      const writable = listWritablePeriods(options).sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
      setWritablePeriods(writable);
      // Keep whatever was picked if it is still open, so a refocus doesn't
      // silently drop the choice back to the current period.
      const keep = writable.some((o) => o.start_date === selectedPeriodRef.current);
      const start = keep ? selectedPeriodRef.current : current;
      selectedPeriodRef.current = start;
      const periodRow = writable.find((o) => o.start_date === start) ?? (await getPayPeriod(start));
      setPeriodStart(start);
      setPeriod(periodRow);
      setOwnRequests(mine);
    } catch (err) {
      toastError("Failed to load requests", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  const selectPeriod = useCallback(
    (start) => {
      selectedPeriodRef.current = start;
      loadRequests();
    },
    [loadRequests]
  );

  const loadNutrition = useCallback(async () => {
    if (!profile?.id) return;
    setNutritionLoading(true);
    try {
      const [clientList, own] = await Promise.all([listClientsForCoach(profile.id), listOwnNutritionAssignments(profile.id)]);
      setClients(clientList);
      setAssignments(own);
      setNutritionLoaded(true);
    } catch (err) {
      toastError("Failed to load nutrition clients", err);
    } finally {
      setNutritionLoading(false);
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      loadRequests();
      // Refetch on refocus only once it's been opened — otherwise coming
      // back to this screen would pull a roster nobody has asked to see.
      if (nutritionLoaded) loadNutrition();
    }, [loadRequests, loadNutrition, nutritionLoaded])
  );

  useEffect(() => {
    if (segment === "nutrition" && !nutritionLoaded && !nutritionLoading) loadNutrition();
  }, [segment, nutritionLoaded, nutritionLoading, loadNutrition]);

  const closed = isPeriodClosed(period);

  const myPending = useMemo(() => ownRequests.filter((r) => r.status === "pending"), [ownRequests]);
  const myApproved = useMemo(() => ownRequests.filter((r) => r.status === "approved"), [ownRequests]);
  const myDenied = useMemo(() => ownRequests.filter((r) => r.status === "denied"), [ownRequests]);

  const defaultOpen = {
    new: ownRequests.length === 0,
    pending: myPending.length > 0,
    approved: false,
    denied: false,
  };
  function isOpen(key) {
    return openSections[key] ?? defaultOpen[key] ?? false;
  }

  // Only the description is required. The amount is deliberately optional
  // and may be zero: for some request types (holiday pay, say) the real
  // figure is one only an admin can work out, and a coach who cannot file
  // without guessing a number would either guess wrong or not file at all.
  // Blank means zero, and an admin has to type a real amount before the
  // approve button on their side will fire.
  const amountTrimmed = amount.trim();
  const requestAmount = amountTrimmed === "" ? 0 : Number(amountTrimmed);
  const amountUsable = Number.isFinite(requestAmount) && requestAmount >= 0;
  // Deliberately not a hard `disabled` on the button \u2014 the button dims but
  // still presses, so tapping it says what is missing instead of doing nothing.
  const requestReady = Boolean(description.trim()) && amountUsable;

  const handleSubmit = async () => {
    const amt = requestAmount;
    if (!description.trim()) {
      toastError("A description is required");
      return;
    }
    if (!amountUsable) {
      toastError("Leave the amount blank, or enter $0 or more");
      return;
    }
    setSubmitting(true);
    try {
      await submitRequest(profile.id, periodStart, description.trim(), amt);
      toastSuccess("Request submitted");
      setDescription("");
      setAmount("");
      setOpenSections((s) => ({ ...s, new: false, pending: true }));
      await loadRequests();
    } catch (err) {
      // custom_requests_dedup_idx is (staff_email, pay_period_start,
      // description, amount_requested). Two blank-amount requests both land
      // at 0, so an identical description in the same period now collides
      // far more easily than it did when every request carried its own
      // number \u2014 say what to do about it instead of surfacing a raw 23505.
      if (err?.code === "23505") {
        toastError("You already have a request with that exact description this period \u2014 add the date or a detail to tell them apart");
      } else {
        toastError("Failed to submit request", err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id) => {
    if (!(await confirmDelete("Cancel this pending request? You can re-enter it later if needed.", "Cancel request?"))) return;
    try {
      await cancelOwnPendingRequest(id);
      await loadRequests();
    } catch (err) {
      toastError("Failed to cancel request", err);
    }
  };

  const assignedClientIds = new Set(assignments.map((a) => a.client_id));
  const unassignedClients = clients.filter((c) => !assignedClientIds.has(c.id));

  const handleCheckClient = async (client) => {
    const day = Number(newDayByClient[client.id]);
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      toastError("Billing day must be between 1 and 31");
      return;
    }
    setAddingClientId(client.id);
    try {
      await addNutritionAssignment(profile.id, client, day);
      toastSuccess(`${client.name} added`);
      setNewDayByClient((prev) => {
        const next = { ...prev };
        delete next[client.id];
        return next;
      });
      await loadNutrition();
    } catch (err) {
      toastError("Failed to add", err);
    } finally {
      setAddingClientId(null);
    }
  };

  const handleUpdateDay = async (assignment) => {
    const day = Number(editingDay[assignment.id]);
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      toastError("Billing day must be between 1 and 31");
      return;
    }
    try {
      await updateNutritionAssignment(assignment.id, { billing_day_of_month: day });
      toastSuccess("Updated");
      setEditingDay((prev) => {
        const next = { ...prev };
        delete next[assignment.id];
        return next;
      });
      await loadNutrition();
    } catch (err) {
      toastError("Failed to update", err);
    }
  };

  const handleRemove = async (assignment) => {
    const confirmed = await confirmDelete(
      `Stop billing for ${assignment.client_name}? Their 1:1 Nutrition line won't appear in future finalizations.`,
      "Remove billing client?"
    );
    if (!confirmed) return;
    try {
      await removeNutritionAssignment(assignment.id);
      await loadNutrition();
    } catch (err) {
      toastError("Failed to remove", err);
    }
  };

  const segments = [
    { key: "requests", label: "Requests", count: myPending.length },
    ...(canNutrition ? [{ key: "nutrition", label: "1:1 Nutrition", count: assignments.length }] : []),
  ];

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
        <PayrollTabBar active="extra" />

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View className="mx-auto w-full" style={{ maxWidth: 560 }}>
            {segments.length > 1 ? <SegmentSwitch segments={segments} value={segment} onChange={setSegment} /> : null}

            {segment === "requests" ? (
              <>
                <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Anything outside the standard rates — reimbursements, bonuses, one-offs. Submit it here and it's added to
                  your pay once an admin approves it.
                </Text>

                <ExpandableCard title="New request" open={isOpen("new")} onToggle={() => toggle("new")}>
                  {closed ? (
                    <EmptyLine>This pay period is closed — new requests will apply to the next open period.</EmptyLine>
                  ) : (
                    <View ref={requestCardRef}>
                      {/* Which period this is paid in. Without it a request
                          filed after a period ended — the usual case for a
                          reimbursement you only remember at review time —
                          silently landed in the current period instead of the
                          one being closed. */}
                      {writablePeriods.length > 1 ? (
                        <>
                          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
                            Pay period
                          </Text>
                          <View className="mb-4 flex-row flex-wrap items-center" style={{ gap: 8 }}>
                            {writablePeriods.map(({ start_date: start }) => {
                              const active = start === periodStart;
                              return (
                                <Pressable
                                  key={start}
                                  onPress={() => (active ? null : selectPeriod(start))}
                                  className="rounded-full border px-3 py-1.5"
                                  style={{
                                    borderColor: active ? colors.primary : "#e7e5e4",
                                    backgroundColor: active ? "#fdf6f2" : "white",
                                  }}
                                >
                                  <Text
                                    className="text-xs"
                                    style={{
                                      fontFamily: active ? fonts.sansSemiBold : fonts.sansMedium,
                                      color: active ? colors.primaryOnWhite : "#78716c",
                                    }}
                                  >
                                    {formatDateMD(start)} – {formatDateMD(computePeriodEnd(start))}
                                    {start === currentPeriodStart ? " · current" : ""}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </>
                      ) : null}
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
                        Amount ($) <Text style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>optional</Text>
                      </Text>
                      <TextInput
                        value={amount}
                        onChangeText={setAmount}
                        onFocus={() => scrollFieldIntoView(requestCardRef.current)}
                        placeholder="Leave blank if an admin works it out"
                        keyboardType="decimal-pad"
                        inputAccessoryViewID={NUMERIC_DONE_ID}
                        className="mb-1.5 rounded-lg border border-stone-300 px-3 py-2.5"
                        style={{ fontFamily: fonts.sans }}
                      />
                      <Text className="mb-4 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                        Leave it blank for something like holiday pay, where an admin sets the figure when they approve it.
                      </Text>
                      <Pressable
                        onPress={handleSubmit}
                        disabled={submitting}
                        className="items-center rounded-lg px-5 py-3"
                        style={{ backgroundColor: colors.primary, opacity: submitting || !requestReady ? 0.5 : 1 }}
                      >
                        <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                          {submitting ? "Submitting…" : "Submit request"}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </ExpandableCard>

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
            ) : (
              <>
                <Text className="mb-5 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                  Set which day of the month each of your 1:1 Nutrition clients' billing recurs — when finalizing a pay
                  period, you'll confirm anyone whose day falls inside it before it's added to your payroll.
                </Text>

                {nutritionLoading && !nutritionLoaded ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    {unassignedClients.length > 0 ? (
                      <View className="mb-8">
                        <Text className="mb-3 text-sm text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                          Needs a billing day
                        </Text>
                        {unassignedClients.map((c) => {
                          const day = newDayByClient[c.id] ?? "";
                          const validDay = Number.isFinite(Number(day)) && Number(day) >= 1 && Number(day) <= 31;
                          return (
                            <View
                              key={c.id}
                              ref={(el) => {
                                if (el) newDayRowRefs.current.set(c.id, el);
                              }}
                              className="mb-2 flex-row items-center justify-between rounded-xl bg-white px-4 py-3"
                              style={{ borderWidth: 1, borderColor: "#ece7e1" }}
                            >
                              <Text className="flex-1 pr-3" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
                                {c.name}
                              </Text>
                              <TextInput
                                value={day}
                                onChangeText={(v) => setNewDayByClient((prev) => ({ ...prev, [c.id]: v }))}
                                onFocus={() => scrollFieldIntoView(newDayRowRefs.current.get(c.id))}
                                placeholder="Day"
                                keyboardType="decimal-pad"
                                inputAccessoryViewID={NUMERIC_DONE_ID}
                                className="mr-3 rounded-lg border border-stone-300 px-2.5 py-1.5"
                                style={{ fontFamily: fonts.sans, width: 56, textAlign: "center" }}
                              />
                              <Pressable
                                onPress={() => validDay && handleCheckClient(c)}
                                disabled={!validDay || addingClientId === c.id}
                                hitSlop={8}
                                style={{ opacity: !validDay || addingClientId === c.id ? 0.5 : 1 }}
                              >
                                <Ionicons
                                  name={addingClientId === c.id ? "hourglass-outline" : "checkbox-outline"}
                                  size={22}
                                  color={validDay ? colors.primary : "#d6d3d1"}
                                />
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}

                    <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
                      Your 1:1 Nutrition clients
                    </Text>
                    {assignments.length === 0 ? (
                      <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                        None added yet.
                      </Text>
                    ) : (
                      assignments.map((a) => (
                        <View
                          key={a.id}
                          ref={(el) => {
                            if (el) editDayRowRefs.current.set(a.id, el);
                          }}
                          className="mb-2 flex-row items-center justify-between rounded-xl border border-stone-200 p-4"
                        >
                          <View className="flex-1 pr-3">
                            <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{a.client_name}</Text>
                            {editingDay[a.id] !== undefined ? (
                              <View className="mt-1.5 flex-row items-center gap-2">
                                <TextInput
                                  value={editingDay[a.id]}
                                  onChangeText={(v) => setEditingDay((prev) => ({ ...prev, [a.id]: v }))}
                                  onFocus={() => scrollFieldIntoView(editDayRowRefs.current.get(a.id))}
                                  keyboardType="decimal-pad"
                                  inputAccessoryViewID={NUMERIC_DONE_ID}
                                  className="rounded-lg border border-stone-300 px-2 py-1.5"
                                  style={{ fontFamily: fonts.sans, width: 60 }}
                                />
                                <Pressable onPress={() => handleUpdateDay(a)}>
                                  <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 12 }}>Save</Text>
                                </Pressable>
                              </View>
                            ) : (
                              <Pressable onPress={() => setEditingDay((prev) => ({ ...prev, [a.id]: String(a.billing_day_of_month) }))}>
                                <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                                  Billing day {a.billing_day_of_month} · tap to edit
                                </Text>
                              </Pressable>
                            )}
                          </View>
                          <Pressable onPress={() => handleRemove(a)} hitSlop={8}>
                            <Ionicons name="trash-outline" size={18} color="#a8a29e" />
                          </Pressable>
                        </View>
                      ))
                    )}
                  </>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </CoachShell>
  );
}
