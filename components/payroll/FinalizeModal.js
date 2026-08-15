import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listOwnNutritionAssignments, assignmentsDueInPeriod, billingDateInPeriod } from "../../lib/payroll/nutritionAssignments";
import { getClient } from "../../lib/nutrition/clients";
import { createEntry } from "../../lib/payroll/entries";
import { finalizeOwnPeriod } from "../../lib/payroll/finalizations";
import { computeTotals, formatMoney } from "../../lib/payroll/calc";
import { toastError, toastSuccess } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";
import { PayrollBottomSheet, SheetSaveButton } from "./PayrollBottomSheet";
import { formatDateRange } from "../../lib/formatDate";

function formatHours(decimal) {
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// The other_rates row these billing entries are priced from. Kept as one
// constant so the rate lookup, the row that gets created, and the
// already-billed check below can never name it differently.
const NUTRITION_OTHER_TYPE = "1:1 Nutrition";

// pay_entries has no client_id column, so a billing row identifies its
// client only through this note. Building it in one place means the row we
// write and the row we look for are always the same string.
function billingNoteFor(assignment) {
  return `${NUTRITION_OTHER_TYPE} — ${assignment.client_name} (billing day ${assignment.billing_day_of_month})`;
}

// Off the "My Entries" screen, not its own route — review + (for a
// nutrition-flagged coach) a mandatory roster confirmation for every
// client whose billing day falls inside this period, before finalizing.
// Per explicit ask: the system detects the candidate list automatically so
// a coach can't miss one ("they can't say oh I must have missed it"), but
// still has to actively confirm each one — and gets a real warning if a
// listed client isn't actually active on nutrition anymore, since a
// paused/cancelled client shouldn't quietly still generate pay.
export function FinalizeModal({ visible, onClose, onFinalized, profile, periodStart, periodEnd, entries, rateMaps }) {
  const isAdmin = profile?.role === "admin";
  const isNutritionCoach = isAdmin || profile?.can_view_nutrition;

  const [loading, setLoading] = useState(true);
  const [dueAssignments, setDueAssignments] = useState([]);
  const [inactiveClientIds, setInactiveClientIds] = useState(new Set());
  const [confirmed, setConfirmed] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (!isNutritionCoach || !periodStart || !periodEnd) {
          if (!cancelled) setDueAssignments([]);
          return;
        }
        const assignments = await listOwnNutritionAssignments(profile.id);
        const due = assignmentsDueInPeriod(assignments, periodStart, periodEnd);

        const inactive = new Set();
        await Promise.all(
          due.map(async (a) => {
            try {
              const client = await getClient(a.client_id);
              if (!client || client.status !== "active") inactive.add(a.client_id);
            } catch {
              inactive.add(a.client_id);
            }
          })
        );

        if (!cancelled) {
          setDueAssignments(due);
          setInactiveClientIds(inactive);
          // Default-checked unless flagged inactive — forces a deliberate
          // decision on exactly the ones that need one.
          const initial = {};
          due.forEach((a) => {
            initial[a.id] = !inactive.has(a.client_id);
          });
          setConfirmed(initial);
        }
      } catch (err) {
        toastError("Failed to load nutrition roster", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, isNutritionCoach, periodStart, periodEnd, profile?.id]);

  const totals = computeTotals(entries, rateMaps);

  // Which of this period's entries are already 1:1 Nutrition billing rows.
  // Drives both the skip in handleFinalize and the headline total below, so
  // reopening the modal after a send-back shows the real remaining amount
  // instead of counting the existing rows twice.
  const alreadyBilledNotes = new Set(
    (entries || []).filter((e) => e.source === "nutrition_billing" && e.notes).map((e) => e.notes)
  );
  const pendingAssignments = dueAssignments.filter((a) => !alreadyBilledNotes.has(billingNoteFor(a)));
  const confirmedCount = pendingAssignments.filter((a) => confirmed[a.id]).length;
  // Priced from the rate table, never hardcoded — the entry this modal
  // creates is a plain "1:1 Nutrition" other-item, so an admin editing that
  // rate on Payroll → Settings must move this number too. A hardcoded $100
  // meant the figure promised here and the one on the coach's own pay stub
  // could silently disagree.
  const nutritionRate = rateMaps?.other?.[NUTRITION_OTHER_TYPE] ?? 0;
  const nutritionAddOn = confirmedCount * nutritionRate;

  // What the coach is signing off, restated as counts. Only lines with
  // something in them render — a period with no ops hours shouldn't make
  // someone read a zero.
  const summaryLines = [
    { label: "Group sessions", value: totals.groupCount },
    { label: "SPC sessions", value: totals.spcSessions },
    { label: "Programs written", value: totals.programsCount },
    { label: "Welcome sessions", value: totals.welcomeCount },
    { label: "Strategy sessions", value: totals.strategyCount },
    { label: "Admin hours", value: totals.adminHours ? formatHours(totals.adminHours) : 0 },
    { label: "Ops hours", value: totals.opsHours ? formatHours(totals.opsHours) : 0 },
    { label: "Other items", value: (entries || []).filter((e) => e.other_type).length },
    { label: "Approved extras", value: (entries || []).filter((e) => e.custom_amt).length },
  ].filter((l) => l.value);

  // No second native confirm on top of this sheet. The sheet IS the
  // confirm now — it names the period, restates every count, states the
  // attestation, and puts the amount on the button — so a generic "are you
  // sure?" popup over it only added a tap without adding information.
  const handleFinalize = async () => {
    setSubmitting(true);
    try {
      for (const assignment of dueAssignments) {
        if (!confirmed[assignment.id]) continue;
        // Skip anything already billed for this period. Finalizing is not a
        // once-ever action: an admin sending a period back writes reopened_at
        // (lib/payroll/finalizations.js), so the coach fixes one entry and
        // finalizes again — which without this check created a second $100
        // row for every confirmed client, every time.
        if (alreadyBilledNotes.has(billingNoteFor(assignment))) continue;
        const entryDate = billingDateInPeriod(periodStart, periodEnd, assignment.billing_day_of_month) || periodEnd;
        await createEntry(
          profile.id,
          periodStart,
          {
            entry_date: entryDate,
            other_type: "1:1 Nutrition",
            other_qty: 1,
            notes: `1:1 Nutrition — ${assignment.client_name} (billing day ${assignment.billing_day_of_month})`,
          },
          "nutrition_billing"
        );
      }
      await finalizeOwnPeriod(periodStart);
      toastSuccess("Payroll finalized");
      onClose();
      await onFinalized?.();
    } catch (err) {
      toastError("Failed to finalize", err);
    } finally {
      setSubmitting(false);
    }
  };

  const grandTotal = totals.total + nutritionAddOn;

  return (
    <PayrollBottomSheet visible={visible} onClose={onClose} title={`Finalize ${formatDateRange(periodStart, periodEnd) || "this period"}`}>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <>
          {/* Restates what's being signed rather than just asking "are you
              sure" — this is the only hard confirm in the whole flow,
              because it's the only step that snapshots rates and takes the
              period out of the coach's hands. */}
          <View style={{ backgroundColor: "#faf8f6", borderWidth: 1, borderColor: "#ece7e1", borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <View className="mb-2 flex-row items-start justify-between">
              <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 9.5, fontFamily: fonts.sansBold, letterSpacing: 1.1, color: "#a8a29e", flex: 1, paddingRight: 10 }}>
                YOU'RE SUBMITTING
              </Text>
              <Text style={{ fontSize: 24, fontFamily: fonts.sansBold, color: "#2a211c", lineHeight: 26 }}>{formatMoney(grandTotal)}</Text>
            </View>
            {summaryLines.map((line) => (
              <View key={line.label} className="flex-row items-center justify-between" style={{ paddingVertical: 3 }}>
                <Text numberOfLines={1} style={{ fontSize: 12.5, fontFamily: fonts.sans, color: "#78716c", flex: 1, paddingRight: 10 }}>
                  {line.label}
                </Text>
                <Text style={{ fontSize: 12.5, fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{line.value}</Text>
              </View>
            ))}
            {summaryLines.length === 0 ? (
              <Text style={{ fontSize: 12.5, fontFamily: fonts.sans, color: "#a8a29e" }}>Nothing logged this period.</Text>
            ) : null}
          </View>

          {isNutritionCoach && dueAssignments.length > 0 ? (
                <View className="mb-4">
                  <Text className="mb-1" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
                    Confirm your nutrition roster
                  </Text>
                  <Text className="mb-3 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                    These clients' billing day falls inside this pay period. Confirm each one is still on your roster.
                  </Text>
                  {dueAssignments.map((a) => {
                    const isInactive = inactiveClientIds.has(a.client_id);
                    // Billed on an earlier finalize of this same period (the
                    // period was sent back and is being finalized again).
                    // Shown, so the roster still reads as complete, but inert
                    // — re-confirming it must not bill a second time.
                    const isBilled = alreadyBilledNotes.has(billingNoteFor(a));
                    const isChecked = isBilled || Boolean(confirmed[a.id]);
                    return (
                      <Pressable
                        key={a.id}
                        onPress={isBilled ? undefined : () => setConfirmed((prev) => ({ ...prev, [a.id]: !prev[a.id] }))}
                        className="mb-2 flex-row items-center justify-between rounded-xl border p-3"
                        style={{
                          borderColor: isInactive ? "#f0c9b8" : "#e7e5e4",
                          backgroundColor: isInactive ? "#fdf6f2" : "white",
                          opacity: isBilled ? 0.55 : 1,
                        }}
                      >
                        <View className="flex-1 flex-row items-center gap-2.5">
                          <Ionicons name={isChecked ? "checkbox" : "square-outline"} size={20} color={isChecked ? colors.primary : "#a8a29e"} />
                          <View className="flex-1">
                            <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>{a.client_name}</Text>
                            <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                              Billing day {a.billing_day_of_month}
                              {isBilled ? " · already billed this period" : isInactive ? " · not currently active on Nutrition" : ""}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontFamily: fonts.sansMedium, color: "#78716c" }}>{formatMoney(nutritionRate)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

          {/* The attestation, verbatim — it used to live in a native confirm
              popup layered on top of this modal, which meant the thing you
              were agreeing to appeared only after you'd already decided. */}
          <View style={{ backgroundColor: "#fdf6f2", borderWidth: 1, borderColor: "#f0ddd2", borderRadius: 14, padding: 13, marginBottom: 6 }}>
            <Text style={{ fontSize: 11.5, lineHeight: 17, fontFamily: fonts.sans, color: "#8a5140" }}>
              I've reviewed my payroll information and confirm that it's accurate to the best of my knowledge. By clicking
              Submit Payroll, I understand that my payroll will be officially submitted for processing and changes may not
              be possible after submission.
            </Text>
          </View>
          <Text style={{ fontSize: 10.5, lineHeight: 15, fontFamily: fonts.sans, color: "#b5aea7", marginBottom: 12 }}>
            Once you finalize, an admin has to send the period back to you before you can change anything in it.
          </Text>

          <SheetSaveButton
            onPress={handleFinalize}
            disabled={submitting}
            label={submitting ? "Finalizing…" : `Finalize ${formatMoney(grandTotal)}`}
          />
          <Pressable onPress={onClose} disabled={submitting} className="mt-1 items-center py-3">
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: "#a8a29e" }}>Not yet</Text>
          </Pressable>
        </>
      )}
    </PayrollBottomSheet>
  );
}
