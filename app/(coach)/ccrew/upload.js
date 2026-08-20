import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CoachShell, MOBILE_BREAKPOINT } from "../../../components/CoachShell";
import OutputBlock from "../../../components/ccrew/OutputBlock";
import StatTile from "../../../components/ccrew/StatTile";
import FlagGroup from "../../../components/ccrew/FlagGroup";
import PreviewRow from "../../../components/ccrew/PreviewRow";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { parseKiloCsv } from "../../../lib/ccrew/parseKilo";
import { buildPreview, droppedMembers, FLAG_KINDS } from "../../../lib/ccrew/preview";
import { buildOutputBlock } from "../../../lib/ccrew/streaks";
import { listMembers, listPeriods, listKovaUsers, commitPeriod } from "../../../lib/ccrew/periods";
import { periodLabel, previousPeriod, recentPeriods } from "../../../lib/ccrew/months";
import { canManageCcrew } from "../../../lib/ccrew/access";
import { monthStats } from "../../../lib/ccrew/stats";
import { todayInBoise } from "../../../lib/boiseDate";
import { confirmCommitCcrewPeriod } from "../../../lib/confirmDialog";
import { colors, fonts } from "../../../lib/theme";
import { toastError, toastSuccess } from "../../../lib/toast";

const isWeb = Platform.OS === "web";

export default function CcrewUploadScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < MOBILE_BREAKPOINT;

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [members, setMembers] = useState([]);
  const [kovaUsers, setKovaUsers] = useState([]);
  const [periods, setPeriods] = useState([]);

  // The CCrew page links here with the month it knows is outstanding.
  const params = useLocalSearchParams();
  const [period, setPeriod] = useState(() =>
    typeof params.period === "string" && /^\d{4}-\d{2}-01$/.test(params.period)
      ? params.period
      : previousPeriod(todayInBoise())
  );
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [committing, setCommitting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [m, u, p] = await Promise.all([listMembers(), listKovaUsers(), listPeriods()]);
      setMembers(m);
      setKovaUsers(u);
      setPeriods(p);
    } catch (err) {
      setLoadError(err.message || "Couldn't load CCrew data.");
    } finally {
      setReady(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { rows: parsed, error } = parseKiloCsv(String(reader.result || ""));
      if (error) {
        setParseError(error);
        setRows(null);
      } else {
        setParseError(null);
        setRows(parsed);
        setOverrides({});
      }
      setFileName(file.name);
    };
    reader.onerror = () => setParseError("Couldn't read that file.");
    reader.readAsText(file);
  }

  const preview = useMemo(
    () => (rows ? buildPreview({ rows, members, kovaUsers, overrides }) : null),
    [rows, members, kovaUsers, overrides]
  );

  const dropped = useMemo(() => (rows ? droppedMembers(rows, members) : []), [rows, members]);

  const block = useMemo(
    () => (preview ? buildOutputBlock(preview.entries, { periodLabel: periodLabel(period) }) : ""),
    [preview, period]
  );

  // An upload always knows its own roster — it's the whole Kilo export — so
  // unlike a backfilled month every percentage here is real.
  const stats = useMemo(
    () =>
      preview
        ? monthStats({
            qualified: preview.counts.qualified,
            tier3: preview.counts.tier3,
            tier2: preview.counts.tier2,
            total: preview.counts.roster,
          })
        : null,
    [preview]
  );

  const existing = periods.find((p) => p.period === period) || null;

  async function handleCommit() {
    if (!preview) return;
    const ok = await confirmCommitCcrewPeriod({
      label: periodLabel(period),
      qualified: preview.counts.qualified,
      roster: preview.counts.roster,
      highFlags: preview.counts.highFlags,
      replacing: existing ? existing.qualified_count : null,
      dropped: dropped.length,
    });
    if (!ok) return;
    setCommitting(true);
    try {
      await commitPeriod({
        period,
        entries: preview.entries,
        dropped,
        uploadedBy: profile?.id,
        source: "upload",
      });
      toastSuccess(`${periodLabel(period)} committed — ${preview.counts.qualified} on the wall`);
      router.replace("/(coach)/ccrew");
    } catch (err) {
      toastError("Couldn't commit that month", err);
    } finally {
      setCommitting(false);
    }
  }

  // Gated on the same rule as core.can_manage_ccrew() (0070). Waits for the
  // profile to load rather than bouncing on a null, so a slow fetch can't
  // throw someone out of a screen they're allowed to be on.
  if (profile && !canManageCcrew(profile)) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center p-8" style={{ backgroundColor: colors.canvas }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#44403c" }}>You don't have access</Text>
          <Text className="mt-2 text-center" style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>
            Uploading a month needs the Ops Hours permission, which an admin sets in Settings › Team. You can still see
            every processed month on CCrew.
          </Text>
          <Pressable onPress={() => router.replace("/(coach)/ccrew")} className="mt-4 rounded-lg px-4 py-2" style={{ backgroundColor: colors.primary }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#fff" }}>Back to CCrew</Text>
          </Pressable>
        </View>
      </CoachShell>
    );
  }

  if (!ready) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.canvas }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ padding: compact ? 16 : 28, maxWidth: 1100 }}>
        <Pressable onPress={() => router.push("/(coach)/ccrew")} className="mb-3 flex-row items-center gap-1">
          <Ionicons name="chevron-back" size={16} color={colors.primaryOnWhite} />
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.primaryOnWhite }}>CCrew</Text>
        </Pressable>

        <Text style={{ fontFamily: fonts.display, fontSize: 26, color: "#44403c" }}>Upload a month</Text>
        <Text className="mb-5" style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>
          Export a full calendar month from Kilo, 1st to last day, then pick that month here.
        </Text>

        {loadError ? (
          <View className="mb-4 rounded-xl border p-3" style={{ backgroundColor: "#fdece5", borderColor: "#f0c7b6" }}>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22" }}>{loadError}</Text>
            <Pressable onPress={load} className="mt-2 self-start rounded-lg px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#fff" }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <View className="mb-5 rounded-2xl border bg-white p-4" style={{ borderColor: "#ece7e1" }}>
          <Text className="mb-2" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>
            1. Which month is this export?
          </Text>
          {isWeb ? (
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={{ fontFamily: fonts.sans, fontSize: 14, padding: "9px 10px", borderRadius: 8, border: "1px solid #d6d3d1", background: "#fff", maxWidth: 260 }}
            >
              {recentPeriods(todayInBoise()).map((p) => (
                <option key={p} value={p}>{periodLabel(p)}</option>
              ))}
            </select>
          ) : (
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: "#44403c" }}>{periodLabel(period)}</Text>
          )}
          {existing ? (
            <Text className="mt-2" style={{ fontFamily: fonts.sans, fontSize: 12, color: "#8a5a2e" }}>
              {periodLabel(period)} is already committed ({existing.qualified_count} on the wall). Committing again replaces it.
            </Text>
          ) : null}

          <Text className="mb-2 mt-4" style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#44403c" }}>
            2. The Kilo CSV
          </Text>
          {isWeb ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                style={{ display: "none" }}
              />
              <Pressable
                onPress={() => fileInput.current?.click()}
                className="flex-row items-center gap-2 self-start rounded-lg border px-4 py-2.5"
                style={{ borderColor: colors.primary, backgroundColor: "#fdf6f2" }}
              >
                <Ionicons name="document-attach-outline" size={16} color={colors.primaryOnWhite} />
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.primaryOnWhite }}>
                  {fileName ? "Choose a different file" : "Choose CSV"}
                </Text>
              </Pressable>
              {fileName ? (
                <Text className="mt-2" style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted }}>
                  {fileName}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.muted }}>
              Uploading needs the web app — open Kova in a browser to pick the CSV.
            </Text>
          )}
          {parseError ? (
            <Text className="mt-2" style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22" }}>{parseError}</Text>
          ) : null}
        </View>

        {preview ? (
          <>
            <View className="mb-5 flex-row flex-wrap gap-2.5">
              <StatTile label="Committed" value={stats.committed} share={stats.committedShare} tone="good" />
              <StatTile label="3x group" value={stats.tier3} share={stats.tier3Share} />
              <StatTile label="2x group" value={stats.tier2} share={stats.tier2Share} />
              <StatTile
                label="Total members"
                value={stats.total}
                hint={preview.counts.newMembers ? `${preview.counts.newMembers} new` : null}
              />
              <StatTile label="Not eligible" value={preview.counts.ineligible} hint="target under 2x" />
            </View>

            {Object.keys(preview.flags).length ? (
              <View className="mb-5">
                <Text className="mb-2" style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, color: "#44403c" }}>
                  Worth a look before you commit
                </Text>
                {Object.entries(preview.flags)
                  .sort((a, b) => {
                    const order = { high: 0, medium: 1, info: 2 };
                    return order[FLAG_KINDS[a[0]].severity] - order[FLAG_KINDS[b[0]].severity];
                  })
                  .map(([kind, entries]) => (
                    <FlagGroup
                      key={kind}
                      kind={kind}
                      entries={entries}
                      kovaUsers={kovaUsers}
                      onLink={(email, userId) => setOverrides((o) => ({ ...o, [email]: userId }))}
                    />
                  ))}
              </View>
            ) : null}

            {dropped.length ? (
              <View className="mb-5 rounded-xl border p-3" style={{ backgroundColor: "#f1efed", borderColor: "#e7e5e4" }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#57534e" }}>
                  {dropped.length} {dropped.length === 1 ? "person is" : "people are"} no longer in the export
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.muted, marginTop: 3 }}>
                  Kilo only exports active members, so these have left. Committing marks them inactive and keeps every month
                  they earned: {dropped.map((d) => d.name).join(", ")}
                </Text>
              </View>
            ) : null}

            <View className="mb-5">
              <View className="mb-2 flex-row items-center justify-between">
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16, color: "#44403c" }}>Everyone in the export</Text>
                <Pressable onPress={() => setShowAll((s) => !s)}>
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.primaryOnWhite }}>
                    {showAll ? "Show only the wall" : `Show all ${preview.counts.roster}`}
                  </Text>
                </Pressable>
              </View>
              <View className="rounded-2xl border bg-white px-4 py-1" style={{ borderColor: "#ece7e1" }}>
                {preview.entries
                  .filter((e) => showAll || e.qualified)
                  .slice()
                  .sort((a, b) => (b.qualified ? 1 : 0) - (a.qualified ? 1 : 0) || b.attendance - a.attendance || a.name.localeCompare(b.name))
                  .map((e) => (
                    <PreviewRow key={e.email} e={e} compact={compact} />
                  ))}
              </View>
            </View>

            <View className="mb-5">
              <OutputBlock text={block} title="What will go on the slides" subtitle={periodLabel(period)} />
            </View>

            <Pressable
              onPress={handleCommit}
              disabled={committing}
              className="mb-10 flex-row items-center justify-center gap-2 rounded-xl py-3.5"
              style={{ backgroundColor: colors.primary, opacity: committing ? 0.5 : 1 }}
            >
              {committing ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark-circle" size={18} color="#fff" />}
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#fff" }}>
                {existing ? `Replace ${periodLabel(period)}` : `Commit ${periodLabel(period)}`}
              </Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </CoachShell>
  );
}
