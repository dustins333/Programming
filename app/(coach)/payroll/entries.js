import { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getCurrentPeriodStart, getPayPeriod, computePeriodEnd, isPeriodClosed } from "../../../lib/payroll/periods";
import { listAllRates } from "../../../lib/payroll/rates";
import { listEntriesForPeriod } from "../../../lib/payroll/entries";
import {
  upsertCoreEntryFields,
  createSpcSession,
  updateSpcSession,
  createOtherItem,
  updateOtherItem,
  upsertCustomForDate,
  deleteDayEntry,
} from "../../../lib/payroll/dayEntries";
import { partitionDayEntries, buildRateMaps, computeTotals, formatMoney } from "../../../lib/payroll/calc";
import { getOwnFinalization, isLocked as isFinalizationLocked } from "../../../lib/payroll/finalizations";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateMD } from "../../../lib/formatDate";
import { toastError } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { PayrollDateNav } from "../../../components/payroll/PayrollDateNav";
import { PayrollTile } from "../../../components/payroll/PayrollTile";
import { PayrollOtherRow } from "../../../components/payroll/PayrollOtherRow";
import { PayrollCustomRow } from "../../../components/payroll/PayrollCustomRow";
import { SpcSessionPopup } from "../../../components/payroll/SpcSessionPopup";
import { EntryListPopup } from "../../../components/payroll/EntryListPopup";
import { NamesListPopup } from "../../../components/payroll/NamesListPopup";
import { HourMinuteStepperPopup } from "../../../components/payroll/HourMinuteStepperPopup";
import { OtherItemPopup } from "../../../components/payroll/OtherItemPopup";
import { CustomEntryPopup } from "../../../components/payroll/CustomEntryPopup";

// "hollow" = data present but not yet confirmed (the pending value differs
// from what's saved); "solid" = confirmed and saved; "none" = nothing
// entered at all, no checkmark shown. Only used by the plain counter tiles
// (Group, Programs Written, Welcome, Strategy) — SPC/Other/Custom/Hours are
// popup-driven and go straight from "none" to "solid" the moment their
// popup's own Save fires, with no intermediate hollow state (see the
// approved plan's Phase B4/B5 for the full reasoning).
function counterCheckState(pending, saved) {
  if (!pending && !saved) return "none";
  return pending === saved ? "solid" : "hollow";
}

function formatHoursDisplay(decimal) {
  if (!decimal) return "—";
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function CounterTileContent({ label, value, onIncrement, onDecrement }) {
  return (
    <View className="flex-1 items-center justify-center">
      <Text className="mb-2 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <View className="w-full flex-row items-center justify-between">
        <Pressable
          onPress={onDecrement}
          hitSlop={10}
          className="items-center justify-center rounded-full"
          style={{ width: 30, height: 30, borderWidth: 1, borderColor: "#e7e5e4" }}
        >
          <Ionicons name="remove" size={16} color={colors.primaryOnWhite} />
        </Pressable>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 28, color: "#44403c" }}>{value}</Text>
        <Pressable
          onPress={onIncrement}
          hitSlop={10}
          className="items-center justify-center rounded-full"
          style={{ width: 30, height: 30, borderWidth: 1, borderColor: "#e7e5e4" }}
        >
          <Ionicons name="add" size={16} color={colors.primaryOnWhite} />
        </Pressable>
      </View>
    </View>
  );
}

function SpcTileContent({ sessionCount, onAddPress }) {
  return (
    <View className="flex-1 items-center justify-center">
      <Text className="mb-2 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
        SPC
      </Text>
      <Pressable
        onPress={onAddPress}
        hitSlop={8}
        className="items-center justify-center rounded-full"
        style={{ width: 40, height: 40, borderWidth: 1, borderColor: "#e7e5e4", backgroundColor: "white" }}
      >
        <Ionicons name="add" size={20} color={colors.primaryOnWhite} />
      </Pressable>
      <Text className="mt-2 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
        {sessionCount > 0 ? `${sessionCount} session${sessionCount === 1 ? "" : "s"} logged` : "Log a session"}
      </Text>
    </View>
  );
}

function HoursTileContent({ label, decimal }) {
  return (
    <View className="flex-1 items-center justify-center">
      <Text className="mb-2 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 24, color: "#44403c" }}>{formatHoursDisplay(decimal)}</Text>
      <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
        Tap to log
      </Text>
    </View>
  );
}

export default function PayrollEntries() {
  const { profile } = useAuth();
  const router = useRouter();
  const isAdmin = profile?.role === "admin";
  const canSpc = isAdmin || profile?.can_view_spc;
  const canOps = isAdmin || profile?.can_log_ops_hours;

  const [periodStart, setPeriodStart] = useState(null);
  const [period, setPeriod] = useState(null);
  const [rates, setRates] = useState({ coreRates: [], otherRates: [], spcTiers: [] });
  const [allEntries, setAllEntries] = useState([]);
  const [finalization, setFinalization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayInBoise());

  const [spcPopup, setSpcPopup] = useState({ open: false, session: null });
  const [spcListOpen, setSpcListOpen] = useState(false);
  const [otherPopup, setOtherPopup] = useState({ open: false, type: null, item: null, qty: null });
  const [otherListOpen, setOtherListOpen] = useState(false);
  const [customPopupOpen, setCustomPopupOpen] = useState(false);
  const [namesPopup, setNamesPopup] = useState({ open: false, kind: null });
  const [hoursPopup, setHoursPopup] = useState({ open: false, kind: null });

  const [pendingGroup, setPendingGroup] = useState(0);
  const [pendingPrograms, setPendingPrograms] = useState(0);
  const [pendingWelcome, setPendingWelcome] = useState(0);
  const [pendingStrategy, setPendingStrategy] = useState(0);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const start = await getCurrentPeriodStart();
      const [periodRow, allRates, entries, ownFinalization] = await Promise.all([
        getPayPeriod(start),
        listAllRates(),
        listEntriesForPeriod(profile.id, start),
        getOwnFinalization(profile.id, start),
      ]);
      setPeriodStart(start);
      setPeriod(periodRow);
      setRates(allRates);
      setAllEntries(entries);
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

  const reload = useCallback(async () => {
    if (!profile?.id || !periodStart) return;
    const entries = await listEntriesForPeriod(profile.id, periodStart);
    setAllEntries(entries);
  }, [profile?.id, periodStart]);

  const rateMaps = useMemo(() => buildRateMaps(rates), [rates]);
  const totals = useMemo(() => computeTotals(allEntries, rateMaps), [allEntries, rateMaps]);
  const closed = isPeriodClosed(period);
  const locked = isFinalizationLocked(finalization) || closed;
  const periodEnd = periodStart ? computePeriodEnd(periodStart) : null;

  const datesWithEntries = useMemo(() => new Set(allEntries.map((e) => e.entry_date)), [allEntries]);
  const dayRows = useMemo(() => allEntries.filter((e) => e.entry_date === selectedDate), [allEntries, selectedDate]);
  const partition = useMemo(() => partitionDayEntries(dayRows), [dayRows]);

  // Re-syncs the four local counters from whatever's actually saved for the
  // newly-selected date. Deliberately keyed on selectedDate (+ the initial
  // load finishing) only, not on every entries reload — a tile's own save
  // already leaves its pending value equal to what was just saved, so
  // there's nothing to resync mid-date; resetting on every reload would
  // risk clobbering an unrelated tile's in-progress (unsaved) edit.
  useEffect(() => {
    if (loading) return;
    const rows = allEntries.filter((e) => e.entry_date === selectedDate);
    const core = partitionDayEntries(rows).core;
    setPendingGroup(core?.group_sessions || 0);
    setPendingPrograms(core?.programs_written || 0);
    setPendingWelcome(core?.welcome_sessions || 0);
    setPendingStrategy(core?.strategy_sessions || 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, loading]);

  const handleSaveCoreField = async (fields) => {
    try {
      await upsertCoreEntryFields(profile.id, periodStart, selectedDate, partition.core, fields);
      await reload();
    } catch (err) {
      toastError("Failed to save", err);
    }
  };

  const openNewSpc = () => setSpcPopup({ open: true, session: null });
  const openEditSpc = (session) => {
    setSpcListOpen(false);
    setSpcPopup({ open: true, session });
  };
  const handleSaveSpc = async ({ attendees, notes }) => {
    if (spcPopup.session) {
      await updateSpcSession(spcPopup.session.id, { attendees, notes });
    } else {
      await createSpcSession(profile.id, periodStart, selectedDate, { attendees, notes });
    }
    await reload();
  };

  // The Other row already collects quantity inline (PayrollOtherRow) before
  // this ever fires — a type with no notes to collect has nothing left for
  // a popup to do, so it saves straight away with no popup at all; a type
  // with notes still opens OtherItemPopup, but only for the notes field
  // (the qty field stays hidden there since it's already been provided).
  const handleConfirmOtherRow = async (type, qty) => {
    const config = rates.otherRates.find((r) => r.other_type === type);
    if (config && config.has_notes === false) {
      try {
        await createOtherItem(profile.id, periodStart, selectedDate, { otherType: type, qty, notes: "" });
        await reload();
      } catch (err) {
        toastError("Failed to save", err);
      }
      return;
    }
    setOtherPopup({ open: true, type, item: null, qty });
  };
  const openEditOther = (item) => {
    setOtherListOpen(false);
    setOtherPopup({ open: true, type: item.other_type, item, qty: null });
  };
  const handleSaveOther = async ({ qty, notes }) => {
    if (otherPopup.item) {
      await updateOtherItem(otherPopup.item.id, { otherType: otherPopup.type, qty, notes });
    } else {
      await createOtherItem(profile.id, periodStart, selectedDate, { otherType: otherPopup.type, qty, notes });
    }
    await reload();
  };

  const handleDeleteEntry = async (item) => {
    await deleteDayEntry(item.id);
    await reload();
  };

  const handleSaveCustom = async ({ amount, description }) => {
    await upsertCustomForDate(profile.id, periodStart, selectedDate, partition.custom, { amount, description });
    await reload();
  };

  const handleSaveNames = async (joinedNames) => {
    if (namesPopup.kind === "welcome") {
      await handleSaveCoreField({ welcome_sessions: pendingWelcome, welcome_notes: joinedNames });
    } else if (namesPopup.kind === "strategy") {
      await handleSaveCoreField({ strategy_sessions: pendingStrategy, strategy_notes: joinedNames });
    } else {
      await handleSaveCoreField({ programs_written: pendingPrograms, program_notes: joinedNames });
    }
  };

  const handleSaveHours = async (decimal) => {
    const field = hoursPopup.kind === "admin" ? "admin_hours" : "ops_hours";
    await handleSaveCoreField({ [field]: decimal });
  };

  return (
    <CoachShell>
      <ScrollView style={{ backgroundColor: colors.canvas }} className="flex-1 px-8 pt-8" contentContainerStyle={{ paddingBottom: 60 }}>
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
              <>
                <PayrollDateNav
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  periodStart={periodStart}
                  periodEnd={periodEnd}
                  datesWithEntries={datesWithEntries}
                />

                <View className="mx-auto w-full" style={{ maxWidth: 460 }}>
                  <View className="mb-3 flex-row" style={{ gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <PayrollTile
                        checkState={counterCheckState(pendingGroup, partition.core?.group_sessions || 0)}
                        onCheckPress={() => handleSaveCoreField({ group_sessions: pendingGroup })}
                      >
                        <CounterTileContent
                          label="Group"
                          value={pendingGroup}
                          onIncrement={() => setPendingGroup((v) => v + 1)}
                          onDecrement={() => setPendingGroup((v) => Math.max(0, v - 1))}
                        />
                      </PayrollTile>
                    </View>
                    {canSpc ? (
                      <View style={{ flex: 1 }}>
                        <PayrollTile
                          checkState={partition.spcSessions.length > 0 ? "solid" : "none"}
                          onCheckPress={() => setSpcListOpen(true)}
                          badgeCount={partition.spcSessions.length}
                          onBadgePress={() => setSpcListOpen(true)}
                        >
                          <SpcTileContent sessionCount={partition.spcSessions.length} onAddPress={openNewSpc} />
                        </PayrollTile>
                      </View>
                    ) : null}
                  </View>

                  {canSpc ? (
                    <View className="mb-3 flex-row" style={{ gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <PayrollTile
                          checkState={counterCheckState(pendingPrograms, partition.core?.programs_written || 0)}
                          onCheckPress={() => pendingPrograms > 0 && setNamesPopup({ open: true, kind: "programs" })}
                        >
                          <CounterTileContent
                            label="Programs Written"
                            value={pendingPrograms}
                            onIncrement={() => setPendingPrograms((v) => v + 1)}
                            onDecrement={() => setPendingPrograms((v) => Math.max(0, v - 1))}
                          />
                        </PayrollTile>
                      </View>
                    </View>
                  ) : null}

                  <View className="mb-3 flex-row" style={{ gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <PayrollTile
                        checkState={counterCheckState(pendingWelcome, partition.core?.welcome_sessions || 0)}
                        onCheckPress={() => pendingWelcome > 0 && setNamesPopup({ open: true, kind: "welcome" })}
                      >
                        <CounterTileContent
                          label="Welcome Session"
                          value={pendingWelcome}
                          onIncrement={() => setPendingWelcome((v) => v + 1)}
                          onDecrement={() => setPendingWelcome((v) => Math.max(0, v - 1))}
                        />
                      </PayrollTile>
                    </View>
                    <View style={{ flex: 1 }}>
                      <PayrollTile
                        checkState={counterCheckState(pendingStrategy, partition.core?.strategy_sessions || 0)}
                        onCheckPress={() => pendingStrategy > 0 && setNamesPopup({ open: true, kind: "strategy" })}
                      >
                        <CounterTileContent
                          label="Strategy Session"
                          value={pendingStrategy}
                          onIncrement={() => setPendingStrategy((v) => v + 1)}
                          onDecrement={() => setPendingStrategy((v) => Math.max(0, v - 1))}
                        />
                      </PayrollTile>
                    </View>
                  </View>

                  <View className="mb-3 flex-row" style={{ gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <PayrollTile
                        checkState={partition.core?.admin_hours ? "solid" : "none"}
                        onCheckPress={() => setHoursPopup({ open: true, kind: "admin" })}
                        onPress={() => setHoursPopup({ open: true, kind: "admin" })}
                      >
                        <HoursTileContent label="Admin Hours" decimal={partition.core?.admin_hours} />
                      </PayrollTile>
                    </View>
                    {canOps ? (
                      <View style={{ flex: 1 }}>
                        <PayrollTile
                          checkState={partition.core?.ops_hours ? "solid" : "none"}
                          onCheckPress={() => setHoursPopup({ open: true, kind: "ops" })}
                          onPress={() => setHoursPopup({ open: true, kind: "ops" })}
                        >
                          <HoursTileContent label="Ops Hours" decimal={partition.core?.ops_hours} />
                        </PayrollTile>
                      </View>
                    ) : null}
                  </View>

                  <View className="mb-3">
                    <PayrollOtherRow
                      otherRates={rates.otherRates.filter((r) => r.active)}
                      items={partition.otherItems}
                      onOpenNewItem={handleConfirmOtherRow}
                      onViewList={() => setOtherListOpen(true)}
                    />
                  </View>

                  <View className="mb-3">
                    <PayrollCustomRow custom={partition.custom} onPress={() => setCustomPopupOpen(true)} />
                  </View>

                  <Text className="mt-2 text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                    Everything above saves as you go — head to the Report tab when you're ready to review and finalize the
                    whole period.
                  </Text>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      <SpcSessionPopup
        visible={spcPopup.open}
        onClose={() => setSpcPopup({ open: false, session: null })}
        onSave={handleSaveSpc}
        onDelete={spcPopup.session ? () => handleDeleteEntry(spcPopup.session) : undefined}
        initial={spcPopup.session ? { attendees: spcPopup.session.spc_attendees, notes: spcPopup.session.spc_notes } : null}
      />
      <EntryListPopup
        visible={spcListOpen}
        onClose={() => setSpcListOpen(false)}
        title="SPC sessions logged"
        items={partition.spcSessions.map((s) => ({
          id: s.id,
          label: `${s.spc_attendees ?? "?"} attendee${s.spc_attendees === 1 ? "" : "s"}`,
          sublabel: s.spc_notes || undefined,
          raw: s,
        }))}
        onSelectItem={(item) => openEditSpc(item.raw)}
        onDeleteItem={handleDeleteEntry}
      />

      <OtherItemPopup
        visible={otherPopup.open}
        onClose={() => setOtherPopup({ open: false, type: null, item: null, qty: null })}
        otherTypeLabel={otherPopup.type}
        config={rates.otherRates.find((r) => r.other_type === otherPopup.type)}
        hideQtyField={!otherPopup.item}
        initial={
          otherPopup.item
            ? { qty: otherPopup.item.other_qty, notes: otherPopup.item.notes }
            : otherPopup.qty != null
              ? { qty: otherPopup.qty, notes: "" }
              : null
        }
        onSave={handleSaveOther}
        onDelete={otherPopup.item ? () => handleDeleteEntry(otherPopup.item) : undefined}
      />
      <EntryListPopup
        visible={otherListOpen}
        onClose={() => setOtherListOpen(false)}
        title="Other items logged"
        items={partition.otherItems.map((item) => ({
          id: item.id,
          label: `${item.other_type} ×${item.other_qty ?? 1}`,
          sublabel: item.notes || undefined,
          raw: item,
        }))}
        onSelectItem={(item) => openEditOther(item.raw)}
        onDeleteItem={handleDeleteEntry}
      />

      <CustomEntryPopup
        visible={customPopupOpen}
        onClose={() => setCustomPopupOpen(false)}
        initial={partition.custom ? { amount: partition.custom.custom_amt, description: partition.custom.custom_description } : null}
        onSave={handleSaveCustom}
      />

      <NamesListPopup
        visible={namesPopup.open}
        onClose={() => setNamesPopup({ open: false, kind: null })}
        title={
          namesPopup.kind === "welcome" ? "Welcome session names" : namesPopup.kind === "strategy" ? "Strategy session names" : "Programs written for"
        }
        count={namesPopup.kind === "welcome" ? pendingWelcome : namesPopup.kind === "strategy" ? pendingStrategy : pendingPrograms}
        initialNotes={
          namesPopup.kind === "welcome"
            ? partition.core?.welcome_notes
            : namesPopup.kind === "strategy"
              ? partition.core?.strategy_notes
              : partition.core?.program_notes
        }
        onSave={handleSaveNames}
      />

      <HourMinuteStepperPopup
        visible={hoursPopup.open}
        onClose={() => setHoursPopup({ open: false, kind: null })}
        title={hoursPopup.kind === "admin" ? "Admin Hours" : "Ops Hours"}
        initialDecimal={hoursPopup.kind === "admin" ? partition.core?.admin_hours : partition.core?.ops_hours}
        onSave={handleSaveHours}
      />
    </CoachShell>
  );
}
