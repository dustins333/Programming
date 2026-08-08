import { useState, useCallback, useMemo } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform, Modal } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getCurrentPeriodStart, getPayPeriod, computePeriodEnd, isPeriodClosed } from "../../../lib/payroll/periods";
import { listAllRates } from "../../../lib/payroll/rates";
import { listEntriesForPeriod, createEntry, deleteEntry } from "../../../lib/payroll/entries";
import { getOwnFinalization, isLocked as isFinalizationLocked } from "../../../lib/payroll/finalizations";
import { buildRateMaps, computeEntryBreakdown, computeTotals, formatMoney } from "../../../lib/payroll/calc";
import { formatDateMDY, formatDateMD } from "../../../lib/formatDate";
import { todayInBoise } from "../../../lib/boiseDate";
import { toastError, toastSuccess } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";
import { FinalizeModal } from "../../../components/payroll/FinalizeModal";

const isWeb = Platform.OS === "web";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && value !== "" ? n : null;
}

function NumField({ label, value, onChangeText, placeholder }) {
  return (
    <View className="mb-3 flex-1">
      <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType="decimal-pad"
        inputAccessoryViewID={NUMERIC_DONE_ID}
        className="rounded-lg border border-stone-300 px-3 py-2.5"
        style={{ fontFamily: fonts.sans }}
      />
    </View>
  );
}

function SpcAttendeePicker({ value, onChange }) {
  return (
    <View className="mb-3 flex-row gap-2">
      {[0, 1, 2, 3, 4].map((n) => {
        const active = value === n;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            className="h-10 w-10 items-center justify-center rounded-full border"
            style={{ borderColor: active ? colors.primary : "#d6d3d1", backgroundColor: active ? "#fdf6f2" : "white" }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, color: active ? colors.primaryOnWhite : "#57534e" }}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EntryFormModal({ visible, onClose, onSubmit, profile, otherRates, submitting }) {
  const isAdmin = profile?.role === "admin";
  const canSpc = isAdmin || profile?.can_view_spc;
  const canOps = isAdmin || profile?.can_log_ops_hours;

  const [entryDate, setEntryDate] = useState(todayInBoise());
  const [groupSessions, setGroupSessions] = useState("");
  const [programsWritten, setProgramsWritten] = useState("");
  const [adminHours, setAdminHours] = useState("");
  const [welcomeSessions, setWelcomeSessions] = useState("");
  const [strategySessions, setStrategySessions] = useState("");
  const [opsHours, setOpsHours] = useState("");
  const [spcSession, setSpcSession] = useState(false);
  const [spcAttendees, setSpcAttendees] = useState(null);
  const [spcNotes, setSpcNotes] = useState("");
  const [otherType, setOtherType] = useState("");
  const [otherQty, setOtherQty] = useState("1");
  const [customAmt, setCustomAmt] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setEntryDate(todayInBoise());
    setGroupSessions("");
    setProgramsWritten("");
    setAdminHours("");
    setWelcomeSessions("");
    setStrategySessions("");
    setOpsHours("");
    setSpcSession(false);
    setSpcAttendees(null);
    setSpcNotes("");
    setOtherType("");
    setOtherQty("1");
    setCustomAmt("");
    setCustomDescription("");
    setNotes("");
  };

  const handleSubmit = async () => {
    const fields = {
      entry_date: entryDate,
      group_sessions: num(groupSessions),
      programs_written: canSpc ? num(programsWritten) : null,
      admin_hours: num(adminHours),
      welcome_sessions: num(welcomeSessions),
      strategy_sessions: num(strategySessions),
      ops_hours: canOps ? num(opsHours) : null,
      spc_session: canSpc && spcSession ? true : null,
      spc_attendees: canSpc && spcSession ? spcAttendees : null,
      other_type: otherType || null,
      other_qty: otherType ? (num(otherQty) ?? 1) : 1,
      custom_amt: num(customAmt),
      custom_description: customDescription || null,
      notes: notes || null,
      spc_notes: canSpc && spcSession ? spcNotes || null : null,
    };
    const hasAnything =
      fields.group_sessions || fields.programs_written || fields.admin_hours || fields.welcome_sessions ||
      fields.strategy_sessions || fields.ops_hours || fields.spc_session || fields.other_type || fields.custom_amt;
    if (!hasAnything) {
      toastError("Log at least one thing before saving");
      return;
    }
    if (canSpc && spcSession && spcAttendees === null) {
      toastError("Pick how many attendees for this SPC session");
      return;
    }
    await onSubmit(fields);
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
        <View className="w-full max-w-lg rounded-2xl bg-white p-5" style={{ maxHeight: "88%" }}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              Log an entry
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color="#78716c" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <NumField label="Date (YYYY-MM-DD)" value={entryDate} onChangeText={setEntryDate} placeholder={todayInBoise()} />

            <View className="flex-row gap-3">
              <NumField label="Group sessions" value={groupSessions} onChangeText={setGroupSessions} placeholder="0" />
              <NumField label="Admin hours" value={adminHours} onChangeText={setAdminHours} placeholder="0" />
            </View>
            <View className="flex-row gap-3">
              <NumField label="Welcome sessions" value={welcomeSessions} onChangeText={setWelcomeSessions} placeholder="0" />
              <NumField label="Strategy sessions" value={strategySessions} onChangeText={setStrategySessions} placeholder="0" />
            </View>

            {canSpc ? (
              <NumField label="Programs written" value={programsWritten} onChangeText={setProgramsWritten} placeholder="0" />
            ) : null}
            {canOps ? <NumField label="Ops hours" value={opsHours} onChangeText={setOpsHours} placeholder="0" /> : null}

            {canSpc ? (
              <View className="mb-2 rounded-xl border border-stone-200 p-3">
                <Pressable onPress={() => setSpcSession((s) => !s)} className="mb-2 flex-row items-center gap-2">
                  <Ionicons name={spcSession ? "checkbox" : "square-outline"} size={20} color={spcSession ? colors.primary : "#a8a29e"} />
                  <Text style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>SPC session</Text>
                </Pressable>
                {spcSession ? (
                  <>
                    <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                      Attendees
                    </Text>
                    <SpcAttendeePicker value={spcAttendees} onChange={setSpcAttendees} />
                    <TextInput
                      value={spcNotes}
                      onChangeText={setSpcNotes}
                      placeholder="Who attended (optional)"
                      multiline
                      className="rounded-lg border border-stone-300 px-3 py-2.5"
                      style={{ fontFamily: fonts.sans, minHeight: 50, textAlignVertical: "top" }}
                    />
                  </>
                ) : null}
              </View>
            ) : null}

            <View className="mb-3 rounded-xl border border-stone-200 p-3">
              <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                Other
              </Text>
              {isWeb ? (
                <select
                  value={otherType}
                  onChange={(e) => setOtherType(e.target.value)}
                  style={{ fontFamily: fonts.sans, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: "1px solid #d6d3d1", marginBottom: 8 }}
                >
                  <option value="">— None —</option>
                  {otherRates.map((r) => (
                    <option key={r.other_type} value={r.other_type}>
                      {r.other_type} (${Number(r.rate).toFixed(2)}/{r.unit})
                    </option>
                  ))}
                </select>
              ) : (
                <View className="mb-2 flex-row flex-wrap gap-2">
                  {[{ other_type: "", unit: "" }, ...otherRates].map((r) => {
                    const active = otherType === r.other_type;
                    return (
                      <Pressable
                        key={r.other_type || "none"}
                        onPress={() => setOtherType(r.other_type)}
                        className="rounded-full border px-3 py-1.5"
                        style={{ borderColor: active ? colors.primary : "#d6d3d1", backgroundColor: active ? "#fdf6f2" : "white" }}
                      >
                        <Text style={{ fontFamily: fonts.sansMedium, color: active ? colors.primaryOnWhite : "#57534e", fontSize: 12 }}>
                          {r.other_type || "None"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              {otherType ? (
                <>
                  <NumField label="Qty (defaults to 1)" value={otherQty} onChangeText={setOtherQty} placeholder="1" />
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Notes (optional)"
                    className="rounded-lg border border-stone-300 px-3 py-2.5"
                    style={{ fontFamily: fonts.sans }}
                  />
                </>
              ) : null}
            </View>

            <View className="mb-3 rounded-xl border border-stone-200 p-3">
              <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                Custom amount
              </Text>
              <NumField label="$ Amount" value={customAmt} onChangeText={setCustomAmt} placeholder="0.00" />
              <TextInput
                value={customDescription}
                onChangeText={setCustomDescription}
                placeholder="Description"
                className="rounded-lg border border-stone-300 px-3 py-2.5"
                style={{ fontFamily: fonts.sans }}
              />
            </View>

            {!otherType ? (
              <View className="mb-3">
                <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                  Notes
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Optional"
                  className="rounded-lg border border-stone-300 px-3 py-2.5"
                  style={{ fontFamily: fonts.sans }}
                />
              </View>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              className="mt-1 items-center rounded-lg px-5 py-3"
              style={{ backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {submitting ? "Saving…" : "Save entry"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function MyEntries() {
  const { profile } = useAuth();
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState(null);
  const [period, setPeriod] = useState(null);
  const [rates, setRates] = useState({ coreRates: [], otherRates: [], spcTiers: [] });
  const [entries, setEntries] = useState([]);
  const [finalization, setFinalization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const start = await getCurrentPeriodStart();
      const [periodRow, allRates, ownEntries, ownFinalization] = await Promise.all([
        getPayPeriod(start),
        listAllRates(),
        listEntriesForPeriod(profile.id, start),
        getOwnFinalization(profile.id, start),
      ]);
      setPeriodStart(start);
      setPeriod(periodRow);
      setRates(allRates);
      setEntries(ownEntries);
      setFinalization(ownFinalization);
    } catch (err) {
      toastError("Failed to load payroll", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const rateMaps = useMemo(() => buildRateMaps(rates), [rates]);
  const totals = useMemo(() => computeTotals(entries, rateMaps), [entries, rateMaps]);
  const closed = isPeriodClosed(period);
  const locked = isFinalizationLocked(finalization) || closed;
  const periodEnd = periodStart ? computePeriodEnd(periodStart) : null;

  const handleAddEntry = async (fields) => {
    setSubmitting(true);
    try {
      await createEntry(profile.id, periodStart, fields);
      toastSuccess("Entry saved");
      setFormOpen(false);
      await load();
    } catch (err) {
      toastError("Failed to save entry", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (entryId) => {
    try {
      await deleteEntry(entryId);
      await load();
    } catch (err) {
      toastError("Failed to remove entry", err);
    }
  };

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white px-8 pt-8" contentContainerStyle={{ paddingBottom: 40 }}>
        {Platform.OS !== "web" ? (
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/more"))} className="mb-4 self-start">
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </Pressable>
        ) : null}
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Payroll
        </Text>
        <PayrollTabBar active="entries" profile={profile} />

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View className="mb-5 flex-row items-center justify-between">
              <View>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
                  {periodStart ? `${formatDateMD(periodStart)} – ${formatDateMD(periodEnd)}` : ""}
                </Text>
                <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                  {closed ? "Closed" : locked ? "Finalized — locked" : "Open"}
                </Text>
              </View>
              <Text className="text-xl" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
                {formatMoney(totals.total)}
              </Text>
            </View>

            {locked ? (
              <View className="mb-5 rounded-xl border p-4" style={{ borderColor: "#f0ddd2", backgroundColor: "#fdf6f2" }}>
                <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                  {closed
                    ? "This pay period is closed and can't be edited."
                    : "You've finalized this period — an admin needs to reopen it before you can add or edit entries."}
                </Text>
              </View>
            ) : (
              <View className="mb-5 flex-row gap-3">
                <Pressable
                  onPress={() => setFormOpen(true)}
                  className="flex-row items-center gap-2 rounded-lg px-4 py-3"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Ionicons name="add" size={16} color="white" />
                  <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                    Log entry
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setFinalizeOpen(true)}
                  disabled={entries.length === 0}
                  className="flex-row items-center gap-2 rounded-lg border px-4 py-3"
                  style={{ borderColor: entries.length === 0 ? "#e7e5e4" : colors.primary, opacity: entries.length === 0 ? 0.5 : 1 }}
                >
                  <Ionicons name="checkmark-done" size={16} color={colors.primaryOnWhite} />
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Finalize</Text>
                </Pressable>
              </View>
            )}

            {entries.length === 0 ? (
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                No entries logged for this period yet.
              </Text>
            ) : (
              entries.map((entry) => {
                const breakdown = computeEntryBreakdown(entry, rateMaps);
                const parts = [];
                if (entry.group_sessions) parts.push(`${entry.group_sessions} group`);
                if (entry.programs_written) parts.push(`${entry.programs_written} programs`);
                if (entry.admin_hours) parts.push(`${entry.admin_hours} admin hrs`);
                if (entry.welcome_sessions) parts.push(`${entry.welcome_sessions} welcome`);
                if (entry.strategy_sessions) parts.push(`${entry.strategy_sessions} strategy`);
                if (entry.ops_hours) parts.push(`${entry.ops_hours} ops hrs`);
                if (entry.spc_session) parts.push(`SPC (${entry.spc_attendees ?? "?"} attendees)`);
                if (entry.other_type) parts.push(`${entry.other_type} ×${entry.other_qty ?? 1}`);
                if (entry.custom_amt) parts.push(entry.custom_description || "Custom");
                return (
                  <View key={entry.id} className="mb-2 flex-row items-start justify-between rounded-xl border border-stone-200 p-4">
                    <View className="flex-1 pr-3">
                      <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{formatDateMDY(entry.entry_date)}</Text>
                      <Text className="mt-0.5 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                        {parts.join(" · ") || "—"}
                      </Text>
                      {entry.notes || entry.spc_notes ? (
                        <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                          {[entry.notes, entry.spc_notes].filter(Boolean).join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                    <View className="items-end">
                      <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>{formatMoney(breakdown.total)}</Text>
                      {!locked ? (
                        <Pressable onPress={() => handleDelete(entry.id)} hitSlop={8} className="mt-1">
                          <Ionicons name="trash-outline" size={16} color="#a8a29e" />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <EntryFormModal
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleAddEntry}
        profile={profile}
        otherRates={rates.otherRates.filter((r) => r.active)}
        submitting={submitting}
      />

      <FinalizeModal
        visible={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        onFinalized={load}
        profile={profile}
        periodStart={periodStart}
        periodEnd={periodEnd}
        entries={entries}
        rateMaps={rateMaps}
      />
    </CoachShell>
  );
}
