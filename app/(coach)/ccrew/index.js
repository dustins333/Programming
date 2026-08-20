import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CoachShell, MOBILE_BREAKPOINT } from "../../../components/CoachShell";
import OutputBlock from "../../../components/ccrew/OutputBlock";
import StatTile from "../../../components/ccrew/StatTile";
import RosterRow from "../../../components/ccrew/RosterRow";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listMembers, listPeriods, listQualifyingRecords, getPeriodRecords } from "../../../lib/ccrew/periods";
import { computeStreaks, buildOutputBlock, topDogs } from "../../../lib/ccrew/streaks";
import { periodLabel, previousPeriod } from "../../../lib/ccrew/months";
import { monthStats } from "../../../lib/ccrew/stats";
import { todayInBoise } from "../../../lib/boiseDate";
import { colors, fonts } from "../../../lib/theme";
import { toastError } from "../../../lib/toast";

const isWeb = Platform.OS === "web";

function Section({ title, subtitle, children, right }) {
  return (
    <View className="mb-6">
      <View className="mb-3 flex-row items-end justify-between gap-3">
        <View className="flex-1">
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, color: "#44403c" }}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 2 }}>{subtitle}</Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

function MonthPicker({ periods, value, onChange }) {
  if (!periods.length) return null;
  if (isWeb) {
    return (
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: fonts.sans, fontSize: 14, padding: "8px 10px", borderRadius: 8, border: "1px solid #d6d3d1", background: "#fff" }}
      >
        {periods.map((p) => (
          <option key={p.period} value={p.period}>{periodLabel(p.period)}</option>
        ))}
      </select>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
      {periods.map((p) => {
        const active = p.period === value;
        return (
          <Pressable
            key={p.period}
            onPress={() => onChange(p.period)}
            className="mx-1 rounded-full border px-3 py-1.5"
            style={{ backgroundColor: active ? colors.primary : "#fff", borderColor: active ? colors.primary : "#e7e5e4" }}
          >
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: active ? "#fff" : "#44403c" }}>
              {periodLabel(p.period)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}


export default function CcrewScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < MOBILE_BREAKPOINT;
  const isAdmin = profile?.role === "admin";

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [members, setMembers] = useState([]);
  const [qualifying, setQualifying] = useState([]);
  const [selected, setSelected] = useState(null);
  const [monthRecords, setMonthRecords] = useState([]);
  const [monthLoading, setMonthLoading] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [p, m, q] = await Promise.all([listPeriods(), listMembers(), listQualifyingRecords()]);
      setPeriods(p);
      setMembers(m);
      setQualifying(q);
      setSelected((cur) => (cur && p.some((x) => x.period === cur) ? cur : p[0]?.period || null));
    } catch (err) {
      setLoadError(err.message || "Couldn't load CCrew.");
    } finally {
      setReady(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadMonth = useCallback(async (period) => {
    if (!period) { setMonthRecords([]); return; }
    setMonthLoading(true);
    try {
      setMonthRecords(await getPeriodRecords(period));
    } catch (err) {
      toastError("Couldn't load that month", err);
      setMonthRecords([]);
    } finally {
      setMonthLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadMonth(selected); }, [selected, loadMonth]));

  const allPeriods = useMemo(() => periods.map((p) => p.period).slice().sort(), [periods]);

  // Streaks are computed on read from the records, never stored, so they
  // can't drift out of sync with the months themselves.
  const streaksByMember = useMemo(() => {
    const byMember = new Map();
    for (const r of qualifying) {
      if (!byMember.has(r.member_id)) byMember.set(r.member_id, []);
      byMember.get(r.member_id).push(r.period);
    }
    const out = new Map();
    for (const m of members) out.set(m.id, computeStreaks(byMember.get(m.id) || [], allPeriods));
    return out;
  }, [qualifying, members, allPeriods]);

  const monthEntries = useMemo(
    () => monthRecords.map((r) => ({
      name: r.member?.name || "",
      qualified: r.qualified,
      tier: r.tier,
      attendance: r.attendance,
      target: r.target,
      memberId: r.member_id,
    })),
    [monthRecords]
  );

  const block = useMemo(
    () => buildOutputBlock(monthEntries, { periodLabel: periodLabel(selected) }),
    [monthEntries, selected]
  );

  const dogs = useMemo(() => {
    const people = members
      .filter((m) => m.is_active)
      .map((m) => ({ name: m.name, ...(streaksByMember.get(m.id) || { lifetime: 0 }) }));
    return topDogs(people, allPeriods);
  }, [members, streaksByMember, allPeriods]);

  const roster = useMemo(() => {
    const recordByMember = new Map(monthRecords.map((r) => [r.member_id, r]));
    return members
      .filter((m) => m.is_active)
      .map((m) => {
        const s = streaksByMember.get(m.id) || { lifetime: 0, current: 0, best: 0 };
        const rec = recordByMember.get(m.id);
        return {
          id: m.id,
          name: m.name,
          ...s,
          thisMonth: rec
            ? {
                attendance: rec.attendance,
                target: rec.target,
                // What their package commits them to, which for staff is not
                // the same as the target they were judged against.
                packageTarget: rec.package_target,
                qualified: rec.qualified,
                tier: rec.tier,
              }
            : null,
        };
      })
      .sort((a, b) => b.lifetime - a.lifetime || b.current - a.current || a.name.localeCompare(b.name));
  }, [members, streaksByMember, monthRecords]);

  const stats = useMemo(() => {
    const q = monthEntries.filter((e) => e.qualified);
    const periodRow = periods.find((p) => p.period === selected);
    return monthStats({
      qualified: q.length,
      tier3: q.filter((e) => e.tier === 3).length,
      tier2: q.filter((e) => e.tier === 2).length,
      // Null for a backfilled month — the historical sheets never recorded
      // the roster, so there is no honest denominator (see 0069).
      total: periodRow?.roster_count ?? null,
    });
  }, [monthEntries, periods, selected]);

  // What Terra actually opens this page to do on the 1st of the month. The
  // header button alone was easy to miss next to a page of numbers.
  const nextToUpload = useMemo(() => {
    const done = new Set(periods.map((p) => p.period));
    const last = previousPeriod(todayInBoise());
    return done.has(last) ? null : last;
  }, [periods]);

  if (!ready) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.canvas }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center p-6" style={{ backgroundColor: colors.canvas }}>
          <Text className="mb-3 text-center" style={{ fontFamily: fonts.sans, fontSize: 14, color: "#b23a22" }}>
            {loadError}
          </Text>
          <Pressable onPress={load} className="rounded-lg px-4 py-2" style={{ backgroundColor: colors.primary }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#fff" }}>Retry</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ padding: compact ? 16 : 28, maxWidth: 1100 }}>
        <View className="mb-5 flex-row flex-wrap items-center justify-between gap-3">
          <View>
            <Text style={{ fontFamily: fonts.display, fontSize: 28, color: "#44403c" }}>CCrew</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>
              Committed Crew — 80% of the sessions your package commits you to
            </Text>
          </View>
          {isAdmin ? (
            <Pressable
              onPress={() => router.push("/(coach)/ccrew/upload")}
              className="flex-row items-center gap-2 rounded-lg px-4 py-2.5"
              style={{ backgroundColor: colors.primary }}
            >
              <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#fff" }}>Upload a month</Text>
            </Pressable>
          ) : null}
        </View>

        {!periods.length ? (
          <View className="rounded-2xl border bg-white p-8" style={{ borderColor: "#ece7e1" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#44403c" }}>No months yet</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted, marginTop: 6 }}>
              {isAdmin
                ? "Export a full calendar month from Kilo, then upload it here to score it."
                : "Terra hasn't uploaded a month yet. Once she does, the wall list shows up here."}
            </Text>
            {isAdmin ? (
              <Pressable
                onPress={() => router.push("/(coach)/ccrew/upload")}
                className="mt-4 flex-row items-center gap-2 self-start rounded-lg px-4 py-2.5"
                style={{ backgroundColor: colors.primary }}
              >
                <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#fff" }}>Upload a month</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            {isAdmin && nextToUpload ? (
              <Pressable
                onPress={() => router.push({ pathname: "/(coach)/ccrew/upload", params: { period: nextToUpload } })}
                className="mb-5 flex-row items-center gap-3 rounded-2xl border p-4"
                style={{ backgroundColor: "#fdf6f2", borderColor: "#f0ddd2" }}
              >
                <Ionicons name="cloud-upload" size={20} color={colors.primaryOnWhite} />
                <View className="flex-1">
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.primaryOnWhite }}>
                    {periodLabel(nextToUpload)} hasn't been uploaded yet
                  </Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted }}>
                    Export that month from Kilo, then drop the CSV in here.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.primaryOnWhite} />
              </Pressable>
            ) : null}

            <View className="mb-5 flex-row flex-wrap items-center gap-3">
              <MonthPicker periods={periods} value={selected} onChange={setSelected} />
              {monthLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </View>

            <View className="mb-6 flex-row flex-wrap gap-2.5">
              <StatTile label="Committed" value={stats.committed} share={stats.committedShare} tone="good" />
              <StatTile label="3x group" value={stats.tier3} share={stats.tier3Share} />
              <StatTile label="2x group" value={stats.tier2} share={stats.tier2Share} />
              <StatTile
                label="Total members"
                value={stats.totalKnown ? stats.total : "—"}
                hint={stats.totalKnown ? null : "not recorded for this month"}
              />
            </View>

            <Section title="The list" subtitle="3x group first, then 2x, alphabetical within each.">
              <OutputBlock text={block} subtitle={periodLabel(selected)} />
            </Section>

            <Section
              title="Top Dogs"
              subtitle={`Perfect record — every one of the ${allPeriods.length} months processed.`}
            >
              <View className="rounded-2xl border bg-white p-4" style={{ borderColor: "#ece7e1" }}>
                {dogs.length ? (
                  dogs.map((d) => (
                    <View key={d.name} className="flex-row items-center gap-2 py-1.5">
                      <Ionicons name="trophy" size={15} color={colors.primary} />
                      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: "#44403c" }}>{d.name}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>
                    Nobody has a perfect record across every month yet.
                  </Text>
                )}
              </View>
            </Section>

            <Section title="Everyone" subtitle="Lifetime months first, streak second.">
              <View className="rounded-2xl border bg-white px-4 py-1" style={{ borderColor: "#ece7e1" }}>
                {roster.map((row) => (
                  <RosterRow key={row.id} row={row} compact={compact} />
                ))}
              </View>
            </Section>
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
