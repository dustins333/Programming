import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ActivityIndicator } from "react-native";
import { addDays } from "../lib/boiseDate";
import { formatDateMD, formatDateRange } from "../lib/formatDate";
import { listPushableBlocks, planPush, pushBlockToProgram, isTrialProgram } from "../lib/programming/pushBlock";
import { WeeksStepper } from "./WeeksStepper";

// "Push to…" from the Group Programs page: a trialed block becomes the next
// block of another program. The rules (never overwrite, same sessions a week,
// repeat the source's weeks to fill) live in lib/programming/pushBlock.js;
// this only lets the coach pick and shows where it will land.

function Pill({ active, disabled, onPress, children }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ opacity: disabled ? 0.45 : 1 }}
      className={`rounded-full border px-3.5 py-2.5 ${active ? "border-primary bg-primary" : "border-stone-300"}`}
    >
      <Text className={active ? "text-white" : "text-stone-700"} style={{ fontFamily: "Montserrat_400Regular" }}>
        {children}
      </Text>
    </Pressable>
  );
}

function Label({ children }) {
  return (
    <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: "Montserrat_500Medium" }}>
      {children}
    </Text>
  );
}

export function PushBlockModal({ visible, sourceProgram, programs, createdBy, onClose, onPushed }) {
  const [sources, setSources] = useState(null);
  const [sourceBlockId, setSourceBlockId] = useState(null);
  const [targetId, setTargetId] = useState(null);
  const [plan, setPlan] = useState(null);
  const [lengthWeeks, setLengthWeeks] = useState("6");
  const [publish, setPublish] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const targets = (programs ?? []).filter((p) => p.id !== sourceProgram?.id && !isTrialProgram(p));
  const matches = (p) => p.sessions_per_week === sourceProgram?.sessions_per_week;

  useEffect(() => {
    if (!visible || !sourceProgram) return;
    setSources(null);
    setError(null);
    setPublish(false);
    const first = targets.find(matches);
    setTargetId(first?.id ?? null);
    let cancelled = false;
    listPushableBlocks(sourceProgram.id)
      .then((list) => {
        if (cancelled) return;
        setSources(list);
        setSourceBlockId(list[0]?.block.id ?? null);
      })
      .catch((err) => !cancelled && setError(err.message ?? String(err)));
    return () => {
      cancelled = true;
    };
    // Opening default only, like NewBlockModal's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sourceProgram?.id]);

  useEffect(() => {
    if (!visible || !targetId) {
      setPlan(null);
      return;
    }
    setPlan(null);
    let cancelled = false;
    planPush(targetId)
      .then((p) => {
        if (cancelled) return;
        setPlan(p);
        if (p.mode === "create") setLengthWeeks(String(p.seedLengthWeeks ?? 6));
      })
      .catch((err) => !cancelled && setError(err.message ?? String(err)));
    return () => {
      cancelled = true;
    };
  }, [visible, targetId]);

  const target = targets.find((p) => p.id === targetId) ?? null;
  const source = sources?.find((s) => s.block.id === sourceBlockId) ?? null;
  const length = plan?.mode === "fill" ? plan.lengthWeeks : Number(lengthWeeks);
  const ready = Boolean(source && target && plan && length >= 1);

  const handlePush = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await pushBlockToProgram({
        sourceBlockId,
        targetProgramId: targetId,
        lengthWeeks: length,
        publish,
        createdBy,
      });
      onPushed?.(result);
      onClose();
    } catch (err) {
      setError(err.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/40 px-4">
        <View className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6">
          <Text className="mb-1 text-xl text-primary" style={{ fontFamily: "Montserrat_600SemiBold" }}>
            Push to another program
          </Text>
          <Text className="mb-4 text-xs text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
            Copies a {sourceProgram?.name} block in as the next block of the program you pick. Nothing already
            programmed gets changed.
          </Text>

          <Label>Block to push</Label>
          {sources === null && !error ? (
            <ActivityIndicator style={{ alignSelf: "flex-start", marginBottom: 16 }} />
          ) : sources?.length ? (
            <View className="mb-4 gap-2">
              {sources.map(({ block, titles, weeks }) => {
                const active = block.id === sourceBlockId;
                return (
                  <Pressable
                    key={block.id}
                    onPress={() => setSourceBlockId(block.id)}
                    className={`rounded-xl border px-3.5 py-2.5 ${active ? "border-primary bg-primary" : "border-stone-300"}`}
                  >
                    <Text className={active ? "text-white" : "text-stone-800"} style={{ fontFamily: "Montserrat_600SemiBold", fontSize: 13 }}>
                      Week of {formatDateMD(block.block_start_date)}
                      {weeks > 1 ? ` · ${weeks} weeks` : ""}
                    </Text>
                    {titles.length ? (
                      <Text
                        numberOfLines={1}
                        className={active ? "text-white" : "text-stone-500"}
                        style={{ fontFamily: "Montserrat_400Regular", fontSize: 12, marginTop: 2 }}
                      >
                        {titles.join(" · ")}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
              {sourceProgram?.name} has no blocks with anything in them yet.
            </Text>
          )}

          <Label>Push to</Label>
          <View className="mb-1 flex-row flex-wrap gap-2">
            {targets.map((p) => (
              <Pill key={p.id} active={p.id === targetId} disabled={!matches(p)} onPress={() => setTargetId(p.id)}>
                {p.name}
              </Pill>
            ))}
          </View>
          {targets.some((p) => !matches(p)) ? (
            <Text className="mb-4 text-xs text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
              Greyed programs run a different number of sessions a week than {sourceProgram?.name} (
              {sourceProgram?.sessions_per_week}), so the sessions wouldn't line up.
            </Text>
          ) : (
            <View className="mb-4" />
          )}

          {target && !plan && !error ? <ActivityIndicator style={{ alignSelf: "flex-start", marginBottom: 16 }} /> : null}

          {target && plan?.mode === "create" ? (
            <>
              <Label>Length</Label>
              <View className="mb-4">
                <WeeksStepper value={lengthWeeks} onChange={setLengthWeeks} />
              </View>
            </>
          ) : null}

          {target && plan && length >= 1 ? (
            <View className="mb-4 rounded-xl bg-stone-100 px-3.5 py-3">
              <Text className="text-sm text-stone-800" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                {formatDateRange(plan.startDate, addDays(plan.startDate, length * 7 - 1))}
              </Text>
              <Text className="mt-1 text-xs text-stone-600" style={{ fontFamily: "Montserrat_400Regular" }}>
                {plan.mode === "fill"
                  ? `Fills the empty block ${target.name} already has queued.`
                  : plan.lastBlock
                    ? `A new ${target.name} block, starting the Monday after its current one ends.`
                    : `A new ${target.name} block, starting this week.`}
                {source && source.weeks < length
                  ? ` The ${source.weeks === 1 ? "week" : `${source.weeks} weeks`} you trialed ${source.weeks === 1 ? "repeats" : "repeat"} across all ${length} weeks.`
                  : ""}
                {plan.endsRolling ? ` ${target.name}'s current block stops adding weeks on its own.` : ""}
              </Text>
            </View>
          ) : null}

          <Label>Members see it</Label>
          <View className="mb-1 flex-row gap-2">
            <Pill active={!publish} onPress={() => setPublish(false)}>
              Keep as drafts
            </Pill>
            <Pill active={publish} onPress={() => setPublish(true)}>
              Publish now
            </Pill>
          </View>
          <Text className="mb-5 text-xs text-stone-500" style={{ fontFamily: "Montserrat_400Regular" }}>
            {publish
              ? "Members will see each week when it comes up."
              : "Members won't see it until it's published. Review it on the grid first."}
          </Text>

          {error ? (
            <Text className="mb-4 text-sm" style={{ fontFamily: "Montserrat_500Medium", color: "#b23a22" }}>
              {error}
            </Text>
          ) : null}

          <View className="flex-row justify-end gap-3">
            <Pressable onPress={onClose} className="rounded-lg border border-stone-300 px-4 py-3">
              <Text style={{ fontFamily: "Montserrat_500Medium" }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handlePush}
              disabled={saving || !ready}
              style={{ opacity: saving || !ready ? 0.5 : 1 }}
              className="rounded-lg bg-primary px-4 py-3"
            >
              <Text className="text-white" style={{ fontFamily: "Montserrat_600SemiBold" }}>
                {saving ? "Pushing…" : target ? `Push to ${target.name}` : "Push"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
