import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Link } from "expo-router";
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

// Sticky drop target — one per status. Pinned at the top of the page so a
// coach can drag a client row up into it without scrolling back and forth.
// `pointerWithin` collision detection (set on the DndContext below) means
// `isOver` reflects the pointer literally being over this tile, so it lights
// up live as the coach drags across it — not just "closest" or "overlapping
// rect", which was the root cause of the old broken behavior (rectIntersection
// against a plain unstyled wrapper <div> was resolving to the wrong tile).
function StatusTile({ status, count }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <View
      ref={setNodeRef}
      className="rounded-xl px-4 py-3"
      style={{
        width: 180,
        flexShrink: 0,
        flexGrow: 0,
        borderWidth: isOver ? 2 : 1,
        borderColor: isOver ? colors.primaryOnWhite : "#e7e5e4",
        backgroundColor: isOver ? "#fdf6f2" : "white",
      }}
    >
      <StatusBadge tone={STATUS_TONES[status]} label={STATUS_LABELS[status]} />
      <Text className="mt-1.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
        {count} client{count === 1 ? "" : "s"}
      </Text>
    </View>
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
          ? ` · block ends ${client.currentBlock.block_end_date}${client.dueSoon ? " · due soon" : ""}`
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
        fontSize: 14,
        padding: "10px 14px",
        borderRadius: 8,
        border: "1px solid #d6d3d1",
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

export default function SpcDashboardWeb() {
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [filterCoach, setFilterCoach] = useState(null);
  const [filterDueSoon, setFilterDueSoon] = useState(false);
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

  const filtered = useMemo(() => {
    if (!roster) return [];
    return roster.filter((c) => {
      if (filterCoach && c.coachName !== filterCoach) return false;
      if (filterDueSoon && !c.dueSoon) return false;
      return true;
    });
  }, [roster, filterCoach, filterDueSoon]);

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
    filtered.forEach((c) => {
      counts[c.status] = (counts[c.status] ?? 0) + 1;
    });
    return counts;
  }, [filtered]);

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
        <ScrollView className="flex-1 bg-white">
          <View
            style={{
              position: "sticky",
              top: 0,
              zIndex: 20,
              backgroundColor: "white",
              paddingHorizontal: 40,
              paddingTop: 40,
              paddingBottom: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#e7e5e4",
            }}
          >
            <Text className="mb-4 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
              SPC
            </Text>

            {roster.length > 0 && (
              <View className="mb-4 flex-row flex-wrap items-center gap-3">
                <CoachSelect value={filterCoach} coaches={coaches} onChange={setFilterCoach} />
                <Pressable
                  onPress={() => setFilterDueSoon((v) => !v)}
                  className={`rounded-full border px-3.5 py-2.5 ${filterDueSoon ? "border-primary bg-primary" : "border-stone-300"}`}
                >
                  <Text className={filterDueSoon ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
                    Due soon
                  </Text>
                </Pressable>
              </View>
            )}

            {roster.length === 0 ? (
              <Text className="text-stone-500" style={{ fontFamily: fonts.sans }}>
                No SPC clients yet — assign one from the Clients page.
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-3">
                {STATUS_ORDER.map((status) => (
                  <StatusTile key={status} status={status} count={countByStatus[status] ?? 0} />
                ))}
              </View>
            )}
          </View>

          <View style={{ paddingHorizontal: 40, paddingTop: 20, paddingBottom: 40 }}>
            {grouped.map(({ status, clients }) => (
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
            ))}
          </View>
        </ScrollView>

        <DragOverlay>{activeClient ? <View style={{ width: 320 }}><ClientCard client={activeClient} /></View> : null}</DragOverlay>
      </DndContext>
    </CoachShell>
  );
}
