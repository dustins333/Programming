import { useState, useCallback, useRef } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { Redirect, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listPayPeriodOptions, getCurrentPeriodStart, listStaff } from "../../../../lib/payroll/periods";
import { getRateMapsForPeriod } from "../../../../lib/payroll/rates";
import { listEntriesForPeriodAllStaff } from "../../../../lib/payroll/entries";
import { listFinalizationsForPeriod, reviewState, REVIEW_APPROVED, REVIEW_SUBMITTED, REVIEW_SENT_BACK } from "../../../../lib/payroll/finalizations";
import { computeTotalsByStaff, computeTotals, formatMoney, formatQuantity } from "../../../../lib/payroll/calc";
import { buildPeriodCsv, downloadCsv } from "../../../../lib/payroll/csvExport";
import { formatDateRange, formatDateMDY } from "../../../../lib/formatDate";
import { dateInBoise } from "../../../../lib/boiseDate";
import { toastError } from "../../../../lib/toast";
import { fonts, colors } from "../../../../lib/theme";
import { CoachShell } from "../../../../components/CoachShell";
import { AdminPayrollTabBar } from "../../../../components/AdminPayrollTabBar";
import { CategoryBreakdown } from "../../../../components/payroll/PayrollReportPieces";

// Below this the panel stacks under the list rather than beside it.
const TWO_PANE_MIN = 1100;
const PANEL_WIDTH = 380;

// The list has two axes. `BY_COACH`/a category key puts one row per coach on
// screen; `BY_TYPE` puts one row per pay type. Same bars, same reading —
// "who is carrying the load" and "what is the money actually going on" are
// the same question asked down two different columns.
const BY_COACH = "total";
const BY_TYPE = "byType";

// Each pay type, as both a measure (one column of computeTotals, for the
// per-coach views) and a row (the same field read off the whole team's
// totals, for the by-type view). Every key is already on computeTotals'
// output — no extra query for any of this, it's all loaded.
const PAY_TYPES = [
  { key: "group", label: "Group", amount: (t) => t.groupAmount, count: (t) => t.groupCount, unit: "sessions" },
  { key: "spc", label: "SPC", amount: (t) => t.spcAmount, count: (t) => t.spcSessions, unit: "sessions" },
  { key: "programs", label: "Programs", amount: (t) => t.programsAmount, count: (t) => t.programsCount, unit: "written" },
  { key: "welcome", label: "Welcome", amount: (t) => t.welcomeAmount, count: (t) => t.welcomeCount, unit: "sessions" },
  { key: "strategy", label: "Strategy", amount: (t) => t.strategyAmount, count: (t) => t.strategyCount, unit: "sessions" },
  { key: "admin", label: "Admin", amount: (t) => t.adminAmount, count: (t) => t.adminHours, unit: "hrs" },
  { key: "ops", label: "Ops", amount: (t) => t.opsAmount, count: (t) => t.opsHours, unit: "hrs" },
  { key: "other", label: "Other", amount: (t) => t.otherAmount },
  { key: "custom", label: "Extras", amount: (t) => t.customAmount },
];

const SHARE_MODES = [{ key: BY_COACH, label: "By coach", amount: (t) => t.total }, ...PAY_TYPES];

const MODE_PILLS = [
  { key: BY_COACH, label: "By coach" },
  { key: BY_TYPE, label: "By type" },
  ...PAY_TYPES.map((t) => ({ key: t.key, label: t.label })),
];

function ShareModeTabs({ value, onChange }) {
  return (
    <View className="mb-3 flex-row flex-wrap items-center" style={{ gap: 6 }}>
      {MODE_PILLS.map((m, i) => {
        const active = m.key === value;
        return (
          <View key={m.key} className="flex-row items-center" style={{ gap: 6 }}>
            <Pressable
              onPress={() => onChange(m.key)}
              style={{
                borderRadius: 99,
                borderWidth: 1,
                borderColor: active ? colors.primary : "#ece7e1",
                backgroundColor: active ? colors.primary : "white",
                paddingVertical: 6,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ fontFamily: active ? fonts.sansBold : fonts.sansMedium, fontSize: 12, color: active ? "white" : "#78716c" }}>
                {m.label}
              </Text>
            </Pressable>
            {/* The first two pills change what the rows ARE; everything
                after narrows the coach list to one type. The rule keeps
                that from reading as one flat list of ten equal options. */}
            {i === 1 ? <View style={{ width: 1, height: 18, backgroundColor: "#e7e5e4", marginHorizontal: 3 }} /> : null}
          </View>
        );
      })}
    </View>
  );
}

// One bar row, whether the row is a coach or a pay type.
function BarRow({ label, amount, count, unit, leaderAmount, selected, onPress }) {
  const fraction = leaderAmount > 0 ? amount / leaderAmount : 0;
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center px-5 py-3"
      style={{ gap: 16, backgroundColor: selected ? "#fdf6f2" : "white", borderTopWidth: 1, borderTopColor: "#f4f0ec" }}
    >
      <Text
        numberOfLines={1}
        style={{ width: 150, fontFamily: selected ? fonts.sansBold : fonts.sansSemiBold, fontSize: 12.5, color: selected ? "#8a5140" : "#2a211c" }}
      >
        {label}
      </Text>
      <View style={{ flex: 1, minWidth: 80 }}>
        <View style={{ height: 8, borderRadius: 99, backgroundColor: "#f4f0ec", overflow: "hidden" }}>
          <View
            style={{
              // A 2% floor so somebody with a real but tiny amount still
              // shows a mark; a genuine zero draws nothing at all.
              width: amount > 0 ? `${Math.max(2, Math.round(fraction * 100))}%` : "0%",
              height: "100%",
              borderRadius: 99,
              backgroundColor: selected ? colors.primary : "#e2c9bb",
            }}
          />
        </View>
      </View>
      <View style={{ width: 108, alignItems: "flex-end" }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: amount ? "#2a211c" : "#c9c4bd" }}>
          {amount ? formatMoney(amount) : "—"}
        </Text>
        {/* The count is the thing being reviewed — "9 SPC sessions" is
            checkable in a way "$584" isn't. */}
        {count ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e", marginTop: 1 }}>
            {formatQuantity(count)} {unit}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function BandFigure({ label, value, sub }) {
  return (
    <View>
      <Text className="uppercase" style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: "#a99f96" }}>
        {label}
      </Text>
      <Text className="mt-1" style={{ fontFamily: fonts.sansBold, fontSize: 21, color: "white" }}>
        {value}
      </Text>
      {sub ? <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#8d8279", marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}

const STATE_LABEL = {
  [REVIEW_APPROVED]: { text: "approved", color: "#4d6142" },
  [REVIEW_SUBMITTED]: { text: "submitted, not yet approved", color: "#8a5a2e" },
  [REVIEW_SENT_BACK]: { text: "sent back", color: "#b23a22" },
};

export default function AdminPayrollReportWeb() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { width } = useWindowDimensions();
  const twoPane = width >= TWO_PANE_MIN;

  const [periodOptions, setPeriodOptions] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [entries, setEntries] = useState([]);
  const [finalizations, setFinalizations] = useState([]);
  const [rateMaps, setRateMaps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openStaffKey, setOpenStaffKey] = useState(null);
  const [shareMode, setShareMode] = useState("total");
  const [staff, setStaff] = useState([]);

  const selectedPeriodRef = useRef(null);

  const loadForPeriod = useCallback(async (periodStart, options) => {
    const periodRow = (options || []).find((p) => p.start_date === periodStart);
    const [rows, maps, finals] = await Promise.all([
      listEntriesForPeriodAllStaff(periodStart),
      getRateMapsForPeriod(periodRow),
      listFinalizationsForPeriod(periodStart),
    ]);
    setEntries(rows);
    setRateMaps(maps);
    setFinalizations(finals);
  }, []);

  const load = useCallback(async () => {
    try {
      const [options, current, staffRows] = await Promise.all([listPayPeriodOptions(), getCurrentPeriodStart(), listStaff()]);
      setPeriodOptions(options);
      setStaff(staffRows);
      const target = selectedPeriodRef.current || current;
      selectedPeriodRef.current = target;
      setSelectedPeriod(target);
      await loadForPeriod(target, options);
    } catch (err) {
      toastError("Failed to load report", err);
    } finally {
      setLoading(false);
    }
  }, [loadForPeriod]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (profile && !isAdmin) {
    return <Redirect href="/(coach)/payroll" />;
  }

  const changePeriod = async (periodStart) => {
    selectedPeriodRef.current = periodStart;
    setSelectedPeriod(periodStart);
    setOpenStaffKey(null);
    setLoading(true);
    try {
      await loadForPeriod(periodStart, periodOptions);
    } finally {
      setLoading(false);
    }
  };

  const index = periodOptions.findIndex((p) => p.start_date === selectedPeriod);
  const currentPeriod = periodOptions[index];
  // listPayPeriodOptions is newest-first, so stepping back through time is
  // a step forward through the array.
  const stepPeriod = (delta) => {
    const next = periodOptions[index + delta];
    if (next) changePeriod(next.start_date);
  };

  const isByType = shareMode === BY_TYPE;
  const mode = SHARE_MODES.find((m) => m.key === shareMode) ?? SHARE_MODES[0];
  // Sorted by whatever the bars are currently measuring, not by name — the
  // point of this screen is who's carrying what, and the bars only read as
  // a ranking if they're ordered by the same figure they draw.
  const allStaffTotals = rateMaps ? computeTotalsByStaff(entries, rateMaps).sort((a, b) => mode.amount(b.totals) - mode.amount(a.totals)) : [];
  const grandTotal = allStaffTotals.reduce((sum, s) => sum + s.totals.total, 0);
  const modeTotal = allStaffTotals.reduce((sum, s) => sum + mode.amount(s.totals), 0);

  // The by-type rows are the same nine fields read off the WHOLE team's
  // totals rather than one coach's, so "SPC totals, group totals" sit side
  // by side on the same bars as the coaches do. Empty types are dropped —
  // a gym that never logs Ops shouldn't carry a permanent zero row.
  const teamTotals = rateMaps ? computeTotals(entries, rateMaps) : null;
  const typeRows = teamTotals
    ? PAY_TYPES.map((t) => ({
        key: t.key,
        label: t.label,
        amount: t.amount(teamTotals),
        count: t.count ? t.count(teamTotals) : null,
        unit: t.unit,
      }))
        .filter((r) => r.amount)
        .sort((a, b) => b.amount - a.amount)
    : [];

  const rows = isByType
    ? typeRows
    : allStaffTotals.map((s) => ({
        key: s.key,
        label: s.staffName,
        amount: mode.amount(s.totals),
        count: mode.count ? mode.count(s.totals) : null,
        unit: mode.unit,
      }));
  const leaderAmount = rows.length ? rows[0].amount : 0;
  const listTotal = isByType ? typeRows.reduce((sum, r) => sum + r.amount, 0) : modeTotal;

  // Owner vs staff is the admin/coach split, the same one the close flow
  // freezes into pay_periods at close time.
  const roleByKey = new Map();
  for (const s of staff) {
    if (s.id) roleByKey.set(s.id, s.role);
    if (s.email) roleByKey.set(s.email, s.role);
  }
  let ownerPay = 0;
  let staffPay = 0;
  for (const row of allStaffTotals) {
    if (roleByKey.get(row.key) === "admin") ownerPay += row.totals.total;
    else staffPay += row.totals.total;
  }
  const taxesPaid = currentPeriod?.taxes_paid != null ? Number(currentPeriod.taxes_paid) : null;
  const openStaff = allStaffTotals.find((s) => s.key === openStaffKey) ?? allStaffTotals[0];
  const openStaffEntries = openStaff ? entries.filter((e) => (e.user_id || e.staff_email) === openStaff.key) : [];
  const openFinalization = openStaff ? finalizations.find((f) => f.user_id === openStaff.key) : null;
  const openState = openFinalization ? STATE_LABEL[reviewState(openFinalization)] : null;
  const openDays = new Set(openStaffEntries.map((e) => e.entry_date)).size;

  const handleExport = () => {
    const ok = downloadCsv(`payroll-${selectedPeriod}.csv`, buildPeriodCsv(entries, rateMaps));
    if (!ok) toastError("CSV export is web-only — open this page in a browser");
  };

  return (
    <CoachShell>
      <ScrollView style={{ backgroundColor: colors.canvas }} className="flex-1 px-8 pt-8" contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Payroll — Admin
        </Text>
        <AdminPayrollTabBar active="report" />

        <View
          className="mb-3.5 flex-row flex-wrap items-center rounded-2xl px-6 py-5"
          style={{ backgroundColor: "#3b3531", gap: 32 }}
        >
          <View>
            <Text className="uppercase" style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: "#a99f96" }}>
              Period
            </Text>
            <View className="mt-1 flex-row items-center" style={{ gap: 12 }}>
              <Pressable onPress={() => stepPeriod(1)} disabled={index >= periodOptions.length - 1} hitSlop={10} style={{ opacity: index >= periodOptions.length - 1 ? 0.4 : 1 }}>
                <Ionicons name="chevron-back" size={17} color="#a99f96" />
              </Pressable>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 21, color: "white" }}>
                {currentPeriod ? formatDateRange(currentPeriod.start_date, currentPeriod.end_date) : ""}
              </Text>
              <Pressable onPress={() => stepPeriod(-1)} disabled={index <= 0} hitSlop={10} style={{ opacity: index <= 0 ? 0.4 : 1 }}>
                <Ionicons name="chevron-forward" size={17} color="#a99f96" />
              </Pressable>
            </View>
          </View>

          <BandFigure label="Owner pay" value={formatMoney(ownerPay)} />
          <BandFigure label="Staff pay" value={formatMoney(staffPay)} sub={`${allStaffTotals.length} logging`} />
          {/* Taxes are entered on Closed periods after a period closes, so
              an open one legitimately has none yet — "—" rather than a $0.00
              that would read as "no tax on this payroll". */}
          <BandFigure label="Taxes" value={taxesPaid != null ? formatMoney(taxesPaid) : "—"} sub={taxesPaid == null ? "set at close" : null} />

          <View style={{ flex: 1, minWidth: 140 }}>
            <Text className="uppercase" style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: "#a99f96" }}>
              Grand total
            </Text>
            <Text className="mt-1" style={{ fontFamily: fonts.sansBold, fontSize: 21, color: "white" }}>
              {formatMoney(grandTotal + (taxesPaid ?? 0))}
            </Text>
          </View>

          <Pressable
            onPress={handleExport}
            disabled={entries.length === 0}
            style={{ borderWidth: 1, borderColor: "#6b625b", borderRadius: 9, paddingVertical: 10, paddingHorizontal: 18, opacity: entries.length === 0 ? 0.5 : 1 }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#c9beb4" }}>Export CSV</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : allStaffTotals.length === 0 ? (
          <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
            Nobody has logged anything for this period yet.
          </Text>
        ) : (
          <View className="flex-row flex-wrap items-start" style={{ gap: 14 }}>
            <View style={{ flex: 1, minWidth: 380 }}>
              <ShareModeTabs value={shareMode} onChange={setShareMode} />
              <View className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: "#ece7e1" }}>
                <View className="flex-row items-center px-5 py-3" style={{ gap: 16, backgroundColor: "#faf8f6" }}>
                  <Text className="uppercase" style={{ width: 150, fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: "#a8a29e" }}>
                    {isByType ? "Pay type" : "Staff"}
                  </Text>
                  <Text className="uppercase" style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: "#a8a29e" }}>
                    Share of {isByType || mode.key === BY_COACH ? "payroll" : mode.label.toLowerCase()}
                  </Text>
                  <Text
                    className="uppercase"
                    style={{ width: 108, textAlign: "right", fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.1, color: "#a8a29e" }}
                  >
                    {isByType || mode.key === BY_COACH ? "Total" : mode.label}
                  </Text>
                </View>
                {rows.map((r) => (
                  <BarRow
                    key={r.key}
                    label={r.label}
                    amount={r.amount}
                    count={r.count}
                    unit={r.unit}
                    leaderAmount={leaderAmount}
                    selected={!isByType && openStaff?.key === r.key}
                    // Tapping a type drills into who did it — which is
                    // exactly what that type's own pill already shows, so
                    // the two views connect instead of sitting apart.
                    onPress={() => (isByType ? setShareMode(r.key) : setOpenStaffKey(r.key))}
                  />
                ))}
                {rows.length === 0 ? (
                  <Text className="px-5 py-4" style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
                    Nothing logged in any pay type for this period.
                  </Text>
                ) : null}
                <View className="flex-row items-center px-5 py-3" style={{ gap: 16, backgroundColor: "#faf8f6", borderTopWidth: 1, borderTopColor: "#ece7e1" }}>
                  <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 11.5, color: "#78716c" }}>
                    {isByType || mode.key === BY_COACH ? "Total payroll" : `${mode.label} across the team`}
                  </Text>
                  <Text style={{ width: 108, textAlign: "right", fontFamily: fonts.sansBold, fontSize: 14, color: colors.primaryOnWhite }}>
                    {formatMoney(listTotal)}
                  </Text>
                </View>
              </View>
            </View>

            {/* An inline panel, not a bottom sheet: at a desk the whole point
                is comparing one person against the list, and a sheet covers
                the list it's supposed to be read against. Native keeps the
                sheet — see report.js. */}
            {/* By type, the panel widens to the whole team — the left list
                is already about the gym rather than one person, and this is
                the only place a category's entries can be read across
                everyone at once. */}
            {isByType ? (
              <View className="rounded-2xl border bg-white p-5" style={{ width: twoPane ? PANEL_WIDTH : "100%", borderColor: "#ece7e1" }}>
                <View className="mb-1 flex-row items-start justify-between" style={{ gap: 12 }}>
                  <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 15, color: "#2a211c" }}>Everyone</Text>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, color: colors.primaryOnWhite }}>{formatMoney(grandTotal)}</Text>
                </View>
                <Text className="mb-4" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                  {currentPeriod ? formatDateRange(currentPeriod.start_date, currentPeriod.end_date) : ""} · {allStaffTotals.length} staff
                </Text>
                <CategoryBreakdown totals={teamTotals} entries={entries} rateMaps={rateMaps} />
                <Text className="mt-3" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                  Tap a line for every entry behind it, across the team.
                </Text>
              </View>
            ) : openStaff ? (
              <View
                className="rounded-2xl border bg-white p-5"
                style={{ width: twoPane ? PANEL_WIDTH : "100%", borderColor: "#ece7e1" }}
              >
                <View className="mb-1 flex-row items-start justify-between" style={{ gap: 12 }}>
                  <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 15, color: "#2a211c" }}>{openStaff.staffName}</Text>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, color: colors.primaryOnWhite }}>{formatMoney(openStaff.totals.total)}</Text>
                </View>
                <Text className="mb-4" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                  {currentPeriod ? formatDateRange(currentPeriod.start_date, currentPeriod.end_date) : ""}
                  {openState ? (
                    <Text style={{ color: openState.color, fontFamily: fonts.sansMedium }}>
                      {" · "}
                      {openState.text}
                      {openFinalization?.approved_at ? ` ${formatDateMDY(dateInBoise(new Date(openFinalization.approved_at)))}` : ""}
                    </Text>
                  ) : (
                    " · not finalized yet"
                  )}
                </Text>

                <CategoryBreakdown totals={computeTotals(openStaffEntries, rateMaps)} entries={openStaffEntries} rateMaps={rateMaps} />

                <Text className="mt-3" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                  {openDays} day{openDays === 1 ? "" : "s"} logged · tap a line for the entries behind it
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </CoachShell>
  );
}
