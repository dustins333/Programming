import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { toastError } from "../../../lib/toast";
import { linkMemberByAuthId } from "../../../lib/programming/clients";
import { loadClientsRoster } from "../../../lib/programming/clientsRoster";
import { LinkMemberModal } from "../../../components/LinkMemberModal";
import { CoachShell, MOBILE_BREAKPOINT } from "../../../components/CoachShell";
import { ClientRosterTable, TABLE_WIDTH } from "../../../components/ClientRosterTable";
import { fonts, colors } from "../../../lib/theme";

const PAGE_SIZE = 25;

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: fonts.sans,
        fontSize: 13,
        height: 40,
        padding: "0 14px",
        borderRadius: 8,
        border: "1px solid #d9d4cd",
        color: "#44403c",
        backgroundColor: "white",
      }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// A chip carries its own count, so the size of each slice of the roster is
// legible before you click into it — the old dropdown filters hid that.
function FilterChip({ label, count, active, onPress, tone }) {
  const activeBg = tone === "urgent" ? "#fdece5" : "#3b3531";
  const activeText = tone === "urgent" ? "#b23a22" : "#ffffff";
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full border px-3.5 py-2"
      style={{
        backgroundColor: active ? activeBg : "#ffffff",
        borderColor: active ? (tone === "urgent" ? "#f0c9ba" : "#3b3531") : tone === "urgent" ? "#f0ddd2" : "#e2ddd6",
      }}
    >
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: active ? activeText : tone === "urgent" ? "#b23a22" : "#57534e" }}>
        {label}
        {count != null ? <Text style={{ fontFamily: fonts.sans, color: active ? activeText : "#a8a29e" }}>{`  ${count}`}</Text> : null}
      </Text>
    </Pressable>
  );
}

export default function ClientsWeb() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(typeof params.program === "string" ? params.program : "all");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setState(await loadClientsRoster());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A tile on the Dashboard (or any other future deep link) can pre-set the
  // filter via ?program= / ?filter= — only apply on arrival, not every
  // re-render, so a coach changing it by hand doesn't get overridden.
  useEffect(() => {
    if (typeof params.program === "string") setFilter(params.program);
  }, [params.program]);
  useEffect(() => {
    if (params.filter === "flagged") setFilter("flagged");
    if (params.filter === "quiet") setFilter("quiet");
  }, [params.filter]);

  useEffect(() => {
    setPage(1);
  }, [search, filter, sort]);

  const handleLink = async (form) => {
    try {
      await linkMemberByAuthId(form);
      await load();
    } catch (err) {
      toastError("Failed to link account", err);
      throw err;
    }
  };

  const matchesFilter = useCallback((row, key) => {
    switch (key) {
      case "all":
        return true;
      case "unassigned":
        return row.unassigned;
      case "quiet":
        return row.lastSession.days == null || row.lastSession.days >= 7;
      case "checkin-due":
        return row.checkinDue;
      case "flagged":
        return row.flagCount > 0;
      case "not-registered":
        return row.neverRegistered;
      default:
        return row.programKeys.has(key);
    }
  }, []);

  // Counts are computed against the search-filtered set, not the raw
  // roster, so a chip never promises rows a search has already excluded.
  const searched = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();
    if (!q) return state.rows;
    return state.rows.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
  }, [state, search]);

  const chips = useMemo(() => {
    const base = [{ key: "all", label: "All" }];
    (state?.programs ?? []).forEach((p) => base.push({ key: p.id, label: p.name }));
    base.push({ key: "spc", label: "SPC" }, { key: "nutrition", label: "Nutrition" }, { key: "unassigned", label: "Unassigned", tone: "urgent" });
    base.push({ key: "quiet", label: "Quiet 7+ days", tone: "urgent" }, { key: "checkin-due", label: "Check-in due", tone: "urgent" });
    return base.map((c) => ({ ...c, count: searched.filter((r) => matchesFilter(r, c.key)).length }));
  }, [state, searched, matchesFilter]);

  const filtered = useMemo(() => {
    const rows = searched.filter((r) => matchesFilter(r, filter));
    return [...rows].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "flags") return b.flagCount - a.flagCount || a.name.localeCompare(b.name);
      // Longest-quiet first — a client with no session ever sorts to the
      // very top, which is the one most likely to have been forgotten.
      const av = a.lastSession.days == null ? Number.MAX_SAFE_INTEGER : a.lastSession.days;
      const bv = b.lastSession.days == null ? Number.MAX_SAFE_INTEGER : b.lastSession.days;
      return bv - av || a.name.localeCompare(b.name);
    });
  }, [searched, filter, sort, matchesFilter]);

  const { width } = useWindowDimensions();
  const isNarrow = width < MOBILE_BREAKPOINT;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
  const unassignedCount = searched.filter((r) => r.unassigned).length;

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: "#faf8f6" }} contentContainerStyle={{ padding: isNarrow ? 16 : 40 }}>
        <View className="mb-5 flex-row flex-wrap items-start justify-between" style={{ gap: 16 }}>
          <View>
            <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 26 }}>Clients</Text>
            {state ? (
              <Text className="mt-0.5 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
                {state.rows.length} active
                {unassignedCount > 0 ? ` · ${unassignedCount} unassigned` : ""}
              </Text>
            ) : null}
          </View>
          <View className="flex-row flex-wrap items-center gap-2.5" style={{ flexShrink: 1, minWidth: 0 }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name"
              className="rounded-lg border border-stone-300 bg-white px-3.5"
              // A fixed 260 is wider than a phone has to spare once the
              // button sits beside it; minWidth 0 is what actually lets an
              // input shrink in react-native-web.
              style={{ fontFamily: fonts.sans, fontSize: 13, height: 40, width: isNarrow ? undefined : 260, flexGrow: isNarrow ? 1 : 0, flexBasis: isNarrow ? 180 : "auto", minWidth: 0 }}
            />
            <Pressable
              onPress={() => setModalVisible(true)}
              className="rounded-lg px-[18px] py-2.5"
              style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16 }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                + Add client
              </Text>
            </Pressable>
          </View>
        </View>

        {loadError ? (
          <>
            <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
              {loadError}
            </Text>
            <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "flex-start" }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
            </Pressable>
          </>
        ) : !state ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View className="mb-[18px] flex-row flex-wrap items-center" style={{ gap: 8 }}>
              {chips.map((chip) => (
                <FilterChip
                  key={chip.key}
                  label={chip.label}
                  count={chip.count}
                  tone={chip.tone}
                  active={filter === chip.key}
                  onPress={() => setFilter(chip.key)}
                />
              ))}
              <View className="ml-auto">
                <Select
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: "last-session", label: "Sort: Last session" },
                    { value: "name", label: "Sort: Name" },
                    { value: "flags", label: "Sort: Most flags" },
                  ]}
                />
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator>
              <ClientRosterTable
                rows={pageRows}
                today={state.today}
                emptyMessage={state.rows.length === 0 ? "No members linked yet." : "No clients match this filter."}
                onOpenClient={(row) => router.push(`/(coach)/clients/${row.id}`)}
                /* Message goes to the client's own page rather than the
                   Messages inbox: the inbox has no "open this client" param
                   (it isn't part of this design pass), and the client page
                   already carries both the thread card and the floating
                   compose bubble. */
                onMessage={(row) => router.push(`/(coach)/clients/${row.id}`)}
                onCheckin={(row) => router.push(`/(coach)/nutrition/clients/${row.id}`)}
              />
            </ScrollView>

            {filtered.length > 0 ? (
              <View className="mt-4 flex-row items-center justify-end gap-2.5" style={{ maxWidth: TABLE_WIDTH }}>
                <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
                  Page {clampedPage} of {pageCount} · {filtered.length} client{filtered.length === 1 ? "" : "s"}
                </Text>
                <Pressable
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={clampedPage <= 1}
                  className="items-center justify-center rounded-lg border"
                  style={{ width: 32, height: 32, borderColor: "#d9d4cd", opacity: clampedPage <= 1 ? 0.5 : 1 }}
                >
                  <Ionicons name="chevron-back" size={14} color="#44403c" />
                </Pressable>
                <Pressable
                  onPress={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={clampedPage >= pageCount}
                  className="items-center justify-center rounded-lg border"
                  style={{ width: 32, height: 32, borderColor: "#d9d4cd", opacity: clampedPage >= pageCount ? 0.5 : 1 }}
                >
                  <Ionicons name="chevron-forward" size={14} color="#44403c" />
                </Pressable>
              </View>
            ) : null}
          </>
        )}

        <LinkMemberModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleLink} />
      </ScrollView>
    </CoachShell>
  );
}
