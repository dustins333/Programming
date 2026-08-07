import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { listMembers, listAssignments, linkMemberByAuthId } from "../../../lib/programming/clients";
import { core } from "../../../lib/supabase/client";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import { getSpcRoster } from "../../../lib/programming/spcDashboard";
import { getNutritionRoster } from "../../../lib/nutrition/dashboard";
import { getMissedSessionFlagsByUser } from "../../../lib/programming/flags";
import { LinkMemberModal } from "../../../components/LinkMemberModal";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";

const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };
const PAGE_SIZE = 20;

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name }) {
  return (
    <View className="items-center justify-center rounded-full" style={{ width: 38, height: 38, backgroundColor: "#fdf6f2" }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: colors.primaryOnWhite }}>{initials(name)}</Text>
    </View>
  );
}

function Select({ value, onChange, options, style }) {
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
        ...style,
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

// Batched roster aggregation, same "one domain's failure shouldn't hide
// another" isolation as coachDashboard.js's getCoachDashboardStats — this
// screen needs the same underlying data (assignments/SPC/nutrition/flags)
// but shaped for per-row tag pills instead of counts, so it's composed here
// rather than duplicating a second stats function in lib.
async function loadRoster() {
  const [members, assignments, programs] = await Promise.all([listMembers(), listAssignments(), listGroupPrograms()]);
  const programsById = Object.fromEntries(programs.map((p) => [p.id, p]));

  // Own try/catch, same isolation as SPC/nutrition/flags below — a roster
  // this size fits in one call (get_login_activity takes the whole
  // user_ids array at once, not per-row), so this doesn't turn into an
  // N+1 the way per-client calls elsewhere in this app were careful to
  // avoid.
  let lastSignInById = new Map();
  try {
    const { data: loginRows, error } = await core.rpc("get_login_activity", { user_ids: members.map((m) => m.id) });
    if (error) throw error;
    lastSignInById = new Map((loginRows ?? []).map((r) => [r.id, r.last_sign_in_at]));
  } catch {
    // leave empty — "not registered yet" just won't be filterable/shown
  }

  let spcRoster = [];
  try {
    spcRoster = await getSpcRoster();
  } catch {
    // leave empty — SPC data shouldn't block the whole client list
  }
  let nutritionRoster = [];
  try {
    nutritionRoster = await getNutritionRoster();
  } catch {
    // leave empty
  }
  let flagsByUser = new Map();
  try {
    flagsByUser = await getMissedSessionFlagsByUser();
  } catch {
    // leave empty
  }

  const spcActiveIds = new Set(spcRoster.filter((c) => c.status !== "paused").map((c) => c.userId));
  const nutritionActiveIds = new Set(nutritionRoster.filter((c) => c.status === "active").map((c) => c.userId));

  const rows = members.map((m) => {
    const groupProgramIds = assignments.filter((a) => a.user_id === m.id).map((a) => a.group_program_id);
    const tags = groupProgramIds.map((id) => ({ key: id, label: programsById[id]?.name ?? "Group" }));
    if (spcActiveIds.has(m.id)) tags.push({ key: "spc", label: "SPC" });
    if (nutritionActiveIds.has(m.id)) tags.push({ key: "nutrition", label: "Nutrition" });

    const programKeys = new Set([...groupProgramIds, ...(spcActiveIds.has(m.id) ? ["spc"] : []), ...(nutritionActiveIds.has(m.id) ? ["nutrition"] : [])]);

    return {
      ...m,
      tags,
      programKeys,
      unassigned: tags.length === 0,
      flagCount: flagsByUser.get(m.id)?.length ?? 0,
      neverRegistered: !lastSignInById.get(m.id),
    };
  });

  return { rows, programs };
}

export default function ClientsWeb() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [programFilter, setProgramFilter] = useState(typeof params.program === "string" ? params.program : "");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setState(await loadRoster());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A tile on the Dashboard (or any other future deep link) can pre-set the
  // program filter via ?program= — only apply it once on arrival, not every
  // re-render, so a coach clearing the filter by hand doesn't get overridden.
  useEffect(() => {
    if (typeof params.program === "string") {
      setProgramFilter(params.program);
    }
  }, [params.program]);

  useEffect(() => {
    setPage(1);
  }, [search, programFilter, statusFilter, sort]);

  const handleLink = async (form) => {
    try {
      await linkMemberByAuthId(form);
      await load();
    } catch (err) {
      Alert.alert("Failed to link account", err.message ?? String(err));
      throw err;
    }
  };

  const programOptions = useMemo(() => {
    const opts = [{ value: "", label: "All programs" }, { value: "unassigned", label: "Unassigned" }];
    (state?.programs ?? []).forEach((p) => opts.push({ value: p.id, label: p.name }));
    opts.push({ value: "spc", label: "SPC" }, { value: "nutrition", label: "Nutrition" });
    return opts;
  }, [state]);

  const filtered = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();
    let rows = state.rows.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q) && !m.email.toLowerCase().includes(q)) return false;
      if (programFilter === "unassigned" && !m.unassigned) return false;
      if (programFilter && programFilter !== "unassigned" && !m.programKeys.has(programFilter)) return false;
      if (statusFilter === "has-flag" && m.flagCount === 0) return false;
      if (statusFilter === "not-registered" && !m.neverRegistered) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === "flags") return b.flagCount - a.flagCount || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [state, search, programFilter, statusFilter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (clampedPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(clampedPage * PAGE_SIZE, filtered.length);

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: "#faf8f6" }} contentContainerStyle={{ padding: 40 }}>
        <View className="mb-5 flex-row items-start justify-between">
          <View>
            <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 26 }}>Clients</Text>
            {state ? (
              <Text className="mt-0.5 text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 13 }}>
                {rangeStart}–{rangeEnd} of {filtered.length}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => setModalVisible(true)}
            className="rounded-lg px-[18px] py-2.5"
            style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16 }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
              + Link account
            </Text>
          </Pressable>
        </View>

        {loadError ? (
          <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
            {loadError}
          </Text>
        ) : !state ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View className="mb-[18px] flex-row gap-2.5" style={{ maxWidth: 900 }}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by name or email…"
                className="flex-1 rounded-lg border border-stone-300 bg-white px-3.5"
                style={{ fontFamily: fonts.sans, fontSize: 13, height: 40 }}
              />
              <Select value={programFilter} onChange={setProgramFilter} options={programOptions} />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "", label: "Status: All" },
                  { value: "has-flag", label: "Has flag" },
                  { value: "not-registered", label: "Not registered yet" },
                ]}
              />
              <Select
                value={sort}
                onChange={setSort}
                options={[
                  { value: "name", label: "Sort: Name" },
                  { value: "flags", label: "Sort: Most flags" },
                ]}
              />
            </View>

            <View className="rounded-2xl border bg-white" style={[{ borderColor: "#ece7e1", maxWidth: 900, overflow: "hidden" }, CARD_SHADOW]}>
              {pageRows.length === 0 ? (
                <Text className="p-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
                  {state.rows.length === 0 ? "No members linked yet." : "No clients match your filters."}
                </Text>
              ) : (
                pageRows.map((item, idx) => (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push(`/(coach)/clients/${item.id}`)}
                    className="flex-row items-center gap-3.5 px-[18px] py-4"
                    style={idx < pageRows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: "#ece7e1" } : undefined}
                  >
                    <Avatar name={item.name} />
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
                          {item.name}
                        </Text>
                        {item.flagCount > 0 && (
                          <View className="rounded-full px-2 py-[3px]" style={{ backgroundColor: "#fdece5" }}>
                            <Text
                              style={{ fontFamily: fonts.sansBold, color: "#b23a22", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 }}
                            >
                              {item.flagCount} flag{item.flagCount === 1 ? "" : "s"}
                            </Text>
                          </View>
                        )}
                        {item.neverRegistered && (
                          <View className="rounded-full px-2 py-[3px]" style={{ backgroundColor: "#f1efed" }}>
                            <Text
                              style={{ fontFamily: fonts.sansBold, color: "#78716c", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 }}
                            >
                              Not registered
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 12.5 }} className="mt-0.5 text-stone-500">
                        {item.email}
                      </Text>
                    </View>
                    <View className="flex-row flex-wrap gap-1.5" style={{ maxWidth: 280, justifyContent: "flex-end" }}>
                      {item.unassigned ? (
                        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: "#f1efed" }}>
                          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#78716c", fontSize: 10.5 }}>Unassigned</Text>
                        </View>
                      ) : (
                        item.tags.map((tag) => (
                          <View key={tag.key} className="rounded-full px-2.5 py-1" style={{ backgroundColor: "#eef1e7" }}>
                            <Text style={{ fontFamily: fonts.sansSemiBold, color: "#4d6142", fontSize: 10.5 }}>{tag.label}</Text>
                          </View>
                        ))
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={15} color="#c9c4bd" />
                  </Pressable>
                ))
              )}
            </View>

            {filtered.length > 0 && (
              <View className="mt-4 flex-row items-center justify-end gap-2.5" style={{ maxWidth: 900 }}>
                <Text className="text-stone-500" style={{ fontFamily: fonts.sans, fontSize: 12.5 }}>
                  Page {clampedPage} of {pageCount}
                </Text>
                <Pressable
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={clampedPage <= 1}
                  className="items-center justify-center rounded-lg border"
                  style={{ width: 32, height: 32, borderColor: "#d9d4cd", opacity: clampedPage <= 1 ? 0.5 : 1 }}
                >
                  <Text style={{ color: "#44403c", fontSize: 13 }}>‹</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={clampedPage >= pageCount}
                  className="items-center justify-center rounded-lg border"
                  style={{ width: 32, height: 32, borderColor: "#d9d4cd", opacity: clampedPage >= pageCount ? 0.5 : 1 }}
                >
                  <Text style={{ color: "#44403c", fontSize: 13 }}>›</Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        <LinkMemberModal visible={modalVisible} onClose={() => setModalVisible(false)} onSubmit={handleLink} />
      </ScrollView>
    </CoachShell>
  );
}
