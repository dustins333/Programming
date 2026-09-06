import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Modal, ActivityIndicator, ScrollView } from "react-native";
import { PressFade } from "../PressFade";
import { buildMonthGrid, stepMonth, MONTH_LABELS, WEEKDAY_LABELS } from "../../lib/monthGrid";
import { todayInBoise, addDays } from "../../lib/boiseDate";
import { formatDateShort } from "../../lib/formatDate";
import {
  listBenchmarkEvents,
  createBenchmarkEvent,
  updateBenchmarkEvent,
  deleteBenchmarkEvent,
  benchmarkPhase,
} from "../../lib/programming/benchmark";
import { confirmDeleteBenchmark } from "../../lib/confirmDialog";
import { showToast } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";

// Benchmark Day, from the coach's side. This screen is deliberately in the
// app's NORMAL warm style, not the member feature's neon — it is an ordinary
// settings screen that happens to configure a loud one.
//
// Three dates and nothing else. There is no publish button and no status
// column: an event whose window covers today IS live, so the timeline below
// the card is a real read of what a member is seeing right now rather than a
// preview of what would happen if someone remembered to press something.

const LINE = "#f4efe9";
const BORDER = "#ece7e1";
const CONTROL_BORDER = "#d9d4cd";
const INK = "#44403c";
const INK_SUB = "#78716c";
const CARD_SHADOW = {
  shadowColor: "#44403c",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.045,
  shadowRadius: 14,
  elevation: 2,
};

export function BenchmarkSettings() {
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(null); // 'show_from' | 'benchmark_day' | 'hide_after'
  const [nameDraft, setNameDraft] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const rows = await listBenchmarkEvents();
      setEvents(rows);
      setSelectedId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) return prev;
        // Default to whatever is live or coming up, falling back to the most
        // recent — a coach opening this is nearly always looking at the next
        // one, not last quarter's.
        const today = todayInBoise();
        const upcoming = [...rows].reverse().find((r) => r.hide_after >= today);
        return (upcoming ?? rows[0])?.id ?? null;
      });
    } catch (err) {
      console.error("Benchmark settings: failed to load", err);
      setLoadError("Couldn't load benchmark days.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = events.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    setNameDraft(selected?.name ?? "");
  }, [selected?.id, selected?.name]);

  const patch = async (fields) => {
    if (!selected) return;
    const before = selected;
    // Optimistic, so a date tap lands instantly on a screen that is otherwise
    // just four fields; rolled back on failure rather than left lying.
    setEvents((rows) => rows.map((r) => (r.id === before.id ? { ...r, ...toRow(fields) } : r)));
    setSaving(true);
    try {
      const saved = await updateBenchmarkEvent(before.id, fields);
      setEvents((rows) => rows.map((r) => (r.id === saved.id ? saved : r)));
    } catch (err) {
      console.error("Benchmark settings: failed to save", err);
      setEvents((rows) => rows.map((r) => (r.id === before.id ? before : r)));
      showToast("Couldn't save that change.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const today = todayInBoise();
    setSaving(true);
    try {
      // A sensible starting shape she then moves: the window the gym actually
      // runs, twelve days of countdown and a week of results.
      const created = await createBenchmarkEvent({
        name: "New benchmark",
        showFrom: today,
        benchmarkDay: addDays(today, 12),
        hideAfter: addDays(today, 19),
      });
      setEvents((rows) => [created, ...rows]);
      setSelectedId(created.id);
    } catch (err) {
      console.error("Benchmark settings: failed to create", err);
      showToast("Couldn't create that benchmark.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    const ok = await confirmDeleteBenchmark(selected.name);
    if (!ok) return;
    setSaving(true);
    try {
      await deleteBenchmarkEvent(selected.id);
      setEvents((rows) => rows.filter((r) => r.id !== selected.id));
      setSelectedId(null);
      await load();
    } catch (err) {
      console.error("Benchmark settings: failed to delete", err);
      showToast("Couldn't delete that benchmark.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View className="rounded-2xl border p-5" style={{ borderColor: BORDER, backgroundColor: "#fff" }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: INK }}>{loadError}</Text>
        <PressFade onPress={load} style={{ marginTop: 12, alignSelf: "flex-start" }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>Try again</Text>
        </PressFade>
      </View>
    );
  }

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between" style={{ gap: 12, flexWrap: "wrap" }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, letterSpacing: 1.3, color: "#a8a29e" }}>
          BENCHMARK DAY
        </Text>
        <PressFade onPress={handleCreate} disabled={saving} style={{ opacity: saving ? 0.5 : 1 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: colors.primaryOnWhite }}>+ New benchmark</Text>
        </PressFade>
      </View>

      {events.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {events.map((e) => {
              const active = e.id === selectedId;
              return (
                <PressFade
                  key={e.id}
                  onPress={() => setSelectedId(e.id)}
                  style={{
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : CONTROL_BORDER,
                    backgroundColor: active ? "#fdf6f2" : "#fff",
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: fonts.sansSemiBold,
                      fontSize: 12.5,
                      color: active ? colors.primaryOnWhite : INK_SUB,
                    }}
                  >
                    {e.name} | {formatDateShort(e.benchmark_day)}
                  </Text>
                </PressFade>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      {!selected ? (
        <View className="rounded-2xl border p-5" style={{ borderColor: BORDER, backgroundColor: "#fff", ...CARD_SHADOW }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: INK_SUB }}>
            No benchmark days yet. Add one and the button appears on every member's My Week on the date you pick.
          </Text>
        </View>
      ) : (
        <>
          <View
            className="rounded-2xl border"
            style={{ borderColor: BORDER, backgroundColor: "#fff", ...CARD_SHADOW, overflow: "hidden" }}
          >
            <Row label="Benchmark name" first>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                onBlur={() => {
                  const next = nameDraft.trim();
                  if (next && next !== selected.name) patch({ name: next });
                  else setNameDraft(selected.name);
                }}
                placeholder="Labor Day"
                placeholderTextColor="#a8a29e"
                style={{
                  minHeight: 40,
                  // An <input> takes its own intrinsic width on
                  // react-native-web and will not shrink for a minWidth — it
                  // rendered 181px against a 130 minimum and wrapped the label
                  // beside it onto two lines. Pin it. Never a bare `flex: 0`
                  // here: that compiles to `flex: 0 1 0%`, whose 0% basis
                  // collapses the width to nothing.
                  width: 140,
                  flexGrow: 0,
                  flexShrink: 0,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: CONTROL_BORDER,
                  paddingHorizontal: 12,
                  textAlign: "right",
                  fontFamily: fonts.sansSemiBold,
                  fontSize: 13,
                  color: INK,
                }}
              />
            </Row>

            <Row label="Show on My Week from" sub="The button appears, counting down.">
              <DateControl value={selected.show_from} onPress={() => setPicking("show_from")} />
            </Row>

            <Row label="Benchmark Day" sub="Logging opens. Kettlebells go live.">
              <DateControl value={selected.benchmark_day} emphasis onPress={() => setPicking("benchmark_day")} />
            </Row>

            <Row label="Hide from My Week after" sub="Her card moves to history.">
              <DateControl value={selected.hide_after} onPress={() => setPicking("hide_after")} />
            </Row>
          </View>

          <Text
            style={{
              fontFamily: fonts.sansBold,
              fontSize: 10.5,
              letterSpacing: 1.3,
              color: "#a8a29e",
              marginTop: 22,
              marginBottom: 10,
            }}
          >
            WHAT SHE SEES
          </Text>

          <View
            className="rounded-2xl border p-4"
            style={{ borderColor: BORDER, backgroundColor: "#fff", ...CARD_SHADOW }}
          >
            {timeline(selected).map((step, i) => (
              <View key={step.date} style={{ flexDirection: "row", gap: 12, marginTop: i === 0 ? 0 : 12 }}>
                <Text
                  style={{
                    width: 66,
                    fontFamily: fonts.sansBold,
                    fontSize: 12,
                    color: step.now ? colors.primaryOnWhite : INK_SUB,
                  }}
                >
                  {formatDateShort(step.date)}
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontFamily: fonts.sansBold,
                      fontSize: 13,
                      color: step.now ? colors.primaryOnWhite : INK,
                    }}
                  >
                    {step.title}
                    {step.now ? "  ·  now" : ""}
                  </Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: INK_SUB, marginTop: 2 }}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>

          <PressFade onPress={handleDelete} disabled={saving} style={{ marginTop: 18, alignSelf: "flex-start", opacity: saving ? 0.5 : 1 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#b23a22" }}>Delete this benchmark</Text>
          </PressFade>
        </>
      )}

      <DatePickerSheet
        visible={!!picking}
        title={picking ? FIELD_LABELS[picking] : ""}
        value={picking && selected ? selected[picking] : null}
        onClose={() => setPicking(null)}
        onPick={(date) => {
          const field = picking;
          setPicking(null);
          if (!field || !selected) return;
          const next = { ...selected, [field]: date };
          if (!(next.show_from <= next.benchmark_day && next.benchmark_day <= next.hide_after)) {
            showToast("Those dates have to run in order: show, benchmark, hide.");
            return;
          }
          patch({ [FIELD_KEYS[field]]: date });
        }}
      />
    </View>
  );
}

const FIELD_LABELS = {
  show_from: "Show on My Week from",
  benchmark_day: "Benchmark Day",
  hide_after: "Hide from My Week after",
};

const FIELD_KEYS = {
  show_from: "showFrom",
  benchmark_day: "benchmarkDay",
  hide_after: "hideAfter",
};

function toRow(fields) {
  const out = {};
  if (fields.name !== undefined) out.name = fields.name;
  if (fields.showFrom !== undefined) out.show_from = fields.showFrom;
  if (fields.benchmarkDay !== undefined) out.benchmark_day = fields.benchmarkDay;
  if (fields.hideAfter !== undefined) out.hide_after = fields.hideAfter;
  return out;
}

function Row({ label, sub, children, first = false }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: LINE,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: INK }}>{label}</Text>
        {sub ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: INK_SUB, marginTop: 3 }}>{sub}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function DateControl({ value, onPress, emphasis = false }) {
  return (
    <PressFade
      onPress={onPress}
      accessibilityRole="button"
      style={{
        minHeight: 40,
        minWidth: 84,
        borderRadius: 9,
        borderWidth: emphasis ? 1.5 : 1,
        borderColor: emphasis ? colors.primary : CONTROL_BORDER,
        backgroundColor: emphasis ? "#fdf6f2" : "#fff",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
      }}
    >
      <Text
        style={{
          fontFamily: emphasis ? fonts.sansBold : fonts.sansSemiBold,
          fontSize: 13,
          color: emphasis ? colors.primaryOnWhite : INK,
        }}
      >
        {formatDateShort(value)}
      </Text>
    </PressFade>
  );
}

// The four moments in order, with the one she is living in right now marked.
// Read from the real dates, so a coach editing one watches this move.
function timeline(event) {
  const phase = benchmarkPhase(event);
  return [
    {
      date: event.show_from,
      title: "Counting down",
      body: "Button shows, board is locked.",
      now: phase === "countdown",
    },
    {
      date: event.benchmark_day,
      title: "Logging open",
      body: "She places her kettlebells and keys her numbers.",
      now: phase === "live",
    },
    {
      date: addDays(event.benchmark_day, 1),
      title: "Card ready",
      body: "Results stay on My Week, kettlebells lock.",
      now: phase === "results",
    },
    {
      date: addDays(event.hide_after, 1),
      title: "Off My Week",
      body: "Everything logged stays in her history.",
      now: false,
    },
  ];
}

// A plain month grid. Every other calendar in this app is constrained to
// something (Mondays for photo cadence, a pay period's own days), and none of
// those constraints apply here — a benchmark can land on any day the gym picks.
function DatePickerSheet({ visible, title, value, onClose, onPick }) {
  const [view, setView] = useState(() => monthOf(value));

  // Seeded synchronously on open rather than in an effect: an effect runs a
  // tick late and the calendar would flash the wrong month first.
  const [openedFor, setOpenedFor] = useState(null);
  if (visible && openedFor !== value) {
    setOpenedFor(value);
    setView(monthOf(value));
  }

  if (!visible) return null;

  const cells = buildMonthGrid(view.year, view.month);
  const today = todayInBoise();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.35)", alignItems: "center", justifyContent: "center", padding: 20 }}
      >
        <Pressable
          onPress={() => {}}
          style={{ width: "100%", maxWidth: 340, borderRadius: 18, backgroundColor: "#fff", padding: 16 }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: INK, marginBottom: 12 }}>{title}</Text>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <PressFade onPress={() => setView((v) => stepMonth(v.year, v.month, -1))} style={{ padding: 10 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: colors.primaryOnWhite }}>‹</Text>
            </PressFade>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: INK }}>
              {MONTH_LABELS[view.month - 1]} {view.year}
            </Text>
            <PressFade onPress={() => setView((v) => stepMonth(v.year, v.month, 1))} style={{ padding: 10 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: colors.primaryOnWhite }}>›</Text>
            </PressFade>
          </View>

          <View style={{ flexDirection: "row" }}>
            {WEEKDAY_LABELS.map((d, i) => (
              <Text
                key={`${d}-${i}`}
                style={{ flex: 1, textAlign: "center", fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", marginBottom: 6 }}
              >
                {d}
              </Text>
            ))}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {cells.map((iso, i) => {
              if (!iso) return <View key={`blank-${i}`} style={{ width: `${100 / 7}%`, height: 40 }} />;
              const selected = iso === value;
              const isToday = iso === today;
              return (
                <View key={iso} style={{ width: `${100 / 7}%`, height: 40, padding: 2 }}>
                  <PressFade
                    onPress={() => onPick(iso)}
                    accessibilityRole="button"
                    style={{
                      flex: 1,
                      borderRadius: 9,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: selected ? colors.primary : "transparent",
                      borderWidth: !selected && isToday ? 1 : 0,
                      borderColor: CONTROL_BORDER,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: selected ? fonts.sansBold : fonts.sansMedium,
                        fontSize: 13,
                        color: selected ? "#fff" : INK,
                      }}
                    >
                      {Number(iso.slice(8, 10))}
                    </Text>
                  </PressFade>
                </View>
              );
            })}
          </View>

          <PressFade onPress={onClose} style={{ alignSelf: "flex-end", marginTop: 10, padding: 8 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: INK_SUB }}>Cancel</Text>
          </PressFade>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function monthOf(iso) {
  const base = iso || todayInBoise();
  return { year: Number(base.slice(0, 4)), month: Number(base.slice(5, 7)) };
}
