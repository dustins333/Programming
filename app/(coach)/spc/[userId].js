import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Link, useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getUser, listCoaches } from "../../../lib/programming/clients";
import { getSpcClient, updateSpcClient, setSpcStatus } from "../../../lib/programming/spcClients";
import {
  listBlocksForSpcClient,
  createSpcBlock,
  labelBlocks,
  listSpcWorkoutsForBlock,
  addDays,
} from "../../../lib/programming/spcBlocks";
import { listSpcWorkoutExercisesForWorkouts, copyLastBlockContent, copySpcWorkoutContent } from "../../../lib/programming/spcWorkouts";
import { currentWeekNumber } from "../../../lib/programming/schedule";
import { WEEK_OFFSETS, groupRows } from "../../../lib/programming/gridRows";
import { SessionCell, PlaceholderCell, GapSlot, SESSION_COL_WIDTH, CELL_MIN_HEIGHT, CELL_GAP } from "../../../components/BlockGridCells";
import { getSetting } from "../../../lib/settings";
import { todayInBoise } from "../../../lib/boiseDate";
import { formatDateMD } from "../../../lib/formatDate";
import { confirmOverwrite } from "../../../lib/confirmDialog";
import { toastError } from "../../../lib/toast";
import { fonts, colors } from "../../../lib/theme";
import { STATUS_LABELS, STATUS_TONES } from "../../../lib/programming/spcStatus";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { NewSpcBlockChoiceModal } from "../../../components/NewSpcBlockChoiceModal";
import { CoachShell } from "../../../components/CoachShell";

const ROW_LABEL_WIDTH = 130;
const CARD_SHADOW = { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 };
const SESSIONS_PER_WEEK_OPTIONS = [
  { key: "1", label: "1x" },
  { key: "2", label: "2x" },
  { key: "3", label: "3x" },
  { key: "4", label: "4x" },
];

function weeksSince(dateStr, today) {
  const days = Math.floor((new Date(`${today}T12:00:00`) - new Date(`${dateStr}T12:00:00`)) / (1000 * 60 * 60 * 24));
  return Math.max(0, Math.round(days / 7));
}

// Same "rows relative to today, gap-detect, size one prompt to the gap"
// pattern as Group Programs' grid (app/(coach)/blocks/index.js) — SPC's
// equivalent of "one program" is "one client", since each SPC client has
// their own independent block timeline rather than sharing one program-wide
// schedule. Fetches every session-row for each block covering the visible
// window plus a batched exercise-name lookup, same shape as the group grid.
async function loadGrid(blockRows) {
  const today = todayInBoise();
  const rows = WEEK_OFFSETS.map(({ offset, label }) => {
    const weekDate = addDays(today, offset * 7);
    const block = blockRows.find((b) => b.block_start_date <= weekDate && weekDate <= b.block_end_date) ?? null;
    const weekNum = block ? currentWeekNumber(block.block_start_date, block.block_length_weeks, weekDate) : null;
    return { offset, label, weekDate, block, weekNum, sessions: [] };
  });

  const blockIds = [...new Set(rows.map((r) => r.block?.id).filter(Boolean))];
  const workoutsByBlockId = {};
  await Promise.all(
    blockIds.map(async (id) => {
      workoutsByBlockId[id] = await listSpcWorkoutsForBlock(id);
    })
  );

  const allWorkoutIds = [];
  for (const row of rows) {
    if (!row.block) continue;
    // Same week_number filter as group's loadProgramData now that SPC has
    // one independent row per (week, session) instead of one row recurring
    // across every week of the block.
    row.sessions = (workoutsByBlockId[row.block.id] ?? []).filter((w) => w.week_number === row.weekNum);
    allWorkoutIds.push(...row.sessions.map((s) => s.id));
  }

  const exercisesByWorkout = await listSpcWorkoutExercisesForWorkouts(allWorkoutIds);
  return { rows, exercisesByWorkout };
}

const isWeb = Platform.OS === "web";

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Card({ children, style }) {
  return (
    <View className="mb-4 rounded-2xl border bg-white p-5" style={[{ borderColor: "#ece7e1" }, CARD_SHADOW, style]}>
      {children}
    </View>
  );
}

function Eyebrow({ children }) {
  return (
    <Text className="mb-2.5 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansBold, letterSpacing: 0.5 }}>
      {children}
    </Text>
  );
}

function CoachDropdown({ value, coaches, onChange }) {
  if (!isWeb) {
    return (
      <View className="flex-row flex-wrap gap-2">
        {coaches.map((coach) => (
          <Pressable
            key={coach.id}
            onPress={() => onChange(coach.id)}
            className={`rounded-full border px-3.5 py-2.5 ${value === coach.id ? "border-primary bg-primary" : "border-stone-300"}`}
          >
            <Text className={value === coach.id ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
              {coach.name}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        fontFamily: fonts.sans,
        fontSize: 13,
        height: 40,
        padding: "0 14px",
        borderRadius: 8,
        border: "1px solid #d9d4cd",
        color: "#44403c",
        backgroundColor: "white",
        maxWidth: 220,
      }}
    >
      <option value="">Unassigned</option>
      {coaches.map((coach) => (
        <option key={coach.id} value={coach.id}>
          {coach.name}
        </option>
      ))}
    </select>
  );
}

export default function SpcClientDetail() {
  const { userId } = useLocalSearchParams();
  const { profile } = useAuth();
  const router = useRouter();
  const [member, setMember] = useState(null);
  const [client, setClient] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [latestBlockPreview, setLatestBlockPreview] = useState([]);
  const [gridRows, setGridRows] = useState(null);
  const [exercisesByWorkout, setExercisesByWorkout] = useState({});
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [defaultLengthWeeks, setDefaultLengthWeeks] = useState(4);
  const [loadError, setLoadError] = useState(null);
  const [startingGap, setStartingGap] = useState(false);
  const [copySource, setCopySource] = useState(null);
  const [copyTargets, setCopyTargets] = useState(new Set());
  const [copyBusy, setCopyBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [memberRow, clientRow, coachRows, blockRows, defaultLength] = await Promise.all([
        getUser(userId),
        getSpcClient(userId),
        listCoaches(),
        listBlocksForSpcClient(userId),
        getSetting("default_block_length_spc_weeks", 4),
      ]);
      setMember(memberRow);
      setClient(clientRow);
      setCoaches(coachRows);
      setBlocks(blockRows);
      setNotesDraft(clientRow?.notes_goals_feedback ?? "");
      setDefaultLengthWeeks(Number(defaultLength));

      const { rows, exercisesByWorkout: exByWorkout } = await loadGrid(blockRows);
      setGridRows(rows);
      setExercisesByWorkout(exByWorkout);

      // blockRows is already newest-start-first, so [0] is the block a
      // "+ New block" click would be reusing — preview its sessions for the
      // choice modal regardless of whether it's still inside the grid's
      // visible 6-week window. Week 1 only, as a representative sample —
      // each week can now have its own exercise list, so there's no single
      // "the" exercise list for a session to show anymore.
      if (blockRows.length > 0) {
        const latest = blockRows[0];
        const latestWorkouts = (await listSpcWorkoutsForBlock(latest.id)).filter((w) => w.week_number === 1);
        const previewExercises = await listSpcWorkoutExercisesForWorkouts(latestWorkouts.map((w) => w.id));
        setLatestBlockPreview(
          latestWorkouts
            .map((w) => ({ sessionNumber: w.session_number, names: previewExercises[w.id] ?? [] }))
            .sort((a, b) => a.sessionNumber - b.sessionNumber)
        );
      } else {
        setLatestBlockPreview([]);
      }
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const cancelCopy = useCallback(() => {
    setCopySource(null);
    setCopyTargets(new Set());
  }, []);

  const handleStatus = async (status) => {
    try {
      await setSpcStatus(userId, status);
      await load();
    } catch (err) {
      toastError("Failed to update status", err);
    }
  };

  const handleCoachReassign = async (coachId) => {
    try {
      await updateSpcClient(userId, { assigned_coach_id: coachId });
      await load();
    } catch (err) {
      toastError("Failed to reassign coach", err);
    }
  };

  const handleSessionsSelect = async (n) => {
    try {
      await updateSpcClient(userId, { sessions_per_week: n });
      await load();
    } catch (err) {
      toastError("Failed to update sessions/week", err);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await updateSpcClient(userId, { notes_goals_feedback: notesDraft });
      await load();
    } catch (err) {
      toastError("Failed to save notes", err);
    } finally {
      setSavingNotes(false);
    }
  };

  // Start date is always computed, never typed — day after whichever block
  // is currently latest, or today if this client has never had one. "Copy
  // last block" reuses that block's own length; "Start blank" uses the
  // program-wide default.
  const handleCreateBlockChoice = async (mode) => {
    const latest = blocks[0] ?? null;
    const startDate = latest ? addDays(latest.block_end_date, 1) : todayInBoise();
    const lengthWeeks = mode === "copy" && latest ? latest.block_length_weeks : defaultLengthWeeks;
    try {
      const newBlock = await createSpcBlock({
        spcClientId: userId,
        coachId: client?.assigned_coach_id ?? profile.id,
        startDate,
        lengthWeeks,
        sessionsPerWeek: client?.sessions_per_week ?? 2,
      });
      if (mode === "copy" && latest) {
        await copyLastBlockContent(latest.id, newBlock.id);
      }
      await load();
    } catch (err) {
      toastError("Failed to create block", err);
      throw err;
    }
  };

  // Starts right where THIS gap begins (day after whichever block ends just
  // before it, or today if there's no preceding block at all) rather than
  // asking the coach to pick a date — same gap-aware approach as Group
  // Programs' handleStartGapBlock, which structurally can't create an
  // overlapping block since it never lets a free-typed date land inside an
  // existing one. createSpcBlock also double-checks this server-side now.
  const handleStartGapBlock = async (gapRows) => {
    setStartingGap(true);
    try {
      const precedingBlock = blocks
        .filter((b) => b.block_end_date < gapRows[0].weekDate)
        .sort((a, b) => (a.block_end_date < b.block_end_date ? 1 : -1))[0];
      const startDate = precedingBlock ? addDays(precedingBlock.block_end_date, 1) : todayInBoise();
      await createSpcBlock({
        spcClientId: userId,
        coachId: client?.assigned_coach_id ?? profile.id,
        startDate,
        lengthWeeks: defaultLengthWeeks,
        sessionsPerWeek: client?.sessions_per_week ?? 2,
      });
      await load();
    } catch (err) {
      toastError("Failed to start new block", err);
    } finally {
      setStartingGap(false);
    }
  };

  const startCopy = (workout, weekNum) => {
    setCopySource({ workoutId: workout.id, sessionNumber: workout.session_number, weekNum });
    setCopyTargets(new Set());
  };

  const toggleCopyTarget = (workoutId) => {
    setCopyTargets((prev) => {
      const next = new Set(prev);
      if (next.has(workoutId)) next.delete(workoutId);
      else next.add(workoutId);
      return next;
    });
  };

  const handleConfirmCopy = async () => {
    const targets = [...copyTargets];
    if (targets.length === 0) return;
    const nonEmptyCount = targets.filter((id) => (exercisesByWorkout[id]?.length ?? 0) > 0).length;
    if (nonEmptyCount > 0) {
      const proceed = await confirmOverwrite(nonEmptyCount);
      if (!proceed) return;
    }
    setCopyBusy(true);
    try {
      await Promise.all(targets.map((id) => copySpcWorkoutContent(copySource.workoutId, id)));
      await load();
      cancelCopy();
    } catch (err) {
      toastError("Failed to copy session", err);
    } finally {
      setCopyBusy(false);
    }
  };

  const labeledBlocks = useMemo(() => labelBlocks(blocks), [blocks]);
  const blockLabelsById = useMemo(() => new Map(labeledBlocks.map((b) => [b.id, b.label])), [labeledBlocks]);

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong: {loadError}
          </Text>
        </View>
      </CoachShell>
    );
  }

  if (!member || !client) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  const today = todayInBoise();
  const columns = client.sessions_per_week ?? 2;

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: "#faf8f6" }} contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 32, maxWidth: 960 }}>
        <Link href="/(coach)/spc" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, marginBottom: 18, fontSize: 13 }}>
          ‹ Back to SPC
        </Link>

        <View className="mb-6 flex-row items-center gap-3.5">
          <View className="items-center justify-center rounded-full" style={{ width: 52, height: 52, backgroundColor: "#fdf6f2" }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: colors.primaryOnWhite }}>{initials(member.name)}</Text>
          </View>
          <View>
            <Text style={{ fontFamily: fonts.display, color: colors.primary, fontSize: 22 }}>{member.name}</Text>
            <Text className="text-xs" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite, textTransform: "uppercase", letterSpacing: 0.4 }}>
              SPC
            </Text>
          </View>
        </View>

        {/* Unified profile card — Status pills full-width, then a divider,
            then Assigned coach + Sessions/week side by side. Replaces the
            three previously-disconnected Status/Coach/Sessions boxes. */}
        <Card>
          <Eyebrow>Status</Eyebrow>
          <View className="mb-[18px] flex-row flex-wrap gap-2">
            {Object.entries(STATUS_LABELS).map(([status, label]) => {
              const active = client.status === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => handleStatus(status)}
                  className="rounded-full px-4"
                  style={{ paddingVertical: active ? 8 : 7.5, backgroundColor: active ? "#eef1e7" : "white", borderWidth: active ? 0 : 1, borderColor: "#d9d4cd" }}
                >
                  <Text style={{ fontFamily: active ? fonts.sansBold : fonts.sansSemiBold, color: active ? "#4d6142" : "#57534e", fontSize: 12.5 }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: isWeb ? "row" : "column", gap: 32, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#ece7e1", flexWrap: "wrap" }}>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Eyebrow>Assigned coach</Eyebrow>
              <CoachDropdown value={client.assigned_coach_id} coaches={coaches} onChange={handleCoachReassign} />
            </View>
            <View style={{ flex: 1, minWidth: 220 }}>
              <Eyebrow>Sessions per week</Eyebrow>
              <View style={{ maxWidth: 260 }}>
                <SegmentedControl
                  segments={SESSIONS_PER_WEEK_OPTIONS}
                  activeKey={String(client.sessions_per_week ?? 2)}
                  onSelect={(key) => handleSessionsSelect(Number(key))}
                />
              </View>
            </View>
          </View>
        </Card>

        <Card>
          <Eyebrow>Notes / goals / feedback</Eyebrow>
          <TextInput
            value={notesDraft}
            onChangeText={setNotesDraft}
            multiline
            numberOfLines={5}
            placeholder="Goals, injury notes, preferences, hold/pause reasons…"
            className="mb-3 min-h-28 rounded-lg border border-stone-300 px-4 py-3"
            style={{ fontFamily: fonts.sans, fontSize: 13.5 }}
          />
          <Pressable
            onPress={handleSaveNotes}
            disabled={savingNotes}
            className="self-start rounded-lg px-4 py-2.5 disabled:opacity-50"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
              {savingNotes ? "Saving…" : "Save notes"}
            </Text>
          </Pressable>
        </Card>

        <View className="mb-3.5 flex-row items-center justify-between">
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 15 }} className="text-stone-700">
            Blocks
          </Text>
          <View className="flex-row items-center gap-2.5">
            {isWeb && (
              <Pressable
                onPress={() => setModalVisible(true)}
                className="rounded-lg px-4 py-2.5"
                style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 16 }}
              >
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                  + New block
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push(`/(coach)/spc/history/${userId}`)}
              className="rounded-lg border px-4 py-2.5"
              style={{ borderColor: "#d9d4cd" }}
            >
              <Text className="text-stone-700" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                History
              </Text>
            </Pressable>
          </View>
        </View>

        {!gridRows ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-5">
              <View className="flex-row items-start gap-4">
                <View style={{ width: ROW_LABEL_WIDTH }}>
                  <View style={{ height: 34 }} />
                  {gridRows.map((row, idx) => {
                    const isNewBlockStart = row.block && row.block.id !== gridRows[idx - 1]?.block?.id;
                    const weekEnd = addDays(row.weekDate, 6);
                    return (
                      <View key={row.offset} style={{ minHeight: CELL_MIN_HEIGHT }} className="mb-3 justify-center">
                        <Text style={{ fontFamily: fonts.sansBold, fontSize: 12.5, color: row.offset === 0 ? "#4d6142" : "#57534e" }}>
                          {row.label}
                        </Text>
                        <Text style={{ fontFamily: fonts.sans, fontSize: 10.5 }} className="mt-0.5 text-stone-400">
                          {formatDateMD(row.weekDate)} - {formatDateMD(weekEnd)}
                        </Text>
                        {isNewBlockStart ? (
                          <Link href={`/(coach)/spc/blocks/${row.block.id}`} style={{ fontFamily: fonts.sansBold, fontSize: 11, color: colors.primaryOnWhite, marginTop: 2 }}>
                            {blockLabelsById.get(row.block.id) ?? "Block"} ›
                          </Link>
                        ) : null}
                      </View>
                    );
                  })}
                </View>

                <View
                  style={{
                    width: columns * SESSION_COL_WIDTH + (columns - 1) * CELL_GAP + 28,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: "#e7e5e4",
                    padding: 14,
                  }}
                >
                  <View className="mb-3 flex-row gap-3">
                    {Array.from({ length: columns }, (_, i) => i + 1).map((n) => (
                      <View key={n} style={{ width: SESSION_COL_WIDTH }} className="items-center">
                        <Text className="text-xs uppercase text-stone-500" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
                          Session {n}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {groupRows(gridRows).map((group, idx) =>
                    group.type === "covered" ? (
                      <View key={group.row.offset} className="mb-3 flex-row gap-3">
                        {Array.from({ length: columns }, (_, i) => i + 1).map((sessionNum) => {
                          const workout = group.row.sessions.find((w) => w.session_number === sessionNum);
                          if (!workout) return <PlaceholderCell key={sessionNum} />;

                          const hasContent = (exercisesByWorkout[workout.id] ?? []).length > 0;
                          let copyRole;
                          let cellOnPress;
                          if (copySource) {
                            if (workout.id === copySource.workoutId) {
                              copyRole = "source";
                              cellOnPress = cancelCopy;
                            } else {
                              copyRole = copyTargets.has(workout.id) ? "selected" : "eligible";
                              cellOnPress = () => toggleCopyTarget(workout.id);
                            }
                          } else {
                            cellOnPress = () => router.push(`/(coach)/spc/builder/${workout.id}`);
                          }

                          return (
                            <SessionCell
                              key={sessionNum}
                              workout={workout}
                              weekNum={group.row.weekNum}
                              exerciseNames={exercisesByWorkout[workout.id] ?? []}
                              onPress={cellOnPress}
                              highlight={group.row.offset === 0}
                              copyRole={copyRole}
                              onStartCopy={isWeb && hasContent ? () => startCopy(workout, group.row.weekNum) : undefined}
                            />
                          );
                        })}
                      </View>
                    ) : (
                      <GapSlot
                        key={`gap-${idx}`}
                        rowCount={group.rows.length}
                        groupWidth={columns * SESSION_COL_WIDTH + (columns - 1) * CELL_GAP}
                        onStart={isWeb ? () => handleStartGapBlock(group.rows) : undefined}
                        starting={startingGap}
                      />
                    )
                  )}
                </View>
              </View>
            </ScrollView>

            {copySource && (
              <View style={{ maxWidth: 900, marginBottom: 20, position: Platform.OS === "web" ? "sticky" : "relative", bottom: 16 }}>
                <View
                  className="flex-row items-center justify-between rounded-xl px-4 py-3"
                  style={{ backgroundColor: "#44403c", shadowColor: "#44403c", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.25, shadowRadius: 28 }}
                >
                  <Text style={{ color: "white", fontFamily: fonts.sans, fontSize: 13 }}>
                    Copying{" "}
                    <Text style={{ fontFamily: fonts.sansBold }}>
                      Session {copySource.sessionNumber} · Wk {copySource.weekNum}
                    </Text>{" "}
                    — {copyTargets.size} tile{copyTargets.size === 1 ? "" : "s"} selected
                  </Text>
                  <View className="flex-row gap-2">
                    <Pressable onPress={cancelCopy} className="rounded-lg border px-3.5 py-2" style={{ borderColor: "#78716c" }}>
                      <Text style={{ color: "white", fontFamily: fonts.sansSemiBold, fontSize: 12.5 }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleConfirmCopy}
                      disabled={copyTargets.size === 0 || copyBusy}
                      className="rounded-lg px-3.5 py-2"
                      style={{ backgroundColor: colors.primary, opacity: copyTargets.size === 0 || copyBusy ? 0.5 : 1 }}
                    >
                      <Text style={{ color: "white", fontFamily: fonts.sansBold, fontSize: 12.5 }}>
                        {copyBusy ? "Copying…" : `Copy to ${copyTargets.size} tile${copyTargets.size === 1 ? "" : "s"}`}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </>
        )}

        <NewSpcBlockChoiceModal
          visible={modalVisible}
          nextLabel={`Block ${labeledBlocks.length + 1}`}
          latestBlockLabel={labeledBlocks[0]?.label ?? null}
          weeksAgo={labeledBlocks[0] ? weeksSince(labeledBlocks[0].block_end_date, today) : 0}
          preview={latestBlockPreview}
          onClose={() => setModalVisible(false)}
          onSubmit={handleCreateBlockChoice}
        />
      </ScrollView>
    </CoachShell>
  );
}
