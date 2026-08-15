import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
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
import {
  getOwnFinalization,
  isLocked as isFinalizationLocked,
  listOwnFinalizations,
} from "../../../lib/payroll/finalizations";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateMD, formatDateMDY, formatDateRange } from "../../../lib/formatDate";
import { toastError } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";
import { CoachShell } from "../../../components/CoachShell";
import { PayrollTabBar } from "../../../components/PayrollTabBar";
import { PayrollDateNav } from "../../../components/payroll/PayrollDateNav";
import { PayrollTile, TileButton, tileTone, tileState, CONTROL_DISABLED } from "../../../components/payroll/PayrollTile";
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

const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Friday, Aug 14" / "Fri, Aug 14". Deliberately local to this screen rather
// than added to lib/formatDate — the app's one text date format is
// formatDateMDY's MM-DD-YYYY, and this weekday phrasing exists only because
// the day strip needs to name the day you're standing on. Parsed as UTC off
// the ISO string, never `new Date(bare)`, which resolves in the device zone.
function formatDayLabel(dateString, { short = false } = {}) {
  if (!dateString) return "";
  const d = new Date(`${dateString}T00:00:00Z`);
  const weekday = WEEKDAYS_LONG[d.getUTCDay()];
  return `${short ? weekday.slice(0, 3) : weekday}, ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// Hours read as a number with small unit suffixes rather than a plain
// string, so "1h 30m" carries the same visual weight as a bare count on the
// tile beside it.
function HoursValue({ decimal, tone }) {
  if (!decimal) {
    return <Text style={{ fontSize: 26, fontFamily: fonts.sansBold, color: tone.value, lineHeight: 26 }}>—</Text>;
  }
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  const unit = { fontSize: 16, fontFamily: fonts.sansBold, color: tone.value };
  return (
    <Text style={{ fontSize: 26, fontFamily: fonts.sansBold, color: tone.value, lineHeight: 26 }}>
      {h ? (
        <>
          {h}
          <Text style={unit}>h</Text>
        </>
      ) : null}
      {h && m ? " " : null}
      {m ? (
        <>
          {m}
          <Text style={unit}>m</Text>
        </>
      ) : null}
    </Text>
  );
}

// The +/- pair. The minus half goes quiet at zero rather than disappearing,
// so the control doesn't reflow as the count crosses 1.
function CounterTile({ label, value, state, onIncrement, onDecrement, caption }) {
  const tone = tileTone(state);
  return (
    <PayrollTile
      state={state}
      label={label}
      value={String(value)}
      caption={caption}
      control={
        <>
          <TileButton icon="−" tone={value > 0 ? tone.control : CONTROL_DISABLED} onPress={onDecrement} accessibilityLabel={`One fewer ${label}`} />
          <TileButton icon="+" tone={tone.control} onPress={onIncrement} accessibilityLabel={`One more ${label}`} />
        </>
      }
    />
  );
}

// A caption that's also the tile's secondary action — used for the names
// sheets and SPC's "add another". Better affordance than the old checkmark
// was, since it says what it opens and shows what's already there.
function CaptionLink({ text, onPress, state }) {
  const tone = tileTone(state);
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text numberOfLines={1} style={{ fontSize: 11, fontFamily: fonts.sansMedium, color: tone.caption }}>
        {text}
      </Text>
    </Pressable>
  );
}

// Names already entered on a tile, or a prompt to add them. Null when the
// counter is still at zero — there's nobody to name yet.
function namesText(count, notes) {
  if (!count) return null;
  const entered = (notes || "").split("\n").filter(Boolean);
  return entered.length ? entered.join(", ") : "+ Add names";
}

// "4 attendees" for one session, "4 & 2 attendees" once there are several —
// the count chip already says how many sessions, so this says who was in
// them rather than repeating the number.
function spcCaption(sessions) {
  if (!sessions.length) return "Log a session";
  if (sessions.length === 1) {
    const n = sessions[0].spc_attendees;
    return n == null ? "Add attendees" : `${n} attendee${n === 1 ? "" : "s"}`;
  }
  return `${sessions.map((s) => s.spc_attendees ?? "?").join(" & ")} attendees`;
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
  // Earlier periods this coach can still edit — an admin sent one back, so
  // it's reopened. The screen defaults to the current period as before; this
  // only ever adds a way to reach a past one, and only when there genuinely
  // is one to reach.
  const [editablePastPeriods, setEditablePastPeriods] = useState([]);
  const [currentPeriodStart, setCurrentPeriodStart] = useState(null);
  // Which period the screen is showing. A ref alongside the state for the
  // same reason useOwnReport keeps one: load() runs on every focus and must
  // read the coach's actual choice, not the value captured when the callback
  // was first created.
  const selectedPeriodRef = useRef(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const current = await getCurrentPeriodStart();
      setCurrentPeriodStart(current);
      const ownFinalizations = await listOwnFinalizations(profile.id);
      const pastEditable = ownFinalizations
        .filter((f) => f.pay_period_start < current && !isFinalizationLocked(f))
        .map((f) => f.pay_period_start);
      setEditablePastPeriods(pastEditable);

      // Fall back to the current period if a previously-picked past period
      // has since been re-finalized or closed out from under the selection.
      const wanted = selectedPeriodRef.current;
      const start = wanted && (wanted === current || pastEditable.includes(wanted)) ? wanted : current;
      selectedPeriodRef.current = start;

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
      // Keep the day cursor inside whichever period is now showing.
      const end = computePeriodEnd(start);
      setSelectedDate((prev) => (prev >= start && prev <= end ? prev : start));
    } catch (err) {
      toastError("Failed to load payroll", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  const selectPeriod = useCallback(
    (start) => {
      selectedPeriodRef.current = start;
      load();
    },
    [load]
  );

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

  // Only used to dim days the period hasn't reached yet — a coach can still
  // select one (logging ahead is legitimate), it just reads as not-yet.
  const today = todayInBoise();

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
  // Reached by tapping a line item inside the Other panel itself now — the
  // items are listed there directly, so there's no separate list popup to
  // close first.
  const openEditOther = (item) => {
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

  // The sheet's rows are what set the count now — adding or removing one
  // there moves the tile's counter with it, so this writes both the notes
  // and the new count in a single upsert and mirrors the count back into
  // local state. Mirroring matters: the counter autosave diffs pending vs.
  // saved, and leaving the two out of step would schedule a redundant write
  // of the value we just persisted.
  const handleSaveNames = async (joinedNames, rowCount) => {
    const kind = namesPopup.kind;
    const fields =
      kind === "welcome"
        ? { welcome_sessions: rowCount, welcome_notes: joinedNames }
        : kind === "strategy"
          ? { strategy_sessions: rowCount, strategy_notes: joinedNames }
          : { programs_written: rowCount, program_notes: joinedNames };
    const date = selectedDate;
    const saved = await persistDay(date, () => upsertCoreEntryFields(profile.id, periodStart, date, coreRowRef.current, fields));
    if (saved && date === selectedDate) {
      coreRowRef.current = saved;
      if (kind === "welcome") setPendingWelcome(rowCount);
      else if (kind === "strategy") setPendingStrategy(rowCount);
      else setPendingPrograms(rowCount);
    }
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
  const filled = [
    pendingGroup > 0,
    pendingPrograms > 0,
    pendingWelcome > 0,
    pendingStrategy > 0,
    partition.spcSessions.length > 0,
    partition.otherItems.length > 0,
    Boolean(partition.core?.admin_hours),
    Boolean(partition.core?.ops_hours),
  ];
  const filledCount = filled.filter(Boolean).length;
  const hasDayData = filledCount > 0;

  const spcState = tileState(partition.spcSessions.length > 0, daySubmitted);
  const adminHoursState = tileState(Boolean(partition.core?.admin_hours), daySubmitted);
  const opsHoursState = tileState(Boolean(partition.core?.ops_hours), daySubmitted);

  return (
    <CoachShell>
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <ScrollView className="flex-1 px-8 pt-8" contentContainerStyle={{ paddingBottom: 40 }}>
          {Platform.OS !== "web" ? (
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/more"))} className="mb-4 self-start">
              <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
            </Pressable>
          ) : null}
          {/* Period money sits with the title rather than in a band of its
              own below the tabs — it's the one number a coach opens this
              screen wanting, and pairing it with the title buys back a whole
              row of vertical space on a phone. */}
          <View className="flex-row items-end justify-between">
            <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
              Payroll
            </Text>
            {!loading ? (
              <View className="items-end">
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: colors.primaryOnWhite }}>{formatMoney(totals.total)}</Text>
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 10, color: "#a8a29e", marginTop: 2 }}>
                  {formatDateRange(periodStart, periodEnd)} · {closed ? "closed" : locked ? "finalized" : "open"}
                </Text>
              </View>
            ) : null}
          </View>
          <PayrollTabBar active="entries" />

          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              {/* Only appears when an admin has actually sent a past period
                  back. Until this existed, a coach asked to fix an entry
                  after the period rolled over had no screen that could
                  reach it. */}
              {editablePastPeriods.length > 0 ? (
                <View className="mb-5 flex-row flex-wrap items-center" style={{ gap: 8 }}>
                  <Text className="text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                    Editing:
                  </Text>
                  {[currentPeriodStart, ...editablePastPeriods].filter(Boolean).map((start) => {
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
                          style={{ fontFamily: active ? fonts.sansSemiBold : fonts.sansMedium, color: active ? colors.primaryOnWhite : "#78716c" }}
                        >
                          {formatDateMD(start)} – {formatDateMD(computePeriodEnd(start))}
                          {start === currentPeriodStart ? " · current" : " · sent back"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {finalization?.send_back_note && !locked ? (
                <View className="mb-5 rounded-xl border p-4" style={{ borderColor: "#f0ddd2", backgroundColor: "#fdf6f2" }}>
                  <Text className="mb-1 text-xs" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
                    Sent back for changes
                  </Text>
                  <Text style={{ fontFamily: fonts.sans, color: "#44403c" }}>{finalization.send_back_note}</Text>
                </View>
              ) : null}

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
                  <View className="mx-auto w-full" style={{ maxWidth: 460 }}>
                    <PayrollDateNav
                      selectedDate={selectedDate}
                      onSelectDate={setSelectedDate}
                      periodStart={periodStart}
                      periodEnd={periodEnd}
                      datesWithEntries={datesWithEntries}
                      submittedDates={submittedDates}
                      today={today}
                    />

                    {/* Names the day the tiles below belong to, and says in
                        words what the strip's dot says in colour. */}
                    <View className="mb-2 mt-3 flex-row items-center justify-between">
                      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#44403c" }}>{formatDayLabel(selectedDate)}</Text>
                      {daySubmitted ? (
                        <View className="flex-row items-center" style={{ gap: 5 }}>
                          <View
                            className="items-center justify-center"
                            style={{ width: 14, height: 14, borderRadius: 99, backgroundColor: "#4d6142" }}
                          >
                            <Text style={{ fontSize: 9, color: "white", fontFamily: fonts.sansBold }}>✓</Text>
                          </View>
                          <Text style={{ fontSize: 11, fontFamily: fonts.sansSemiBold, color: "#4d6142" }}>Submitted</Text>
                        </View>
                      ) : (
                        <View className="flex-row items-center" style={{ gap: 5 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 99, backgroundColor: hasDayData ? "#c98a6b" : "#d6cec7" }} />
                          <Text style={{ fontSize: 11, fontFamily: fonts.sansMedium, color: "#a8a29e" }}>
                            {hasDayData ? "Not submitted" : "Nothing logged"}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View className="mb-2.5 flex-row" style={{ gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <CounterTile
                          label="Group"
                          value={pendingGroup}
                          state={tileState(pendingGroup > 0, daySubmitted)}
                          onIncrement={() => setPendingGroup((v) => v + 1)}
                          onDecrement={() => setPendingGroup((v) => Math.max(0, v - 1))}
                        />
                      </View>
                      {canSpc ? (
                        <View style={{ flex: 1 }}>
                          <PayrollTile
                            state={spcState}
                            label="SPC"
                            chipCount={partition.spcSessions.length}
                            onChipPress={() => setSpcListOpen(true)}
                            value={String(partition.spcSessions.length)}
                            control={<TileButton icon="+" tone={tileTone(spcState).control} onPress={openNewSpc} accessibilityLabel="Log an SPC session" />}
                            caption={<CaptionLink text={spcCaption(partition.spcSessions)} state={spcState} onPress={openNewSpc} />}
                          />
                        </View>
                      ) : null}
                    </View>

                    {canSpc ? (
                      <View className="mb-2.5">
                        <CounterTile
                          label="Programs written"
                          value={pendingPrograms}
                          state={tileState(pendingPrograms > 0, daySubmitted)}
                          onIncrement={() => setPendingPrograms((v) => v + 1)}
                          onDecrement={() => setPendingPrograms((v) => Math.max(0, v - 1))}
                          caption={
                            namesText(pendingPrograms, partition.core?.program_notes) ? (
                              <CaptionLink
                                text={namesText(pendingPrograms, partition.core?.program_notes)}
                                state={tileState(pendingPrograms > 0, daySubmitted)}
                                onPress={() => setNamesPopup({ open: true, kind: "programs" })}
                              />
                            ) : null
                          }
                        />
                      </View>
                    ) : null}

                    <View className="mb-2.5 flex-row" style={{ gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <CounterTile
                          label="Welcome"
                          value={pendingWelcome}
                          state={tileState(pendingWelcome > 0, daySubmitted)}
                          onIncrement={() => setPendingWelcome((v) => v + 1)}
                          onDecrement={() => setPendingWelcome((v) => Math.max(0, v - 1))}
                          caption={
                            namesText(pendingWelcome, partition.core?.welcome_notes) ? (
                              <CaptionLink
                                text={namesText(pendingWelcome, partition.core?.welcome_notes)}
                                state={tileState(pendingWelcome > 0, daySubmitted)}
                                onPress={() => setNamesPopup({ open: true, kind: "welcome" })}
                              />
                            ) : null
                          }
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <CounterTile
                          label="Strategy"
                          value={pendingStrategy}
                          state={tileState(pendingStrategy > 0, daySubmitted)}
                          onIncrement={() => setPendingStrategy((v) => v + 1)}
                          onDecrement={() => setPendingStrategy((v) => Math.max(0, v - 1))}
                          caption={
                            namesText(pendingStrategy, partition.core?.strategy_notes) ? (
                              <CaptionLink
                                text={namesText(pendingStrategy, partition.core?.strategy_notes)}
                                state={tileState(pendingStrategy > 0, daySubmitted)}
                                onPress={() => setNamesPopup({ open: true, kind: "strategy" })}
                              />
                            ) : null
                          }
                        />
                      </View>
                    </View>

                    <View className="mb-2.5 flex-row" style={{ gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <PayrollTile
                          state={adminHoursState}
                          label="Admin hours"
                          onPress={() => setHoursPopup({ open: true, kind: "admin" })}
                          value={<HoursValue decimal={partition.core?.admin_hours} tone={tileTone(adminHoursState)} />}
                          control={
                            <TileButton
                              icon="✎"
                              variant="square"
                              tone={tileTone(adminHoursState).control}
                              onPress={() => setHoursPopup({ open: true, kind: "admin" })}
                              accessibilityLabel="Log admin hours"
                            />
                          }
                          caption={partition.core?.admin_hours ? null : "Tap to log"}
                        />
                      </View>
                      {canOps ? (
                        <View style={{ flex: 1 }}>
                          <PayrollTile
                            state={opsHoursState}
                            label="Ops hours"
                            onPress={() => setHoursPopup({ open: true, kind: "ops" })}
                            value={<HoursValue decimal={partition.core?.ops_hours} tone={tileTone(opsHoursState)} />}
                            control={
                              <TileButton
                                icon="✎"
                                variant="square"
                                tone={tileTone(opsHoursState).control}
                                onPress={() => setHoursPopup({ open: true, kind: "ops" })}
                                accessibilityLabel="Log ops hours"
                              />
                            }
                            caption={partition.core?.ops_hours ? null : "Tap to log"}
                          />
                        </View>
                      ) : null}
                    </View>

                    <PayrollOtherRow
                      otherRates={rates.otherRates.filter((r) => r.active)}
                      items={partition.otherItems}
                      onOpenNewItem={handleConfirmOtherRow}
                      onEditItem={openEditOther}
                      state={tileState(partition.otherItems.length > 0, daySubmitted)}
                    />
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
              borderTopColor: daySubmitted ? "#dfe5d6" : "#ece7e1",
              backgroundColor: daySubmitted ? "#eef1e7" : "white",
              paddingHorizontal: 20,
              paddingTop: daySubmitted ? 14 : 11,
              paddingBottom: 20,
            }}
          >
            <View className="mx-auto w-full" style={{ maxWidth: 460 }}>
              {daySubmitted ? (
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <View className="items-center justify-center" style={{ width: 20, height: 20, borderRadius: 99, backgroundColor: "#4d6142" }}>
                      <Text style={{ fontSize: 12, color: "white", fontFamily: fonts.sansBold }}>✓</Text>
                    </View>
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#4d6142" }}>
                      {formatDayLabel(selectedDate, { short: true })} submitted
                    </Text>
                  </View>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: "#4d6142" }}>{formatMoney(dayTotal)}</Text>
                </View>
              ) : (
                <>
                  <View className="mb-2.5 flex-row items-center justify-between">
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11.5, color: "#78716c" }}>
                      {formatDayLabel(selectedDate, { short: true })}
                      {filledCount ? ` · ${filledCount} item${filledCount === 1 ? "" : "s"}` : ""}
                    </Text>
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: colors.primaryOnWhite }}>{formatMoney(dayTotal)}</Text>
                  </View>
                  <Pressable
                    onPress={handleSubmitDay}
                    disabled={!hasDayData || submitting}
                    className="items-center"
                    style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, opacity: !hasDayData || submitting ? 0.45 : 1 }}
                  >
                    <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }}>
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
        subtitle={formatDayLabel(selectedDate)}
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
      <NamesListPopup
        visible={namesPopup.open}
        onClose={() => setNamesPopup({ open: false, kind: null })}
        title={
          namesPopup.kind === "welcome" ? "Welcome sessions for" : namesPopup.kind === "strategy" ? "Strategy sessions for" : "Programs written for"
        }
        subtitle={formatDayLabel(selectedDate)}
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
        title={hoursPopup.kind === "admin" ? "Admin hours" : "Ops hours"}
        subtitle={formatDayLabel(selectedDate)}
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
