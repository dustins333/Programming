import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, useWindowDimensions } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getNutritionRoster } from "../../../lib/nutrition/dashboard";
import { STATUS_META, STATUS_ORDER, NEW_CLIENT_STATUSES, ACTIVE_CLIENT_STATUSES, OTHER_STATUSES } from "../../../lib/nutrition/rosterStatus";
import { StatusBadge } from "../../../components/StatusBadge";
import { CoachShell } from "../../../components/CoachShell";
import { formatDateTimeInBoise } from "../../../lib/boiseDate";
import { fonts, colors } from "../../../lib/theme";

// Same breakpoint CoachShell switches its sidebar to a drawer at. Below it
// this page is being read on a phone — in practice the installed PWA, where
// the desktop grid was unusable: the tile row overflowed off-screen and the
// fixed-width table columns collapsed into each other (the CLIENT and
// STATUS headers literally overlapped).
const MOBILE_BREAKPOINT = 768;

const SORT_OPTIONS = [
  { value: "status", label: "Sort: Status" },
  { value: "name", label: "Sort: Name" },
  { value: "coach", label: "Sort: Coach" },
  { value: "started", label: "Sort: Started" },
];

function compareClients(a, b, sort) {
  if (sort === "name") return a.name.localeCompare(b.name);
  if (sort === "coach") return a.coachName.localeCompare(b.coachName) || a.name.localeCompare(b.name);
  if (sort === "started") return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.name.localeCompare(b.name);
  return STATUS_ORDER.indexOf(a.rosterStatus) - STATUS_ORDER.indexOf(b.rosterStatus) || a.name.localeCompare(b.name);
}

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function activityLine(client) {
  if (client.rosterStatus === "paused") return "Paused";
  if (client.rosterStatus === "needsTarget") return "No target set yet";
  if (client.rosterStatus === "otSetup") return "Waiting on you to add tracking days";
  if (client.rosterStatus === "otInProgress") return `${client.trackingLoggedCount} of ${client.trackingDatesCount} tracking days logged`;
  if (client.rosterStatus === "readyForReview") return "Ready for your review";
  const logLine = client.loggedToday
    ? "Logged today"
    : client.missedDays > 0
      ? `Missed ${client.missedDays} day${client.missedDays === 1 ? "" : "s"} this week`
      : "Logged this week";
  const weightLine =
    client.weightDelta !== null
      ? ` · ${client.weightDelta > 0 ? "▲" : client.weightDelta < 0 ? "▼" : "±"} ${Math.abs(client.weightDelta).toFixed(1)} lb`
      : "";
  return `${logLine}${weightLine}`;
}

// Doubles as a filter chip — clicking toggles the roster down to this one
// status; clicking the already-active tile clears it. Same convention as
// the SPC dashboard's status tiles, minus the drag-drop half (nutrition
// status is fully computed, not a value a coach sets directly).
function StatusTile({ status, count, active, onToggle, compact, fullWidth }) {
  return (
    <Pressable onPress={() => onToggle(status)} style={fullWidth ? { flexGrow: 1, flexBasis: "47%" } : undefined}>
      <View
        className="rounded-xl px-3.5 py-3"
        style={{
          width: fullWidth ? undefined : compact ? 150 : 168,
          borderWidth: active ? 2 : 1,
          borderColor: active ? "#4d6142" : "#ece7e1",
          backgroundColor: active ? "#f5f8f1" : "white",
        }}
      >
        <StatusBadge tone={STATUS_META[status].tone} label={STATUS_META[status].label} lines={fullWidth ? 2 : 1} />
        <Text className="mt-2 text-xs" style={{ fontFamily: fonts.sans, color: active ? "#4d6142" : "#a8a29e", fontWeight: active ? "600" : "400" }}>
          {count} client{count === 1 ? "" : "s"}
          {active ? " · filtering" : ""}
        </Text>
      </View>
    </Pressable>
  );
}

// A labeled group of tiles — "Active clients" (pending/ready/completed
// check-in) and "New clients" (the 3 onboarding stages) render as two
// distinct sections rather than one flat row, per direct ask: a coach
// should be able to tell at a glance which tiles are about people already
// being coached vs. people still ramping up.
function TileSection({ title, statuses, countByStatus, statusFilter, onToggle, isMobile }) {
  return (
    <View className="mb-3">
      <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
        {title}
      </Text>
      <View className={isMobile ? "flex-row flex-wrap gap-2" : "flex-row gap-2.5"}>
        {/* Zero-count tiles are hidden (native already did this) — a
            clickable "0 clients" tile only ever led to an empty list. */}
        {statuses
          .filter((status) => (countByStatus[status] ?? 0) > 0)
          .map((status) => (
            <StatusTile
              key={status}
              status={status}
              count={countByStatus[status] ?? 0}
              active={statusFilter.includes(status)}
              onToggle={onToggle}
              fullWidth={isMobile}
            />
          ))}
      </View>
    </View>
  );
}

function CoachSelect({ value, coaches, onChange }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      style={{ fontFamily: fonts.sans, fontSize: 13, height: 38, padding: "0 14px", borderRadius: 8, border: "1px solid #d9d4cd", color: "#44403c", backgroundColor: "white" }}
    >
      <option value="">All coaches</option>
      {coaches.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

function SortSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ fontFamily: fonts.sans, fontSize: 13, height: 38, padding: "0 14px", borderRadius: 8, border: "1px solid #d9d4cd", color: "#44403c", backgroundColor: "white" }}
    >
      {SORT_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// Phone layout: name, badge and activity stacked, nothing fixed-width.
// The desktop grid's columns add up to ~470px before padding, so on a
// 390px viewport the flex-1 client column collapsed to zero and the
// columns rendered on top of each other.
function ClientMobileRow({ client }) {
  return (
    <Link href={`/(coach)/nutrition/clients/${client.userId}`} asChild>
      <Pressable style={{ borderBottomWidth: 1, borderBottomColor: "#ece7e1", paddingHorizontal: 14, paddingVertical: 12 }}>
        <View className="flex-row items-center gap-3">
          <View className="items-center justify-center rounded-full" style={{ width: 34, height: 34, backgroundColor: "#fdf6f2", flexShrink: 0 }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>{initials(client.name)}</Text>
          </View>
          <View className="flex-1" style={{ minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
              {client.name}
            </Text>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 1 }}>
              {client.coachName}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color="#c9c4bd" style={{ flexShrink: 0 }} />
        </View>
        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          <StatusBadge tone={STATUS_META[client.rosterStatus].tone} label={STATUS_META[client.rosterStatus].label} />
          {client.rosterStatus === "readyForCheckin" && client.checkinSubmittedAt ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>{formatDateTimeInBoise(client.checkinSubmittedAt)}</Text>
          ) : null}
        </View>
        <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#57534e", marginTop: 6 }}>
          {activityLine(client)}
        </Text>
      </Pressable>
    </Link>
  );
}

// The flat "everyone at once" grid — fixed per-column widths mirror the SPC
// dashboard's ClientGridRow, the pattern Terra asked this page to match.
// Desktop only; see ClientMobileRow above for narrow viewports.
function ClientGridRow({ client, isHeader }) {
  const content = (
    <View className="flex-row items-center gap-2.5" style={{ paddingHorizontal: 18, paddingVertical: isHeader ? 10 : 14 }}>
      <View className="flex-1 flex-row items-center gap-3" style={{ minWidth: 0 }}>
        {isHeader ? (
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>Client</Text>
        ) : (
          <>
            <View className="items-center justify-center rounded-full" style={{ width: 34, height: 34, backgroundColor: "#fdf6f2", flexShrink: 0 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>{initials(client.name)}</Text>
            </View>
            <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14 }} className="text-stone-700">
              {client.name}
            </Text>
          </>
        )}
      </View>
      <View style={{ width: 150 }}>
        {isHeader ? (
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>Status</Text>
        ) : (
          <View style={{ alignItems: "flex-start", gap: 3 }}>
            <StatusBadge tone={STATUS_META[client.rosterStatus].tone} label={STATUS_META[client.rosterStatus].label} />
            {client.rosterStatus === "readyForCheckin" && client.checkinSubmittedAt ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>{formatDateTimeInBoise(client.checkinSubmittedAt)}</Text>
            ) : null}
          </View>
        )}
      </View>
      <View style={{ width: 210 }}>
        <Text numberOfLines={1} style={{ fontFamily: isHeader ? fonts.sansBold : fonts.sans, fontSize: isHeader ? 10.5 : 12.5, color: isHeader ? "#a8a29e" : "#57534e", textTransform: isHeader ? "uppercase" : "none", letterSpacing: isHeader ? 0.5 : 0 }}>
          {isHeader ? "Activity" : activityLine(client)}
        </Text>
      </View>
      <View style={{ width: 90 }}>
        <Text numberOfLines={1} style={{ fontFamily: isHeader ? fonts.sansBold : fonts.sans, fontSize: isHeader ? 10.5 : 12.5, color: isHeader ? "#a8a29e" : "#78716c", textTransform: isHeader ? "uppercase" : "none", letterSpacing: isHeader ? 0.5 : 0 }}>
          {isHeader ? "Coach" : client.coachName}
        </Text>
      </View>
      <View style={{ width: 16 }}>{!isHeader && <Ionicons name="chevron-forward" size={15} color="#c9c4bd" />}</View>
    </View>
  );

  if (isHeader) {
    return <View style={{ backgroundColor: "#faf8f6", borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>{content}</View>;
  }
  return (
    <Link href={`/(coach)/nutrition/clients/${client.userId}`} asChild>
      <Pressable style={{ borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>{content}</Pressable>
    </Link>
  );
}

export default function NutritionDashboardWeb() {
  const router = useRouter();
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [filterCoach, setFilterCoach] = useState(null);
  // Kept in the URL (?status=) so working a queue survives the round trip
  // into a client page and back — plain state reset on every return, which
  // meant re-picking the filter after every single client.
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isMobile = width < MOBILE_BREAKPOINT;
  // An array, not a single key: the dashboard's "Not set up yet" tile
  // counts one bucket that this roster splits across four statuses, so a
  // tap from there arrives as ?status=a,b,c,d. Everything else is a
  // one-element array. `statusLabel` rides along to name a multi-status
  // filter that has no single label of its own.
  const [statusFilter, setStatusFilter] = useState(() =>
    typeof params.status === "string" && params.status ? params.status.split(",").filter(Boolean) : []
  );
  const statusFilterLabel =
    statusFilter.length === 1
      ? STATUS_META[statusFilter[0]]?.label
      : typeof params.statusLabel === "string" && params.statusLabel
        ? params.statusLabel
        : `${statusFilter.length} statuses`;
  // Defaults to alphabetical, not status-grouped — per direct feedback, an
  // unfiltered roster should read as a plain client list; "Sort: Status"
  // stays available in the dropdown for anyone who wants grouping back.
  const [sort, setSort] = useState("name");

  // The useState initializer above only runs on mount. Native keeps these
  // screens mounted across tab switches, so a second arrival from the
  // dashboard (with a different ?status=) would silently keep the old
  // filter — the same "applied param ref" idiom plan.js and the member
  // nutrition tab already use for their own params.
  const appliedStatusParamRef = useRef(typeof params.status === "string" ? params.status : "");
  useEffect(() => {
    const raw = typeof params.status === "string" ? params.status : "";
    if (appliedStatusParamRef.current === raw) return;
    appliedStatusParamRef.current = raw;
    setStatusFilter(raw ? raw.split(",").filter(Boolean) : []);
  }, [params.status]);

  const load = useCallback(async () => {
    try {
      // Archived clients are deliberately excluded here — they get their
      // own Archived list (still pullable, just not mixed into the roster
      // a coach scans day to day). Paused ones stay visible; that's still
      // a "temporarily off" state worth seeing at a glance.
      setRoster((await getNutritionRoster()).filter((c) => c.status !== "archived"));
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const coaches = useMemo(() => {
    if (!roster) return [];
    return [...new Set(roster.map((c) => c.coachName))].sort();
  }, [roster]);

  // Coach filter only — status counts on the tiles below read off this, not
  // the status-filtered set, so toggling one status tile doesn't zero out
  // the others' counts.
  const baseFiltered = useMemo(() => {
    if (!roster) return [];
    return roster.filter((c) => !filterCoach || c.coachName === filterCoach);
  }, [roster, filterCoach]);

  const filtered = useMemo(
    () => baseFiltered.filter((c) => statusFilter.length === 0 || statusFilter.includes(c.rosterStatus)),
    [baseFiltered, statusFilter]
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => compareClients(a, b, sort)), [filtered, sort]);

  const countByStatus = useMemo(() => {
    const counts = {};
    baseFiltered.forEach((c) => {
      counts[c.rosterStatus] = (counts[c.rosterStatus] ?? 0) + 1;
    });
    return counts;
  }, [baseFiltered]);

  // Tapping the one active tile clears; tapping any other replaces the
  // whole filter (including a multi-status one arrived at from the
  // dashboard) with just that status.
  const toggleStatusFilter = (status) =>
    setStatusFilter((prev) => {
      const next = prev.length === 1 && prev[0] === status ? [] : [status];
      router.setParams({ status: next.join(","), statusLabel: "" });
      return next;
    });

  const clearStatusFilter = () => {
    setStatusFilter([]);
    router.setParams({ status: "", statusLabel: "" });
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading the nutrition roster: {loadError}
          </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
        </View>
      </CoachShell>
    );
  }

  if (!roster) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: "#faf8f6" }}>
        <View
          style={{
            // Sticky only on desktop. On a phone the tiles stack tall
            // enough that pinning them would leave the client list a
            // sliver of the viewport.
            position: isMobile ? "relative" : "sticky",
            top: 0,
            zIndex: 20,
            backgroundColor: "#faf8f6",
            paddingHorizontal: isMobile ? 14 : 40,
            paddingTop: isMobile ? 16 : 36,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#e7e5e4",
          }}
        >
          <View className="mb-4 flex-row items-center justify-between">
            <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 24 }}>Nutrition</Text>
            <View className="flex-row gap-5">
              <Link href="/(coach)/nutrition/archived" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>
                Archived →
              </Link>
              <Link href="/(coach)/nutrition/photo-compare" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>
                Photo compare →
              </Link>
            </View>
          </View>

          {roster.length > 0 && (
            <View className="mb-[18px] flex-row flex-wrap items-center justify-between gap-3">
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                {roster.length} client{roster.length === 1 ? "" : "s"}
              </Text>
              <View className="flex-row flex-wrap items-center gap-2.5">
                <CoachSelect value={filterCoach} coaches={coaches} onChange={setFilterCoach} />
                <SortSelect value={sort} onChange={setSort} />
              </View>
            </View>
          )}

          {roster.length === 0 ? (
            <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
              No nutrition clients yet — assign one from the Clients page.
            </Text>
          ) : (
            <View>
              <TileSection title="Active clients" statuses={ACTIVE_CLIENT_STATUSES} countByStatus={countByStatus} statusFilter={statusFilter} onToggle={toggleStatusFilter} isMobile={isMobile} />
              <TileSection title="New clients" statuses={NEW_CLIENT_STATUSES} countByStatus={countByStatus} statusFilter={statusFilter} onToggle={toggleStatusFilter} isMobile={isMobile} />
              {OTHER_STATUSES.some((status) => (countByStatus[status] ?? 0) > 0) && (
                <View className={isMobile ? "flex-row flex-wrap gap-2" : "flex-row gap-2"}>
                  {OTHER_STATUSES.filter((status) => (countByStatus[status] ?? 0) > 0).map((status) => (
                    <StatusTile
                      key={status}
                      status={status}
                      count={countByStatus[status] ?? 0}
                      active={statusFilter.includes(status)}
                      onToggle={toggleStatusFilter}
                      compact
                      fullWidth={isMobile}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: isMobile ? 14 : 40, paddingTop: 20, paddingBottom: 40 }}>
          {statusFilter.length > 0 ? (
            <View className="mb-3 flex-row flex-wrap items-center gap-2">
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                Filtered: <Text style={{ fontFamily: fonts.sansSemiBold, color: "#4d6142" }}>{statusFilterLabel}</Text>
              </Text>
              <Text style={{ color: "#d6d3d1" }}>·</Text>
              <Pressable onPress={clearStatusFilter}>
                <Text className="text-sm" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>
                  Clear filter
                </Text>
              </Pressable>
            </View>
          ) : null}
          <View className="rounded-2xl border bg-white" style={{ borderColor: "#ece7e1", maxWidth: 900, overflow: "hidden" }}>
            {sorted.length === 0 ? (
              <Text className="p-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
                No clients match your filters.
              </Text>
            ) : (
              <>
                {!isMobile && <ClientGridRow isHeader />}
                {sorted.map((client) =>
                  isMobile ? (
                    <ClientMobileRow key={client.userId} client={client} />
                  ) : (
                    <ClientGridRow key={client.userId} client={client} />
                  )
                )}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </CoachShell>
  );
}
