import { useState, useCallback } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import {
  getCurrentPeriodStart,
  getPeriodAnchor,
  computePeriodStart,
  computePeriodEnd,
  listPayPeriods,
  isPeriodClosed,
} from "../../../../lib/payroll/periods";
import { listAllRequests, approveRequest, denyRequest } from "../../../../lib/payroll/requests";
import { formatDateMDY, formatDateMD, formatDateRange } from "../../../../lib/formatDate";
import { todayInBoise } from "../../../../lib/boiseDate";
import { PayDatePicker } from "../../../../components/payroll/PayDatePicker";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { fonts, colors } from "../../../../lib/theme";
import { CoachShell } from "../../../../components/CoachShell";
import { AdminPayrollTabBar } from "../../../../components/AdminPayrollTabBar";
import { NUMERIC_DONE_ID } from "../../../../components/NumericInputAccessory";

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

function money(v) {
  return `$${Number(v || 0).toFixed(2)}`;
}

// A request awaiting a decision. Dark, because these are the only rows on
// the screen that need doing — everything below is a record.
//
// The amount is an editable field, not a label: a coach can only ever ask
// for a number, and for some request types (holiday pay, say) the real
// figure is one only an admin can work out. It seeds from what was asked
// and the approve button tracks whatever is typed, so the original "what
// you press is what gets paid" contract holds — approving writes the
// linked pay entry at exactly this number. What was asked stays on screen
// underneath whenever the two differ, and `amount_requested` is never
// overwritten, so the history row can always show both.
function ApprovalCard({ r, busy, onApprove, onDeny, periodLabelFor, today, dateStatus, periodStartFor, currentPeriodStart }) {
  // A coach can file without naming a figure (holiday pay, say), which
  // stores 0. Seed the field empty in that case rather than with a "0" to
  // edit around, and say so \u2014 an empty box on its own looks like a bug,
  // where "no amount asked" reads as the coach handing the decision over.
  const asked = Number(r.amount_requested);
  const noAmountAsked = asked === 0;
  // String(Number(...)) rather than toFixed(2): "125" is far easier to edit
  // than "125.00", and the button below always shows the formatted value.
  const [amountText, setAmountText] = useState(noAmountAsked ? "" : String(asked));
  // Behind a link rather than always on screen: most approvals (a receipt,
  // a bonus) need no explanation, and a permanent empty box on every card
  // reads as something left undone. Single-line on purpose \u2014 an
  // auto-growing multiline TextInput feeds back on itself on web, which
  // this codebase has now been bitten by three separate times.
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  // The day this gets paid on, and therefore which fortnight it lands in.
  // Seeded from what the coach asked for; rows filed before requests
  // carried a day fall back to today, which is what approving used to do
  // unconditionally — and is exactly how a $2,000 owner-pay request meant
  // for another cycle ended up in the period today sits in (2026-09-17).
  const [payDate, setPayDate] = useState(() => r.entry_date || today);
  const payPeriodStart = periodStartFor(payDate);
  const dateBlocked = dateStatus(payDate);
  const movesPeriod = payPeriodStart && r.pay_period_start && payPeriodStart !== r.pay_period_start;
  const trimmedNote = note.trim() || null;
  const parsed = Number(amountText);
  const valid = amountText.trim() !== "" && Number.isFinite(parsed) && parsed > 0 && !dateBlocked;
  const adjusted = valid && !noAmountAsked && parsed !== asked;

  return (
    <View style={{ backgroundColor: "#3b3531", borderRadius: 16, padding: 18, minWidth: 260, flexGrow: 1, flexBasis: 260 }}>
      <View className="mb-3.5 flex-row items-start justify-between" style={{ gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "white" }}>
            {r.staff_name}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#c9beb4", marginTop: 3 }}>{r.description}</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#8d8279", marginTop: 5 }}>
            Requested {formatDateMDY(r.created_at?.slice(0, 10))}
            {periodLabelFor ? ` \u00b7 ${periodLabelFor}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <View
            className="flex-row items-center"
            style={{
              backgroundColor: "#2f2a27",
              borderWidth: 1,
              borderColor: adjusted || (noAmountAsked && valid) ? "#8fb473" : noAmountAsked ? "#a98a6a" : "#6b625b",
              borderRadius: 9,
              paddingLeft: 9,
              paddingRight: 4,
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#c9beb4" }}>$</Text>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              inputAccessoryViewID={NUMERIC_DONE_ID}
              selectTextOnFocus
              placeholder="0"
              placeholderTextColor="#6b625b"
              style={{
                fontFamily: fonts.sansBold,
                fontSize: 17,
                color: "white",
                width: 84,
                textAlign: "right",
                paddingVertical: 7,
                paddingHorizontal: 5,
              }}
            />
          </View>
          {adjusted || noAmountAsked ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: noAmountAsked ? "#c9a274" : "#8d8279", marginTop: 5 }}>
              {noAmountAsked ? "no amount asked" : `asked ${money(asked)}`}
            </Text>
          ) : null}
        </View>
      </View>
      <View className="mb-3">
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11, color: "#a49890", marginBottom: 5 }}>Paid on</Text>
        <PayDatePicker
          value={payDate}
          today={today}
          onChange={setPayDate}
          dateStatus={dateStatus}
          onBlocked={(reason) => toastError(`Can't pay on that day \u2014 ${reason}`)}
          variant="dark"
          /* The period is only named when the day would move this out of
             the one it was filed against, or when it is blocked — the
             common case is a request paid where it was asked for, and
             restating that on every card is noise. */
          periodLabel={
            dateBlocked
              ? `Can't pay here \u2014 ${dateBlocked}`
              : movesPeriod
                ? `Moves to the ${formatDateMD(payPeriodStart)} \u2013 ${formatDateMD(computePeriodEnd(payPeriodStart))} period${
                    payPeriodStart === currentPeriodStart ? " \u00b7 current" : ""
                  }`
                : null
          }
          periodWarning={Boolean(dateBlocked || movesPeriod)}
        />
      </View>
      {noteOpen ? (
        <View className="mb-3">
          <TextInput
            value={note}
            onChangeText={setNote}
            autoFocus
            placeholder="e.g. avg of 9/1, 9/2, 9/4, 9/5"
            placeholderTextColor="#6b625b"
            style={{
              fontFamily: fonts.sans,
              fontSize: 12.5,
              color: "white",
              backgroundColor: "#2f2a27",
              borderWidth: 1,
              borderColor: "#6b625b",
              borderRadius: 9,
              paddingVertical: 8,
              paddingHorizontal: 10,
            }}
          />
          {/* Said plainly because it is true and easy to forget: this lands
              on the coach's own copy of the request, not just the record. */}
          <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#8d8279", marginTop: 5 }}>
            Saved with the decision and shown to {r.staff_name?.split(" ")[0] || "them"}.
          </Text>
        </View>
      ) : (
        <Pressable onPress={() => setNoteOpen(true)} hitSlop={6} className="mb-3 self-start">
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: "#a49890" }}>+ Add a note</Text>
        </Pressable>
      )}
      <View className="flex-row" style={{ gap: 8 }}>
        {/* Dimmed rather than hard-disabled while the amount is unusable, so
            pressing it explains what is wrong instead of doing nothing. */}
        <Pressable
          onPress={() =>
            valid
              ? onApprove(r, parsed, trimmedNote, payDate)
              : toastError(dateBlocked ? `Pick another day \u2014 ${dateBlocked}` : "Enter an amount above $0 before approving")
          }
          disabled={busy}
          className="items-center"
          style={{ flex: 1, backgroundColor: "#8fb473", borderRadius: 9, paddingVertical: 10, opacity: busy || !valid ? 0.5 : 1 }}
        >
          <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#26301d" }}>
            {busy ? "Working\u2026" : valid ? `Approve ${money(parsed)}` : "Approve"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onDeny(r, trimmedNote)}
          disabled={busy}
          style={{ borderWidth: 1, borderColor: "#6b625b", borderRadius: 9, paddingVertical: 10, paddingHorizontal: 18, opacity: busy ? 0.6 : 1 }}
        >
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: "#c9beb4" }}>Deny</Text>
        </Pressable>
      </View>
    </View>
  );
}

const HISTORY_COLS = { staff: 170, amount: 96, status: 92, decided: 104 };

function HistoryHeader() {
  const label = { fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.9, color: "#a8a29e" };
  return (
    <View className="flex-row items-center px-5 py-3" style={{ gap: 16, backgroundColor: "#faf8f6" }}>
      <Text style={[label, { width: HISTORY_COLS.staff }]}>STAFF</Text>
      <Text style={[label, { flex: 1 }]}>REQUEST</Text>
      <Text style={[label, { width: HISTORY_COLS.amount, textAlign: "right" }]}>AMOUNT</Text>
      <Text style={[label, { width: HISTORY_COLS.status, textAlign: "right" }]}>STATUS</Text>
      <Text style={[label, { width: HISTORY_COLS.decided, textAlign: "right" }]}>DECIDED</Text>
    </View>
  );
}

function HistoryRow({ r }) {
  // What was actually paid, which is not always what was asked for — an
  // admin can approve a different amount than requested.
  const settled = r.status === "approved" ? r.approved_amount ?? r.amount_requested : r.amount_requested;
  return (
    <View className="flex-row items-center px-5 py-3" style={{ gap: 16, borderTopWidth: 1, borderTopColor: "#f4f0ec" }}>
      <Text numberOfLines={1} style={{ width: HISTORY_COLS.staff, fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#2a211c" }}>
        {r.staff_name}
      </Text>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#57534e" }}>
          {r.description}
        </Text>
        {/* Whatever was typed at decision time \u2014 usually how an adjusted
            amount was arrived at, which is the whole reason to keep it. */}
        {/* Which day the money carries — the one thing this row could not
            say before, and the reason an approval could only ever land in
            the period it was decided in. */}
        {r.entry_date ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 3 }}>
            {r.status === "approved" ? "Paid" : "For"} {formatDateMDY(r.entry_date)}
          </Text>
        ) : null}
        {r.admin_notes ? (
          <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 3 }}>
            {r.admin_notes}
          </Text>
        ) : null}
      </View>
      <Text style={{ width: HISTORY_COLS.amount, textAlign: "right", fontFamily: fonts.sansBold, fontSize: 13, color: "#2a211c" }}>
        {money(settled)}
      </Text>
      <View style={{ width: HISTORY_COLS.status, alignItems: "flex-end" }}>
        <StatusPill status={r.status} />
      </View>
      <Text style={{ width: HISTORY_COLS.decided, textAlign: "right", fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e" }}>
        {r.decided_at ? formatDateMDY(r.decided_at.slice(0, 10)) : "—"}
      </Text>
    </View>
  );
}

export default function AdminPayrollRequests() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";

  const [currentPeriodStart, setCurrentPeriodStart] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [allPeriods, setAllPeriods] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [decidingId, setDecidingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [start, anchorDate, periods, requests] = await Promise.all([
        getCurrentPeriodStart(),
        getPeriodAnchor(),
        listPayPeriods(),
        listAllRequests(),
      ]);
      setCurrentPeriodStart(start);
      setAnchor(anchorDate);
      setAllPeriods(periods);
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

  // A closed period is the only hard stop on where money can be paid — RLS
  // blocks writes to one for everyone, admin included — so it is the only
  // thing the day picker refuses. Everything else, past or future, is fair
  // game: parking owner pay in an upcoming cycle is the case this exists for.
  const closedStarts = new Set(allPeriods.filter(isPeriodClosed).map((p) => p.start_date));
  const periodStartFor = (date) => (anchor ? computePeriodStart(date, anchor) : null);
  const dateStatus = (date) => {
    const start = periodStartFor(date);
    return start && closedStarts.has(start) ? "that pay period is closed" : null;
  };

  // Split by decision, not by period. Grouping by period buried a pending
  // request from a *previous* fortnight under "History", which is the one
  // request that most needs deciding — an undecided request is also the
  // only thing that hard-blocks closing the period it belongs to.
  const pending = allRequests.filter((r) => r.status === "pending");
  const decided = allRequests.filter((r) => r.status !== "pending");
  const pendingTotal = pending.reduce((sum, r) => sum + Number(r.amount_requested || 0), 0);

  const handleApprove = async (request, approvedAmount, adminNotes, payDate) => {
    setDecidingId(request.id);
    try {
      await approveRequest(request, approvedAmount, profile.id, adminNotes, payDate);
      toastSuccess(`Approved \u2014 $${Number(approvedAmount).toFixed(2)} paid on ${formatDateMDY(payDate)}`);
      await load();
    } catch (err) {
      // custom_requests_dedup_idx is (staff_email, pay_period_start,
      // description, amount_requested), so moving a request into a period
      // that already holds an identical one collides. Say what to do about
      // it rather than surfacing a raw 23505.
      if (err?.code === "23505") {
        toastError("There's already an identical request in that pay period \u2014 pick a different day, or edit the amount");
      } else {
        toastError("Failed to approve", err);
      }
    } finally {
      setDecidingId(null);
    }
  };

  const handleDeny = async (request, adminNotes) => {
    setDecidingId(request.id);
    try {
      await denyRequest(request.id, profile.id, adminNotes);
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
            <View className="mb-3.5 flex-row flex-wrap items-center justify-between" style={{ gap: 10 }}>
              <View className="flex-row items-center" style={{ gap: 10 }}>
                <Text className="text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
                  Waiting on you
                </Text>
                {pending.length ? (
                  <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: "#f4ede3" }}>
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: "#8a5a2e" }}>{pending.length}</Text>
                  </View>
                ) : null}
              </View>
              {/* Hidden when it would read "$0.00 requested across 3" \u2014 a
                  set of blank-amount requests has no meaningful total, and
                  a zero there looks like a bug rather than a fact. */}
              {pending.length > 1 && pendingTotal > 0 ? (
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#78716c" }}>
                  {/* "requested", not "if you approve all" \u2014 each card's
                      amount is editable, so this sum can only honestly
                      describe what was asked for. */}
                  {money(pendingTotal)} requested across {pending.length}
                </Text>
              ) : null}
            </View>

            {pending.length === 0 ? (
              <View className="mb-7 rounded-2xl border p-5" style={{ borderColor: "#ece7e1", backgroundColor: "white" }}>
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: "#78716c" }}>
                  Nothing waiting. Requests land here the moment a coach submits one.
                </Text>
              </View>
            ) : (
              <View className="mb-7 flex-row flex-wrap" style={{ gap: 14 }}>
                {pending.map((r) => (
                  <ApprovalCard
                    key={r.id}
                    r={r}
                    busy={decidingId === r.id}
                    onApprove={handleApprove}
                    onDeny={handleDeny}
                    today={todayInBoise()}
                    dateStatus={dateStatus}
                    periodStartFor={periodStartFor}
                    currentPeriodStart={currentPeriodStart}
                    // Only named when it isn't the period you're in, so the
                    // common case stays quiet and a straggler stands out.
                    periodLabelFor={
                      r.pay_period_start !== currentPeriodStart && r.pay_period_start
                        ? formatDateRange(r.pay_period_start, computePeriodEnd(r.pay_period_start))
                        : null
                    }
                  />
                ))}
              </View>
            )}

            <Text className="mb-3 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              Decided
            </Text>
            {decided.length === 0 ? (
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                No decisions yet.
              </Text>
            ) : (
              <View
                className="overflow-hidden rounded-2xl border bg-white"
                style={[{ borderColor: "#ece7e1" }, { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.045, shadowRadius: 14 }]}
              >
                <HistoryHeader />
                {decided.map((r) => (
                  <HistoryRow key={r.id} r={r} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
