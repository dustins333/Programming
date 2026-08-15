import { useState, useCallback, useRef, useMemo } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import {
  listPayPeriodOptions,
  getCurrentPeriodStart,
  listStaff,
  closePayPeriod,
  isPeriodClosed,
  savePeriodClosingSnapshot,
  ensurePayPeriod,
} from "../../../../lib/payroll/periods";
import { listAllRates, saveRateSnapshotForPeriod, getRateMapsForPeriod } from "../../../../lib/payroll/rates";
import {
  listFinalizationsForPeriod,
  approveFinalization,
  unapproveFinalization,
  sendBackFinalization,
  reopenFinalization,
  reviewState,
  REVIEW_APPROVED,
  REVIEW_SUBMITTED,
  REVIEW_SENT_BACK,
  REVIEW_NOT_SUBMITTED,
} from "../../../../lib/payroll/finalizations";
import { listPendingRequestsForPeriod } from "../../../../lib/payroll/requests";
import { listEntriesForPeriodAllStaff } from "../../../../lib/payroll/entries";
import { computeTotals, formatMoney, formatQuantity } from "../../../../lib/payroll/calc";
import { buildPeriodCsv, downloadCsv } from "../../../../lib/payroll/csvExport";
import { formatDateMDY, formatDateRange } from "../../../../lib/formatDate";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { confirmClosePayPeriod } from "../../../../lib/confirmDialog";
import { fonts, colors } from "../../../../lib/theme";
import { CoachShell } from "../../../../components/CoachShell";
import { AdminPayrollTabBar } from "../../../../components/AdminPayrollTabBar";
import {
  StaffReviewRow,
  REVIEW_COLUMNS,
  COL_WIDTH,
  PAY_WIDTH,
  ACTION_WIDTH,
  STAFF_WIDTH,
  STAFF_CELL,
  CELL_GAP,
  COL_LABEL_STYLE,
} from "../../../../components/payroll/StaffReviewRow";

const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };

// Month-name range, matching the Log header, My Pay's band and the finalize
// sheet — this is a heading, not a grid cell.
function periodLabel(p) {
  return p ? formatDateRange(p.start_date, p.end_date) : "";
}

function HeaderButton({ label, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="rounded-lg border bg-white px-[18px] py-2.5"
      style={{ borderColor: "#d9d4cd", opacity: disabled ? 0.5 : 1 }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>{label}</Text>
    </Pressable>
  );
}

// The dark band above the table: which period, how far through review it
// is, when it closes, what's approved so far, and the one button that ends
// it. The button states its own blocker rather than just going grey — the
// old version disabled nothing and only told you what was wrong after you
// clicked.
function PeriodBand({ period, approvedCount, staffCount, approvedTotal, closed, closing, blockedReason, outstandingNote, onPrev, onNext, onClose }) {
  const fraction = staffCount > 0 ? approvedCount / staffCount : 0;
  return (
    <View className="mb-2.5 overflow-hidden rounded-2xl" style={{ backgroundColor: "#3b3531" }}>
      <View className="flex-row flex-wrap items-center gap-x-8 gap-y-4 px-6 py-5">
        <View>
          <Text className="text-xs uppercase" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.7, color: "#a99f96" }}>
            Pay period · {closed ? "Closed" : "Open"}
          </Text>
          <View className="mt-1 flex-row items-center gap-3">
            <Pressable onPress={onPrev} hitSlop={10}>
              <Ionicons name="chevron-back" size={17} color="#a99f96" />
            </Pressable>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 21, color: "#ffffff" }}>{periodLabel(period)}</Text>
            <Pressable onPress={onNext} hitSlop={10}>
              <Ionicons name="chevron-forward" size={17} color="#a99f96" />
            </Pressable>
          </View>
        </View>

        <View className="flex-1" style={{ minWidth: 240 }}>
          <View className="mb-2 flex-row items-baseline justify-between">
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#ffffff" }}>
              {approvedCount} of {staffCount} staff approved
            </Text>
            {period ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a99f96" }}>Closes {formatDateMDY(period.end_date)}</Text>
            ) : null}
          </View>
          <View className="overflow-hidden rounded-full" style={{ height: 7, backgroundColor: "#544c46" }}>
            <View style={{ width: `${Math.round(fraction * 100)}%`, height: "100%", backgroundColor: "#8fb473", borderRadius: 999 }} />
          </View>
        </View>

        <View>
          <Text className="text-xs uppercase" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.7, color: "#a99f96" }}>
            Approved so far
          </Text>
          <Text className="mt-1" style={{ fontFamily: fonts.sansBold, fontSize: 21, color: "#ffffff" }}>
            {formatMoney(approvedTotal)}
          </Text>
        </View>

        {closed ? (
          <View className="items-center rounded-[10px] px-5 py-3" style={{ backgroundColor: "#544c46" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#c9beb4" }}>Closed</Text>
          </View>
        ) : (
          // The button carries its own blocker rather than just going grey.
          // Un-submitted coaches are a warning, not a blocker (payroll goes
          // out on payday regardless), so `outstandingNote` reads as
          // information under a live button; only an undecided custom
          // request actually disables it.
          <Pressable
            onPress={onClose}
            disabled={closing || Boolean(blockedReason)}
            className="items-center rounded-[10px] px-5 py-3"
            style={{ backgroundColor: blockedReason ? "#544c46" : "#8fb473", opacity: closing ? 0.6 : 1 }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: blockedReason ? "#c9beb4" : "#26301d" }}>
              {closing ? "Closing…" : "Close period"}
            </Text>
            {!closing && (blockedReason || outstandingNote) ? (
              <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 10.5, color: blockedReason ? "#a99f96" : "#3f5231", marginTop: 3 }}>
                {blockedReason ? "requests undecided" : outstandingNote}
              </Text>
            ) : null}
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function AdminPayrollPeriods() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";

  const [periodOptions, setPeriodOptions] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [staff, setStaff] = useState([]);
  const [finalizations, setFinalizations] = useState([]);
  const [entries, setEntries] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  // Live rates, kept only to freeze into the snapshot at close time. What
  // the table actually displays is rateMaps below, resolved per period.
  const [rates, setRates] = useState({ coreRates: [], otherRates: [], spcTiers: [] });
  const [rateMaps, setRateMaps] = useState({ core: {}, other: {}, spc: {} });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [closing, setClosing] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [busyUserId, setBusyUserId] = useState(null);

  // Read inside the focus effect rather than closed over — a mount-only
  // closure would silently snap a hand-picked period back to the current
  // one on every refocus (the same stale-closure bug this screen already
  // had once; see CLAUDE.md's payroll section).
  const selectedPeriodRef = useRef(null);
  const applySelectedPeriod = useCallback((value) => {
    selectedPeriodRef.current = value;
    setSelectedPeriod(value);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [options, current, staffRows, allRates] = await Promise.all([listPayPeriodOptions(), getCurrentPeriodStart(), listStaff(), listAllRates()]);
      setPeriodOptions(options);
      setStaff(staffRows);
      setRates(allRates);
      const target = selectedPeriodRef.current || current;
      applySelectedPeriod(target);
      const targetRow = options.find((p) => p.start_date === target) ?? null;
      const [finals, entryRows, pending, maps] = await Promise.all([
        listFinalizationsForPeriod(target),
        listEntriesForPeriodAllStaff(target),
        listPendingRequestsForPeriod(target),
        // Per-period, not the live tables: paging back to an already-closed
        // period must show it at the rates frozen at close time, matching
        // the Closed-periods tab and the CSV it was paid from.
        getRateMapsForPeriod(targetRow),
      ]);
      setFinalizations(finals);
      setEntries(entryRows);
      setPendingRequests(pending);
      setRateMaps(maps);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [applySelectedPeriod]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );


  const currentPeriod = periodOptions.find((p) => p.start_date === selectedPeriod);
  const closed = isPeriodClosed(currentPeriod);
  const finalizationByUser = useMemo(() => new Map(finalizations.map((f) => [f.user_id, f])), [finalizations]);

  // One pass building everything the table and the band both need, so the
  // footer's column sums can't disagree with the rows above them.
  // Grouped by user_id **falling back to staff_email** — the same key
  // computeTotalsByStaff has always used. Keying on user_id alone silently
  // dropped every imported Glide row whose user_id is null (they only
  // carry an email), so those entries vanished from the per-staff rows
  // while still landing in the footer total: rows summing to $310 under a
  // footer reading $919. Real data, found on the Aug 6 period.
  const rows = useMemo(() => {
    const byKey = new Map();
    for (const entry of entries) {
      const key = entry.user_id ?? entry.staff_email;
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(entry);
    }

    const out = staff.map((s) => {
      const staffEntries = [...(byKey.get(s.id) ?? []), ...(byKey.get(s.email) ?? [])];
      byKey.delete(s.id);
      byKey.delete(s.email);
      const finalization = finalizationByUser.get(s.id);
      return {
        staff: s,
        entries: staffEntries,
        totals: computeTotals(staffEntries, rateMaps),
        finalization,
        state: reviewState(finalization),
        unlinked: false,
      };
    });

    // Whatever's left has entries but no current staff account — a former
    // coach, or an imported row whose email never got linked. It still
    // costs real money, so it gets a row rather than being quietly folded
    // into a total nobody can account for.
    for (const [key, staffEntries] of byKey) {
      out.push({
        staff: { id: `unlinked:${key}`, name: staffEntries[0].staff_name || key, email: key, role: "coach" },
        entries: staffEntries,
        totals: computeTotals(staffEntries, rateMaps),
        finalization: null,
        state: REVIEW_NOT_SUBMITTED,
        unlinked: true,
      });
    }
    return out;
  }, [staff, entries, rateMaps, finalizationByUser]);

  // Summed from the rows themselves, not recomputed over `entries` — that
  // is what guarantees the footer can never disagree with the column above
  // it again, whatever grouping edge case turns up next.
  const grandTotals = useMemo(() => computeTotals(rows.flatMap((r) => r.entries), rateMaps), [rows, rateMaps]);
  const approvedRows = rows.filter((r) => r.state === REVIEW_APPROVED);
  const approvedTotal = approvedRows.reduce((sum, r) => sum + r.totals.total, 0);
  const outstanding = rows.filter((r) => r.state !== REVIEW_APPROVED);

  // Only one thing genuinely blocks a close: an undecided custom request,
  // because approving one *creates a pay entry* and closing first would
  // lock that money out of the period it belongs to.
  //
  // Coaches who haven't submitted are NOT a blocker. Payroll has to go out
  // on payday whether or not everyone did their part, so this is a warning
  // the admin accepts, not a wall — an earlier version made it a hard gate
  // and that was wrong.
  const blockedReason =
    pendingRequests.length > 0
      ? `${pendingRequests.length} custom request${pendingRequests.length === 1 ? "" : "s"} still undecided (${pendingRequests
          .map((r) => r.staff_name)
          .join(", ")}). Approve or deny them on Requests first.`
      : null;

  const notSubmitted = outstanding.filter((r) => r.state === REVIEW_NOT_SUBMITTED).map((r) => r.staff.name);
  const sentBack = outstanding.filter((r) => r.state === REVIEW_SENT_BACK).map((r) => r.staff.name);
  const awaitingYou = outstanding.filter((r) => r.state === REVIEW_SUBMITTED).map((r) => r.staff.name);
  const warningParts = [];
  if (notSubmitted.length) warningParts.push(`${notSubmitted.join(", ")} ${notSubmitted.length === 1 ? "hasn't" : "haven't"} submitted`);
  if (sentBack.length) warningParts.push(`${sentBack.join(", ")} still ${sentBack.length === 1 ? "has" : "have"} a send-back open`);
  if (awaitingYou.length) warningParts.push(`${awaitingYou.join(", ")} ${awaitingYou.length === 1 ? "is" : "are"} waiting on your approval`);
  const closeWarning = warningParts.length ? `${warningParts.join(". ")}. Their entries will be included as they stand.` : null;

  if (profile && !isAdmin) {
    return <Redirect href="/(coach)/payroll" />;
  }

  const stepPeriod = (delta) => {
    const idx = periodOptions.findIndex((p) => p.start_date === selectedPeriod);
    if (idx < 0) return;
    // listPayPeriodOptions is newest-first, so "previous period" is a step
    // forward through the array.
    const next = periodOptions[idx - delta];
    if (!next) return;
    applySelectedPeriod(next.start_date);
    setExpandedUserId(null);
    setLoading(true);
    load();
  };

  const withBusy = async (userId, fn, successMessage) => {
    setBusyUserId(userId);
    try {
      await fn();
      if (successMessage) toastSuccess(successMessage);
      const [finals, entryRows] = await Promise.all([listFinalizationsForPeriod(selectedPeriod), listEntriesForPeriodAllStaff(selectedPeriod)]);
      setFinalizations(finals);
      setEntries(entryRows);
    } catch (err) {
      toastError("Failed", err);
    } finally {
      setBusyUserId(null);
    }
  };

  const handleExport = () => {
    const ok = downloadCsv(`payroll-${selectedPeriod}.csv`, buildPeriodCsv(entries, rateMaps));
    if (!ok) toastError("CSV export is web-only — open this page in a browser");
  };

  const handleClose = async () => {
    if (blockedReason) return;
    // The warning names who it's closing over, so accepting it is informed
    // rather than a shrug.
    const ok = await confirmClosePayPeriod(periodLabel(currentPeriod), closeWarning);
    if (!ok) return;

    setClosing(true);
    try {
      // Everything that must survive the close is written BEFORE it.
      // closePayPeriod is irreversible — RLS blocks writes to the period
      // afterwards, for admin too — so a snapshot written after it could
      // fail and leave a permanently-closed period with no frozen rates and
      // $0.00 owner/staff pay, while the toast said the close had failed.
      // ensurePayPeriod first — closePayPeriod used to be what created the
      // row these two writes reference.
      await ensurePayPeriod(selectedPeriod);
      await saveRateSnapshotForPeriod(selectedPeriod, rates);

      const staffById = new Map(staff.map((s) => [s.id, s]));
      let ownerPay = 0;
      let staffPay = 0;
      for (const row of rows) {
        if (staffById.get(row.staff.id)?.role === "admin") ownerPay += row.totals.total;
        else staffPay += row.totals.total;
      }
      await savePeriodClosingSnapshot(selectedPeriod, { ownerPay, staffPay });

      await closePayPeriod(selectedPeriod, profile.id);

      const downloaded = downloadCsv(`payroll-${selectedPeriod}.csv`, buildPeriodCsv(entries, rateMaps));
      toastSuccess(downloaded ? "Pay period closed — CSV downloaded" : "Pay period closed — open this page on web to export the CSV");
      await load();
    } catch (err) {
      toastError("Failed to close", err);
    } finally {
      setClosing(false);
    }
  };

  // The narrowest the table can get before it has to scroll: every cell at
  // its minimum, plus the gaps, plus the card's 20px padding AND its 1px
  // border on each side. The border is easy to forget and not harmless —
  // leave it out and the row's content needs two more pixels than its box
  // has, so flex quietly shrinks a cell and the rows stop lining up with
  // the header and footer. Measured, not guessed.
  const cellCount = 1 + REVIEW_COLUMNS.length + 2;
  const minTableWidth =
    STAFF_WIDTH + REVIEW_COLUMNS.length * COL_WIDTH + PAY_WIDTH + ACTION_WIDTH + (cellCount - 1) * CELL_GAP + 40 + 2;

  return (
    <CoachShell>
      <ScrollView style={{ backgroundColor: colors.canvas }} className="flex-1 px-8 pt-8" contentContainerStyle={{ paddingBottom: 48 }}>
        {Platform.OS !== "web" ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/payroll"))} className="mb-4 self-start">
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}

        <View className="mb-1 flex-row items-start justify-between">
          <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            Payroll — Admin
          </Text>
          <View className="flex-row gap-2.5">
            <HeaderButton label="Export CSV" onPress={handleExport} disabled={entries.length === 0} />
            <HeaderButton label="Rates" onPress={() => router.push("/(coach)/payroll/admin/settings")} />
          </View>
        </View>
        <AdminPayrollTabBar active="periods" />

        {loadError ? (
          <>
            <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
              Couldn't load this period: {loadError}
            </Text>
            <Pressable onPress={load} className="mt-3 self-start">
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
            </Pressable>
          </>
        ) : loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <PeriodBand
              period={currentPeriod}
              approvedCount={approvedRows.length}
              staffCount={rows.length}
              approvedTotal={approvedTotal}
              closed={closed}
              closing={closing}
              blockedReason={closed ? null : blockedReason}
              outstandingNote={outstanding.length ? `${outstanding.length} not approved` : null}
              onPrev={() => stepPeriod(-1)}
              onNext={() => stepPeriod(1)}
              onClose={handleClose}
            />

            {!closed && blockedReason ? (
              <View className="mb-4 flex-row items-start gap-2">
                <View className="rounded-full" style={{ width: 6, height: 6, backgroundColor: "#b23a22", marginTop: 6 }} />
                <Text className="flex-1 text-stone-600" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
                  {blockedReason}
                </Text>
              </View>
            ) : (
              <View className="mb-4" />
            )}
            {/* Deliberately no running "close unlocks when…" line here.
                Un-submitted coaches don't block a close, so narrating them
                on every page load was noise; the confirm dialog names them
                at the one moment it matters. */}

            {/* flexGrow on the content container lets the table fill a wide
                window; minWidth is what makes it scroll instead of squashing
                on a narrow one. All the extra width lands in the staff
                column (STAFF_CELL), so rows get wider rather than taller. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={Platform.OS === "web"}
              contentContainerStyle={{ flexGrow: 1, minWidth: minTableWidth }}
            >
              <View className="rounded-2xl border bg-white" style={[{ borderColor: "#ece7e1", overflow: "hidden", flex: 1 }, CARD_SHADOW]}>
                <View
                  className="flex-row items-center px-5 py-3"
                  style={{ gap: CELL_GAP, backgroundColor: "#faf8f6", borderBottomWidth: 1, borderBottomColor: "#f4f0ec" }}
                >
                  <Text className="uppercase text-stone-400" style={[COL_LABEL_STYLE, STAFF_CELL]}>
                    Staff
                  </Text>
                  {REVIEW_COLUMNS.map((col) => (
                    <View key={col.key} style={{ width: COL_WIDTH, alignItems: "flex-end" }}>
                      <Text className="uppercase text-stone-400" style={COL_LABEL_STYLE} numberOfLines={1}>
                        {col.label}
                      </Text>
                    </View>
                  ))}
                  <View style={{ width: PAY_WIDTH, alignItems: "flex-end" }}>
                    <Text className="uppercase text-stone-400" style={COL_LABEL_STYLE}>
                      Pay
                    </Text>
                  </View>
                  <View style={{ width: ACTION_WIDTH, alignItems: "flex-end" }}>
                    <Text className="uppercase text-stone-400" style={COL_LABEL_STYLE}>
                      Review
                    </Text>
                  </View>
                </View>

                {rows.length === 0 ? (
                  <Text className="p-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
                    No staff accounts yet.
                  </Text>
                ) : (
                  rows.map((row, idx) => (
                    <View key={row.staff.id} style={idx < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#f4f0ec" } : undefined}>
                      <StaffReviewRow
                        staff={row.staff}
                        totals={row.totals}
                        entries={row.entries}
                        rateMaps={rateMaps}
                        state={row.state}
                        finalization={row.finalization}
                        expanded={expandedUserId === row.staff.id}
                        busy={busyUserId === row.staff.id}
                        periodClosed={closed}
                        onToggleExpand={() => setExpandedUserId((id) => (id === row.staff.id ? null : row.staff.id))}
                        onApprove={() => withBusy(row.staff.id, () => approveFinalization(row.finalization.id, profile.id), `Approved ${row.staff.name}.`)}
                        onUnapprove={() => withBusy(row.staff.id, () => unapproveFinalization(row.finalization.id))}
                        onSendBack={(note) =>
                          withBusy(row.staff.id, () => sendBackFinalization(row.finalization.id, profile.id, note), `Sent back to ${row.staff.name}.`)
                        }
                        onReopen={() =>
                          withBusy(row.staff.id, () => reopenFinalization(row.finalization.id, profile.id), `Reopened ${row.staff.name}'s period.`)
                        }
                      />
                    </View>
                  ))
                )}

                <View
                  className="flex-row items-center px-5 py-3.5"
                  style={{ gap: CELL_GAP, backgroundColor: "#faf8f6", borderTopWidth: 1, borderTopColor: "#ece7e1" }}
                >
                  <Text className="text-stone-600" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, ...STAFF_CELL }}>
                    {rows.length} staff · {outstanding.length} outstanding
                  </Text>
                  {REVIEW_COLUMNS.map((col) => {
                    const total = col.value(grandTotals);
                    return (
                      <View key={col.key} style={{ width: COL_WIDTH, alignItems: "flex-end" }}>
                        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: total ? "#57534e" : "#c9c4bd" }}>
                          {!total ? "—" : col.money ? formatMoney(total) : formatQuantity(total)}
                        </Text>
                      </View>
                    );
                  })}
                  <View style={{ width: PAY_WIDTH, alignItems: "flex-end" }}>
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: colors.primaryOnWhite }}>{formatMoney(grandTotals.total)}</Text>
                  </View>
                  <View style={{ width: ACTION_WIDTH }} />
                </View>
              </View>
            </ScrollView>
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
