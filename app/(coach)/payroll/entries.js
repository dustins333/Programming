import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  deleteDayEntry,
} from "../../../lib/payroll/dayEntries";
import { listDaySubmissionsForPeriod, submitDay, clearDaySubmission } from "../../../lib/payroll/daySubmissions";
import { partitionDayEntries, buildRateMaps, computeTotals, formatMoney } from "../../../lib/payroll/calc";
import { getOwnFinalization, isLocked as isFinalizationLocked } from "../../../lib/payroll/finalizations";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateMD, formatDateMDY } from "../../../lib/formatDate";
import { toastError } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { PayrollDateNav } from "../../../components/payroll/PayrollDateNav";
import { PayrollTile } from "../../../components/payroll/PayrollTile";
import { PayrollOtherRow } from "../../../components/payroll/PayrollOtherRow";
import { SpcSessionPopup } from "../../../components/payroll/SpcSessionPopup";
import { EntryListPopup } from "../../../components/payroll/EntryListPopup";
import { NamesListPopup } from "../../../components/payroll/NamesListPopup";
import { HourMinuteStepperPopup } from "../../../components/payroll/HourMinuteStepperPopup";
import { OtherItemPopup } from "../../../components/payroll/OtherItemPopup";
import { DaySubmittedCelebration } from "../../../components/payroll/DaySubmittedCelebration";

// How long after the last +/- tap a counter tile writes. Short enough that
// nothing is realistically lost by navigating away, long enough that
// tapping a count up to 4 is one write rather than four.
const COUNTER_SAVE_DELAY = 600;

// Every tile's checkmark means the same thing across this whole screen:
// "none" = nothing entered, "hollow" = entered and already saved but the
// day hasn't been submitted, "solid" = the day has been submitted. Per
// direct ask, the checkmark is no longer a per-tile save button — data
// autosaves as it's entered, and the one sticky Submit button at the bottom
// is what fills every checkmark in at once. Editing anything afterwards
// clears the submission again (see persistDay), so a solid checkmark always
// describes exactly what's saved right now.
function checkState(hasData, submitted) {
  if (!hasData) return "none";
  return submitted ? "solid" : "hollow";
}

function formatHoursDisplay(decimal) {
  if (!decimal) return "—";
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Every tile lays itself out the same way — label pinned to the top,
// control centered in whatever's left, caption slot pinned to the bottom
// (reserved whether or not that tile has a caption). Centering the whole
// stack instead, which is what this did originally, put the label of a tile
// with a caption at a visibly different height from the one beside it
// without. Same fix as My Week's SessionBubble.
const TILE_CAPTION_HEIGHT = 18;

function TileLayout({ label, control, caption }) {
  return (
    <View className="flex-1">
      <Text className="text-center text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      <View className="flex-1 items-center justify-center">{control}</View>
      <View style={{ height: TILE_CAPTION_HEIGHT, justifyContent: "center" }}>{caption}</View>
    </View>
  );
}

// Shown under the counter on the tiles that collect client names
// (Programs Written / Welcome / Strategy). This is where the names popup is
// reached now that the checkmark isn't a button — it's also a better
// affordance than the checkmark ever was, since it says what it opens and
// shows what's already there.
function NamesFooter({ count, notes, onPress }) {
  if (!count) return null;
  const entered = (notes || "").split("\n").filter(Boolean);
  return (
    <Pressable onPress={onPress} hitSlop={6} className="w-full">
      <Text numberOfLines={1} className="text-center" style={{ fontFamily: fonts.sansMedium, fontSize: 11, color: colors.primaryOnWhite }}>
        {entered.length ? entered.join(", ") : "+ Add names"}
      </Text>
    </Pressable>
  );
}

function CounterTileContent({ label, value, onIncrement, onDecrement, footer }) {
  return (
    <TileLayout
      label={label}
      caption={footer}
      control={
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
      }
    />
  );
}

// The caption is an invitation to add another, not a count — the badge in
// the corner already says how many are logged, and saying it twice buried
// the one thing that wasn't obvious: that you can log more than one SPC
// session on the same day. Per direct ask.
function SpcTileContent({ sessionCount, onAddPress }) {
  return (
    <TileLayout
      label="SPC"
      control={
        <Pressable
          onPress={onAddPress}
          hitSlop={8}
          className="items-center justify-center rounded-full"
          style={{ width: 40, height: 40, borderWidth: 1, borderColor: "#e7e5e4", backgroundColor: "white" }}
        >
          <Ionicons name="add" size={20} color={colors.primaryOnWhite} />
        </Pressable>
      }
      caption={
        <Pressable onPress={onAddPress} hitSlop={6} className="w-full">
          {/* 11px, not the 12px used elsewhere: at half a phone's width this
              tile has ~118px of usable room and "Add another session"
              truncated at 12. The round + button directly above already
              signals "tappable", so the caption doesn't need a + of its own. */}
          <Text numberOfLines={1} className="text-center" style={{ fontFamily: fonts.sansMedium, fontSize: 11, color: colors.primaryOnWhite }}>
            {sessionCount > 0 ? "Add another session" : "Log a session"}
          </Text>
        </Pressable>
      }
    />
  );
}

function HoursTileContent({ label, decimal }) {
  return (
    <TileLayout
      label={label}
      control={<Text style={{ fontFamily: fonts.sansBold, fontSize: 24, color: "#44403c" }}>{formatHoursDisplay(decimal)}</Text>}
      caption={
        <Text className="text-center" style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e" }}>
          Tap to log
        </Text>
      }
    />
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
  const [submissions, setSubmissions] = useState([]);
  const [finalization, setFinalization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayInBoise());
  const [submitting, setSubmitting] = useState(false);
  const [celebration, setCelebration] = useState(null);

  const [spcPopup, setSpcPopup] = useState({ open: false, session: null });
  const [spcListOpen, setSpcListOpen] = useState(false);
  const [otherPopup, setOtherPopup] = useState({ open: false, type: null, item: null, qty: null });
  const [otherListOpen, setOtherListOpen] = useState(false);
  const [namesPopup, setNamesPopup] = useState({ open: false, kind: null });
  const [hoursPopup, setHoursPopup] = useState({ open: false, kind: null });

  const [pendingGroup, setPendingGroup] = useState(0);
  const [pendingPrograms, setPendingPrograms] = useState(0);
  const [pendingWelcome, setPendingWelcome] = useState(0);
  const [pendingStrategy, setPendingStrategy] = useState(0);
  // Which date the four counters above currently describe. State, not a
  // ref, specifically because it has to flip in the same commit the
  // counters do — on the render right after a date change the counters
  // still hold the *previous* date's values, and without this the autosave
  // below would briefly see a bogus diff and schedule the old day's numbers
  // onto the new one.
  const [counterDate, setCounterDate] = useState(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const start = await getCurrentPeriodStart();
      const [periodRow, allRates, entries, ownFinalization, daySubmissions] = await Promise.all([
        getPayPeriod(start),
        listAllRates(),
        listEntriesForPeriod(profile.id, start),
        getOwnFinalization(profile.id, start),
        listDaySubmissionsForPeriod(profile.id, start),
      ]);
      setPeriodStart(start);
      setPeriod(periodRow);
      setRates(allRates);
      setAllEntries(entries);
      setFinalization(ownFinalization);
      setSubmissions(daySubmissions);
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

  // Returns the fresh rows so a caller that needs to compute off them (the
  // submit handler's day total) isn't reading the stale render's copy.
  const refresh = useCallback(async () => {
    if (!profile?.id || !periodStart) return [];
    const [entries, daySubmissions] = await Promise.all([
      listEntriesForPeriod(profile.id, periodStart),
      listDaySubmissionsForPeriod(profile.id, periodStart),
    ]);
    setAllEntries(entries);
    setSubmissions(daySubmissions);
    return entries;
  }, [profile?.id, periodStart]);

  const rateMaps = useMemo(() => buildRateMaps(rates), [rates]);
  const totals = useMemo(() => computeTotals(allEntries, rateMaps), [allEntries, rateMaps]);
  const closed = isPeriodClosed(period);
  const locked = isFinalizationLocked(finalization) || closed;
  const periodEnd = periodStart ? computePeriodEnd(periodStart) : null;

  const datesWithEntries = useMemo(() => new Set(allEntries.map((e) => e.entry_date)), [allEntries]);
  const submittedDates = useMemo(() => new Set(submissions.map((s) => s.entry_date)), [submissions]);
  const daySubmitted = submittedDates.has(selectedDate);
  const dayRows = useMemo(() => allEntries.filter((e) => e.entry_date === selectedDate), [allEntries, selectedDate]);
  const partition = useMemo(() => partitionDayEntries(dayRows), [dayRows]);
  const dayTotal = useMemo(() => computeTotals(dayRows, rateMaps).total, [dayRows, rateMaps]);

  // The freshest known core row for the selected date, tracked outside
  // render state so a debounced write that lands between renders can't
  // decide "no core row exists yet" off a stale copy and insert a *second*
  // one for the same date (two core rows would double-count that day's pay).
  const coreRowRef = useRef(null);
  const submittedDatesRef = useRef(submittedDates);
  submittedDatesRef.current = submittedDates;

  useEffect(() => {
    coreRowRef.current = partition.core || null;
  }, [partition.core]);

  // Re-syncs the four local counters from whatever's actually saved for the
  // newly-selected date. Deliberately keyed on selectedDate (+ the initial
  // load finishing) only, not on every entries reload — a tile's own
  // autosave already leaves its pending value equal to what was just saved,
  // so there's nothing to resync mid-date.
  useEffect(() => {
    if (loading) return;
    const rows = allEntries.filter((e) => e.entry_date === selectedDate);
    const core = partitionDayEntries(rows).core;
    coreRowRef.current = core || null;
    setPendingGroup(core?.group_sessions || 0);
    setPendingPrograms(core?.programs_written || 0);
    setPendingWelcome(core?.welcome_sessions || 0);
    setPendingStrategy(core?.strategy_sessions || 0);
    setCounterDate(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, loading]);

  // Every write to a date goes through here so the "submitted" flag can't
  // drift: change anything about a day you already submitted and it drops
  // back to unsubmitted, checkmarks hollow out, and the Submit button comes
  // back. Only actually issues the clear when that date is currently
  // submitted, so the common case stays one round trip.
  //
  // Deliberately rethrows rather than toasting here — every popup that
  // calls into it already reports its own failure and stays open with the
  // user's input intact. The non-popup callers below add their own catch.
  const persistDay = useCallback(
    async (date, fn) => {
      const result = await fn();
      if (submittedDatesRef.current.has(date)) await clearDaySubmission(profile.id, date);
      await refresh();
      return result;
    },
    [profile?.id, refresh]
  );

  const pendingWriteRef = useRef(null);
  const timerRef = useRef(null);

  const flushCounterWrites = useCallback(async () => {
    clearTimeout(timerRef.current);
    const pending = pendingWriteRef.current;
    pendingWriteRef.current = null;
    if (!pending) return;
    const existingCore = pending.date === selectedDate ? coreRowRef.current : pending.coreRow;
    try {
      const saved = await persistDay(pending.date, () =>
        upsertCoreEntryFields(profile.id, pending.periodStart, pending.date, existingCore, pending.fields)
      );
      if (saved && pending.date === selectedDate) coreRowRef.current = saved;
    } catch (err) {
      toastError("Failed to save", err);
    }
  }, [persistDay, profile?.id, selectedDate]);

  const counterDiff = useMemo(() => {
    const saved = partition.core || {};
    const diff = {};
    if (pendingGroup !== (saved.group_sessions || 0)) diff.group_sessions = pendingGroup;
    if (pendingPrograms !== (saved.programs_written || 0)) diff.programs_written = pendingPrograms;
    if (pendingWelcome !== (saved.welcome_sessions || 0)) diff.welcome_sessions = pendingWelcome;
    if (pendingStrategy !== (saved.strategy_sessions || 0)) diff.strategy_sessions = pendingStrategy;
    return diff;
  }, [partition.core, pendingGroup, pendingPrograms, pendingWelcome, pendingStrategy]);

  // Changing date mid-debounce flushes the previous day's pending write
  // rather than dropping it — the write carries its own date and core row,
  // so it still lands on the day it was made for.
  const flushedDateRef = useRef(selectedDate);
  useEffect(() => {
    if (flushedDateRef.current === selectedDate) return;
    flushedDateRef.current = selectedDate;
    if (pendingWriteRef.current) flushCounterWrites();
  }, [selectedDate, flushCounterWrites]);

  // Counter autosave. Deliberately does NOT cancel the timer in a cleanup —
  // a cleanup fires on every dep change, which would mean a change could be
  // silently dropped rather than saved.
  useEffect(() => {
    if (loading || locked || !periodStart) return;
    if (counterDate !== selectedDate) return;
    if (Object.keys(counterDiff).length === 0) {
      clearTimeout(timerRef.current);
      pendingWriteRef.current = null;
      return;
    }
    pendingWriteRef.current = { date: selectedDate, periodStart, coreRow: partition.core || null, fields: counterDiff };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      flushCounterWrites();
    }, COUNTER_SAVE_DELAY);
  }, [counterDiff, counterDate, selectedDate, periodStart, loading, locked, partition.core, flushCounterWrites]);

  // Leaving the screen entirely (tab switch, back) flushes rather than
  // drops — the same reason the effect above never cancels.
  useFocusEffect(
    useCallback(() => {
      return () => {
        flushCounterWrites();
      };
    }, [flushCounterWrites])
  );

  const openNewSpc = () => setSpcPopup({ open: true, session: null });
  const openEditSpc = (session) => {
    setSpcListOpen(false);
    setSpcPopup({ open: true, session });
  };
  const handleSaveSpc = async ({ attendees, notes }) => {
    const date = selectedDate;
    await persistDay(date, () =>
      spcPopup.session ? updateSpcSession(spcPopup.session.id, { attendees, notes }) : createSpcSession(profile.id, periodStart, date, { attendees, notes })
    );
  };

  // The Other row already collects quantity inline (PayrollOtherRow) before
  // this ever fires — a type with no notes to collect has nothing left for
  // a popup to do, so it saves straight away with no popup at all; a type
  // with notes still opens OtherItemPopup, but only for the notes field
  // (the qty field stays hidden there since it's already been provided).
  const handleConfirmOtherRow = async (type, qty) => {
    const config = rates.otherRates.find((r) => r.other_type === type);
    if (config && config.has_notes === false) {
      const date = selectedDate;
      try {
        await persistDay(date, () => createOtherItem(profile.id, periodStart, date, { otherType: type, qty, notes: "" }));
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
    const date = selectedDate;
    await persistDay(date, () =>
      otherPopup.item
        ? updateOtherItem(otherPopup.item.id, { otherType: otherPopup.type, qty, notes })
        : createOtherItem(profile.id, periodStart, date, { otherType: otherPopup.type, qty, notes })
    );
  };

  const handleDeleteEntry = async (item) => {
    await persistDay(item.entry_date, () => deleteDayEntry(item.id));
  };

  const handleSaveNames = async (joinedNames) => {
    const fields =
      namesPopup.kind === "welcome"
        ? { welcome_sessions: pendingWelcome, welcome_notes: joinedNames }
        : namesPopup.kind === "strategy"
          ? { strategy_sessions: pendingStrategy, strategy_notes: joinedNames }
          : { programs_written: pendingPrograms, program_notes: joinedNames };
    const date = selectedDate;
    const saved = await persistDay(date, () => upsertCoreEntryFields(profile.id, periodStart, date, coreRowRef.current, fields));
    if (saved && date === selectedDate) coreRowRef.current = saved;
  };

  const handleSaveHours = async (decimal) => {
    const field = hoursPopup.kind === "admin" ? "admin_hours" : "ops_hours";
    const date = selectedDate;
    const saved = await persistDay(date, () => upsertCoreEntryFields(profile.id, periodStart, date, coreRowRef.current, { [field]: decimal }));
    if (saved && date === selectedDate) coreRowRef.current = saved;
  };

  const handleSubmitDay = async () => {
    setSubmitting(true);
    try {
      // Anything still sitting in the counter debounce has to land first,
      // or it'd immediately clear the submission we're about to make.
      await flushCounterWrites();
      await submitDay(profile.id, periodStart, selectedDate);
      const entries = await refresh();
      const rows = entries.filter((e) => e.entry_date === selectedDate);
      setCelebration({ dateLabel: formatDateMDY(selectedDate), amountLabel: formatMoney(computeTotals(rows, rateMaps).total) });
    } catch (err) {
      toastError("Failed to submit", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Only counts what the tiles on this screen actually collect — an
  // approved custom request lands on its own pay_entries row for whatever
  // date it was approved, and "Submit this day" shouldn't light up for a
  // day the coach hasn't logged anything on themselves.
  const hasDayData =
    pendingGroup > 0 ||
    pendingPrograms > 0 ||
    pendingWelcome > 0 ||
    pendingStrategy > 0 ||
    partition.spcSessions.length > 0 ||
    partition.otherItems.length > 0 ||
    Boolean(partition.core?.admin_hours) ||
    Boolean(partition.core?.ops_hours);

  return (
    <CoachShell>
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <ScrollView className="flex-1 px-8 pt-8" contentContainerStyle={{ paddingBottom: 40 }}>
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
                    submittedDates={submittedDates}
                  />

                  <View className="mx-auto w-full" style={{ maxWidth: 460 }}>
                    <View className="mb-3 flex-row" style={{ gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <PayrollTile checkState={checkState(pendingGroup > 0, daySubmitted)}>
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
                            checkState={checkState(partition.spcSessions.length > 0, daySubmitted)}
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
                          <PayrollTile checkState={checkState(pendingPrograms > 0, daySubmitted)}>
                            <CounterTileContent
                              label="Programs Written"
                              value={pendingPrograms}
                              onIncrement={() => setPendingPrograms((v) => v + 1)}
                              onDecrement={() => setPendingPrograms((v) => Math.max(0, v - 1))}
                              footer={
                                <NamesFooter
                                  count={pendingPrograms}
                                  notes={partition.core?.program_notes}
                                  onPress={() => setNamesPopup({ open: true, kind: "programs" })}
                                />
                              }
                            />
                          </PayrollTile>
                        </View>
                      </View>
                    ) : null}

                    <View className="mb-3 flex-row" style={{ gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <PayrollTile checkState={checkState(pendingWelcome > 0, daySubmitted)}>
                          <CounterTileContent
                            label="Welcome Session"
                            value={pendingWelcome}
                            onIncrement={() => setPendingWelcome((v) => v + 1)}
                            onDecrement={() => setPendingWelcome((v) => Math.max(0, v - 1))}
                            footer={
                              <NamesFooter
                                count={pendingWelcome}
                                notes={partition.core?.welcome_notes}
                                onPress={() => setNamesPopup({ open: true, kind: "welcome" })}
                              />
                            }
                          />
                        </PayrollTile>
                      </View>
                      <View style={{ flex: 1 }}>
                        <PayrollTile checkState={checkState(pendingStrategy > 0, daySubmitted)}>
                          <CounterTileContent
                            label="Strategy Session"
                            value={pendingStrategy}
                            onIncrement={() => setPendingStrategy((v) => v + 1)}
                            onDecrement={() => setPendingStrategy((v) => Math.max(0, v - 1))}
                            footer={
                              <NamesFooter
                                count={pendingStrategy}
                                notes={partition.core?.strategy_notes}
                                onPress={() => setNamesPopup({ open: true, kind: "strategy" })}
                              />
                            }
                          />
                        </PayrollTile>
                      </View>
                    </View>

                    <View className="mb-3 flex-row" style={{ gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <PayrollTile
                          checkState={checkState(Boolean(partition.core?.admin_hours), daySubmitted)}
                          onPress={() => setHoursPopup({ open: true, kind: "admin" })}
                        >
                          <HoursTileContent label="Admin Hours" decimal={partition.core?.admin_hours} />
                        </PayrollTile>
                      </View>
                      {canOps ? (
                        <View style={{ flex: 1 }}>
                          <PayrollTile
                            checkState={checkState(Boolean(partition.core?.ops_hours), daySubmitted)}
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
                        submitted={daySubmitted}
                      />
                    </View>

                    <Text className="mt-2 text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                      Everything saves as you go. Submit the day below when it's done — then head to Pay Stubs at the end of
                      the period to review and finalize.
                    </Text>
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>

        {!loading && !locked ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: "#ece7e1",
              backgroundColor: daySubmitted ? "#eef1e7" : "white",
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 16,
            }}
          >
            <View className="mx-auto w-full" style={{ maxWidth: 460 }}>
              {daySubmitted ? (
                <View className="flex-row items-center justify-center" style={{ gap: 8 }}>
                  <Ionicons name="checkmark-circle" size={22} color="#4d6142" />
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: "#4d6142" }}>
                    {formatDateMDY(selectedDate)} submitted · {formatMoney(dayTotal)}
                  </Text>
                </View>
              ) : (
                <>
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
                      {formatDateMDY(selectedDate)}
                    </Text>
                    <Text style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>{formatMoney(dayTotal)}</Text>
                  </View>
                  <Pressable
                    onPress={handleSubmitDay}
                    disabled={!hasDayData || submitting}
                    className="items-center rounded-xl px-5 py-3.5"
                    style={{ backgroundColor: colors.primary, opacity: !hasDayData || submitting ? 0.45 : 1 }}
                  >
                    <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                      {submitting ? "Submitting…" : hasDayData ? "Submit this day" : "Nothing logged yet"}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        ) : null}
      </View>

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

      <DaySubmittedCelebration
        visible={!!celebration}
        dateLabel={celebration?.dateLabel}
        amountLabel={celebration?.amountLabel}
        onClose={() => setCelebration(null)}
      />
    </CoachShell>
  );
}
