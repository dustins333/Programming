import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listOwnNutritionAssignments, assignmentsDueInPeriod, billingDateInPeriod } from "../../lib/payroll/nutritionAssignments";
import { getClient } from "../../lib/nutrition/clients";
import { createEntry } from "../../lib/payroll/entries";
import { finalizeOwnPeriod } from "../../lib/payroll/finalizations";
import { computeTotals, formatMoney } from "../../lib/payroll/calc";
import { confirmFinalizePayroll } from "../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";

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

  const handleFinalize = async () => {
    const ok = await confirmFinalizePayroll(periodStart ? `${periodStart} – ${periodEnd}` : "this period");
    if (!ok) return;

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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
        <View className="w-full max-w-lg rounded-2xl bg-white p-5" style={{ maxHeight: "88%" }}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              Finalize payroll
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#78716c" />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="mb-4 rounded-xl border border-stone-200 p-4">
                <Text className="mb-1 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                  {entries.length} entr{entries.length === 1 ? "y" : "ies"} logged this period
                </Text>
                <Text className="text-xl" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
                  {formatMoney(totals.total + nutritionAddOn)}
                </Text>
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

              <Pressable
                onPress={handleFinalize}
                disabled={submitting}
                className="items-center rounded-lg px-5 py-3"
                style={{ backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }}
              >
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                  {submitting ? "Finalizing…" : "Confirm & finalize"}
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
