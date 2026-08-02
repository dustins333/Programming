import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import { getSpcRoster, checkAndAutoDraft } from "../../../lib/programming/spcDashboard";
import { setSpcStatus } from "../../../lib/programming/spcClients";
import { StatusBadge } from "../../../components/StatusBadge";
import { CoachShell } from "../../../components/CoachShell";
import { fonts, colors } from "../../../lib/theme";
import { STATUS_LABELS, STATUS_TONES, STATUS_ORDER } from "../../../lib/programming/spcStatus";
import { formatDateMDY } from "../../../lib/formatDate";

const SORT_OPTIONS = [
  { value: "blockEnds", label: "Sort: Block ends" },
  { value: "name", label: "Sort: Name" },
  { value: "status", label: "Sort: Status" },
  { value: "coach", label: "Sort: Coach" },
];

function compareClients(a, b, sort) {
  if (sort === "name") return a.name.localeCompare(b.name);
  if (sort === "status") return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name);
  if (sort === "coach") return a.coachName.localeCompare(b.coachName) || a.name.localeCompare(b.name);
  // blockEnds — soonest-ending first, clients with no block yet sort last.
  const ae = a.currentBlock?.block_end_date;
  const be = b.currentBlock?.block_end_date;
  if (!ae && !be) return a.name.localeCompare(b.name);
  if (!ae) return 1;
  if (!be) return -1;
  return ae < be ? -1 : ae > be ? 1 : a.name.localeCompare(b.name);
}

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// Doubles as a drag-drop target (unchanged from before) AND a filter chip —
// clicking toggles filtering the roster (in either view) down to this one
// status; clicking the already-active tile clears it. Drag-hover and
// active-filter get visually distinct treatments (rust vs. olive) so a
// coach mid-drag can't confuse "drop here" with "currently filtering".
function StatusTile({ status, count, active, onToggle }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const style = active
    ? { borderWidth: 2, borderColor: "#4d6142", backgroundColor: "#f5f8f1" }
    : isOver
      ? { borderWidth: 2, borderColor: colors.primaryOnWhite, backgroundColor: "#fdf6f2" }
      : { borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white" };
  return (
    <div ref={setNodeRef} onClick={() => onToggle(status)} style={{ cursor: "pointer" }}>
      <View className="rounded-xl px-3.5 py-3" style={{ width: 176, ...style }}>
        <StatusBadge tone={STATUS_TONES[status]} label={STATUS_LABELS[status]} />
        <Text className="mt-2 text-xs" style={{ fontFamily: fonts.sans, color: active ? "#4d6142" : "#a8a29e", fontWeight: active ? "600" : "400" }}>
          {count} client{count === 1 ? "" : "s"}
          {active ? " · filtering" : ""}
        </Text>
      </View>
    </div>
  );
}

// Shared row markup for both the real (draggable) row and the DragOverlay
// preview that follows the pointer.
function ClientCard({ client }) {
  const urgent = client.dueSoon || client.status === "new_program_asap";
  return (
    <View
      className="mb-2 rounded-xl bg-white px-4 py-3.5"
      style={
        urgent
          ? { borderWidth: 1, borderColor: "#e9d3c6", borderLeftWidth: 3, borderLeftColor: "#c2543a" }
          : { borderWidth: 1, borderColor: "#e7e5e4" }
      }
    >
      <View className="flex-row items-center justify-between">
        <Text style={{ fontFamily: fonts.sansMedium }} className="text-stone-700">
          {client.name}
        </Text>
        <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          {client.coachName}
        </Text>
      </View>
      <Text className="mt-0.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
        {client.sessionsPerWeek}x/week
        {client.currentBlock
          ? ` · block ends ${formatDateMDY(client.currentBlock.block_end_date)}${client.dueSoon ? " · due soon" : ""}`
          : " · no block yet"}
      </Text>
    </View>
  );
}

// Drag source that's also a plain click target — same dual click-or-drag
// pattern as LibraryExercise in builder/[workoutId].web.js: drag listeners
// live on the outer <div>, the click handler on the inner Pressable. A short
// activationConstraint distance means a plain click still fires normally and
// only a real drag (pointer moves >=4px before release) starts a drag. The
// dragged row itself just fades out — the moving visual is the DragOverlay,
// so there's no manual translate3d fighting with dnd-kit's own positioning.
function ClientRow({ client }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `client-${client.userId}`,
    data: { type: "client", userId: client.userId, status: client.status },
  });

  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.35 : 1 }} {...listeners} {...attributes}>
      <Link href={`/(coach)/spc/${client.userId}`} asChild>
        <Pressable className="cursor-grab active:opacity-70">
          <ClientCard client={client} />
        </Pressable>
      </Link>
    </div>
  );
}

function CoachSelect({ value, coaches, onChange }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        fontFamily: fonts.sans,
        fontSize: 13,
        height: 38,
        padding: "0 14px",
        borderRadius: 8,
        border: "1px solid #d9d4cd",
        color: "#44403c",
        backgroundColor: "white",
      }}
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
      style={{
        fontFamily: fonts.sans,
        fontSize: 13,
        height: 38,
        padding: "0 14px",
        borderRadius: 8,
        border: "1px solid #d9d4cd",
        color: "#44403c",
        backgroundColor: "white",
      }}
    >
      {SORT_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// The flat, sortable "All clients" grid — the new default view. Fixed
// per-column widths (not CSS grid) mirror the design reference exactly and
// match how every other column-aligned list in this app (e.g. the Clients
// page) is already built.
function ClientGridRow({ client, isHeader }) {
  const content = (
    <View className="flex-row items-center gap-2.5" style={{ paddingHorizontal: 18, paddingVertical: isHeader ? 10 : 14 }}>
      <View className="flex-1 flex-row items-center gap-3" style={{ minWidth: 0 }}>
        {isHeader ? (
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Client
          </Text>
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
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Status
          </Text>
        ) : (
          <StatusBadge tone={STATUS_TONES[client.status]} label={STATUS_LABELS[client.status]} />
        )}
      </View>
      <View style={{ width: 90 }}>
        <Text style={{ fontFamily: isHeader ? fonts.sansBold : fonts.sans, fontSize: isHeader ? 10.5 : 12.5, color: isHeader ? "#a8a29e" : "#57534e", textTransform: isHeader ? "uppercase" : "none", letterSpacing: isHeader ? 0.5 : 0 }}>
          {isHeader ? "Freq." : `${client.sessionsPerWeek}x/wk`}
        </Text>
      </View>
      <View style={{ width: 110 }}>
        {isHeader ? (
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Block ends
          </Text>
        ) : client.currentBlock ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#57534e" }}>{formatDateMDY(client.currentBlock.block_end_date)}</Text>
        ) : (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#c9c4bd", fontStyle: "italic" }}>No block yet</Text>
        )}
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
    return (
      <View style={{ backgroundColor: "#faf8f6", borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>{content}</View>
    );
  }
  return (
    <Link href={`/(coach)/spc/${client.userId}`} asChild>
      <Pressable style={{ borderBottomWidth: 1, borderBottomColor: "#ece7e1" }}>{content}</Pressable>
    </Link>
  );
}

export default function SpcDashboardWeb() {
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [filterCoach, setFilterCoach] = useState(null);
  const [filterDueSoon, setFilterDueSoon] = useState(false);
  const [statusFilter, setStatusFilter] = useState(null);
  const [view, setView] = useState("all");
  const [sort, setSort] = useState("blockEnds");
  const [activeClient, setActiveClient] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(async () => {
    try {
      await checkAndAutoDraft();
      setRoster(await getSpcRoster());
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

  // Coach/due-soon filters only — status counts on the tiles below read off
  // this, not the status-filtered set, so toggling one status tile doesn't
  // zero out the others' counts.
  const baseFiltered = useMemo(() => {
    if (!roster) return [];
    return roster.filter((c) => {
      if (filterCoach && c.coachName !== filterCoach) return false;
      if (filterDueSoon && !c.dueSoon) return false;
      return true;
    });
  }, [roster, filterCoach, filterDueSoon]);

  const filtered = useMemo(
    () => baseFiltered.filter((c) => !statusFilter || c.status === statusFilter),
    [baseFiltered, statusFilter]
  );

  const sortedFlat = useMemo(() => [...filtered].sort((a, b) => compareClients(a, b, sort)), [filtered, sort]);

  // Status-grouped sections, same shape as the native page — a header with
  // the status badge sits over each group instead of repeating the badge on
  // every row.
  const grouped = useMemo(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      clients: filtered.filter((c) => c.status === status).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.clients.length > 0);
  }, [filtered]);

  const countByStatus = useMemo(() => {
    const counts = {};
    baseFiltered.forEach((c) => {
      counts[c.status] = (counts[c.status] ?? 0) + 1;
    });
    return counts;
  }, [baseFiltered]);

  const toggleStatusFilter = (status) => {
    setStatusFilter((prev) => (prev === status ? null : status));
  };

  const handleDragStart = (event) => {
    const userId = event.active.data.current?.userId;
    setActiveClient(filtered.find((c) => c.userId === userId) ?? null);
  };

  const handleDragEnd = async (event) => {
    setActiveClient(null);
    const { active, over } = event;
    if (!over) return;
    const { userId, status: fromStatus } = active.data.current ?? {};
    const toStatus = over.id;
    if (!userId || !STATUS_ORDER.includes(toStatus) || toStatus === fromStatus) return;
    try {
      await setSpcStatus(userId, toStatus);
      await load();
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong loading the SPC roster: {loadError}
          </Text>
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
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveClient(null)}
      >
        <ScrollView className="flex-1" style={{ backgroundColor: "#faf8f6" }}>
          <View
            style={{
              position: "sticky",
              top: 0,
              zIndex: 20,
              backgroundColor: "#faf8f6",
              paddingHorizontal: 40,
              paddingTop: 36,
              paddingBottom: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#e7e5e4",
            }}
          >
            <View className="mb-4 flex-row items-center justify-between">
              <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 24 }}>SPC</Text>
              <Link href="/(coach)/spc/templates" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>
                Templates →
              </Link>
            </View>

            {roster.length > 0 && (
              <View className="mb-[18px] flex-row flex-wrap items-center justify-between gap-3">
                <View className="flex-row overflow-hidden rounded-full" style={{ borderWidth: 1, borderColor: colors.primary }}>
                  {[
                    { key: "grouped", label: "Grouped" },
                    { key: "all", label: "All clients" },
                  ].map((opt) => {
                    const active = view === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        onPress={() => setView(opt.key)}
                        className="px-4 py-2"
                        style={{ backgroundColor: active ? colors.primary : "transparent" }}
                      >
                        <Text style={{ fontFamily: active ? fonts.sansBold : fonts.sansSemiBold, color: active ? "white" : colors.primaryOnWhite, fontSize: 12.5 }}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View className="flex-row flex-wrap items-center gap-2.5">
                  <CoachSelect value={filterCoach} coaches={coaches} onChange={setFilterCoach} />
                  <Pressable
                    onPress={() => setFilterDueSoon((v) => !v)}
                    className={`rounded-full border px-3.5 py-2 ${filterDueSoon ? "border-primary bg-primary" : "border-stone-300"}`}
                  >
                    <Text className={filterDueSoon ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans, fontSize: 13 }}>
                      Due soon
                    </Text>
                  </Pressable>
                  {view === "all" && <SortSelect value={sort} onChange={setSort} />}
                </View>
              </View>
            )}

            {roster.length === 0 ? (
              <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                No SPC clients yet — assign one from the Clients page.
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-2.5">
                {STATUS_ORDER.map((status) => (
                  <StatusTile key={status} status={status} count={countByStatus[status] ?? 0} active={statusFilter === status} onToggle={toggleStatusFilter} />
                ))}
              </View>
            )}
          </View>

          <View style={{ paddingHorizontal: 40, paddingTop: 20, paddingBottom: 40 }}>
            {view === "all" ? (
              <View className="rounded-2xl border bg-white" style={{ borderColor: "#ece7e1", maxWidth: 900, overflow: "hidden" }}>
                {sortedFlat.length === 0 ? (
                  <Text className="p-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
                    No clients match your filters.
                  </Text>
                ) : (
                  <>
                    <ClientGridRow isHeader />
                    {sortedFlat.map((client) => (
                      <ClientGridRow key={client.userId} client={client} />
                    ))}
                  </>
                )}
              </View>
            ) : (
              grouped.map(({ status, clients }) => (
                <View key={status} className="mb-8">
                  <View className="mb-3 flex-row items-center gap-2">
                    <StatusBadge tone={STATUS_TONES[status]} label={STATUS_LABELS[status]} />
                    <Text className="text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                      {clients.length}
                    </Text>
                  </View>
                  {clients.map((client) => (
                    <ClientRow key={client.userId} client={client} />
                  ))}
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <DragOverlay>{activeClient ? <View style={{ width: 320 }}><ClientCard client={activeClient} /></View> : null}</DragOverlay>
      </DndContext>
    </CoachShell>
  );
}
