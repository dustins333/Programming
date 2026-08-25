import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { summarizeRepScheme } from "../../lib/programming/exercises";
import { warmupNumbersFor } from "../../lib/programming/sessionLabels";
import { repUnit } from "../../lib/programming/repUnit";
import { fonts, colors } from "../../lib/theme";

// The session builder, in pieces — shared by the group, SPC and SPC-template
// web builders (design_handoff_coach_web_v2, screen 06).
//
// All three were separate near-identical copies of the same screen, which is
// exactly how they drifted the last time: the group builder was rebuilt to the
// v2 layout and the other two were left on the old permanently-expanded cards.
// Same reasoning as ExerciseLibrarySidebar, which was extracted out of the same
// three files for the same reason.
//
// What differs between them is passed in, not forked:
//   group     — tempo, supersets, balance + last-week rails, draft/publish
//   SPC       — same, per-client rather than per-program
//   templates — no tempo, no supersets, no rails (a template is one flat
//               prescription with no block or siblings to compare against)

export const BUILDER_CANVAS = "#faf8f6";
export const BUILDER_CARD_BORDER = "#ece7e1";

const CARD_BORDER = BUILDER_CARD_BORDER;
const REST_CHIPS = [60, 90, 120, 180];

// Coaches say "sixty" and "ninety", not "one minute" and "one thirty" — so
// anything under two minutes stays in seconds, and only whole minutes from
// 2:00 up get clock notation.
export function formatRest(seconds) {
  if (seconds == null || seconds === "") return "—";
  const n = Number(String(seconds).replace(/[^0-9]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return String(seconds);
  if (n < 120 || n % 60 !== 0) return `${n}s`;
  return `${n / 60}:00`;
}

// "4 × 8,8,6,6" when the sets differ, "3 × 12" when they don't — the same
// summary the grid tiles and the member app show.
export function schemeLabel(item, exercise = item.exercises) {
  const u = repUnit(exercise).suffix;
  const tag = (v) => (v === "" || v == null ? "—" : `${v}${u}`);
  const scheme = item.rep_scheme?.length ? item.rep_scheme : null;
  if (scheme) {
    const unique = [...new Set(scheme.map((r) => (r ?? "").trim()))];
    return `${scheme.length} × ${unique.length === 1 ? tag(unique[0]) : scheme.map((r) => tag((r ?? "").trim())).join(",")}`;
  }
  return `${item.sets ?? 0} × ${tag(item.reps)}`;
}

export function Eyebrow({ children, style }) {
  return (
    <Text style={[{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.2, color: "#a8a29e" }, style]}>
      {children}
    </Text>
  );
}

// Every write on these screens is optimistic-then-persist, so this light is
// the only thing telling a coach the round trip actually landed.
export function SaveLight({ state }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 99,
          backgroundColor: state === "error" ? "#b23a22" : state === "saving" ? "#c58a3a" : "#4d6142",
        }}
      />
      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>
        {state === "error" ? "Not saved" : state === "saving" ? "Saving…" : "Saved"}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------- warm-up */

// The grid is a fixed 2x3, and the add handlers refuse to exceed it. Both
// halves have to agree or you get a row that exists but cannot be reached.
export const WARMUP_SLOTS = 6;

// A fixed 2×3 grid of six slots rather than a growing list — the coaching
// convention here is five or six movements, so the empty slots are the
// prompt and there's nothing to "add a row" to.
//
// Order runs DOWN the columns (1,2,3 left / 4,5,6 right), not across the
// rows — per Terra 2026-08-23, matching how the paper sheet reads. Numbers
// come from warmupNumbersFor, so superset members repeat the shared number
// (3,4,5 supersetted all read "3") and empty slots continue the sequence.
export function WarmupGrid({ warmups, onChange, onRemove, onAdd, onToggleLink, editable = true }) {
  // Pad to six, but never truncate past it. This used to render
  // slots.slice(0, 6), so a seventh warm-up saved fine and then simply was
  // not drawn — invisible to the coach who added it, while still showing to
  // members and on the printed sheet, and with no way to remove it because
  // the row it lived on did not exist. Over-cap rows now render so they can
  // be seen and deleted; the add paths refuse to create them in the first
  // place.
  const slots = [...warmups];
  while (slots.length < WARMUP_SLOTS) slots.push(null);
  const numbers = warmupNumbersFor(warmups);
  const lastNumber = warmups.length ? numbers[warmups.length - 1] : 0;

  const renderCell = (w, i) => {
    if (!w) {
      // Empty slots keep counting from wherever the real warm-ups left off,
      // so the blank rows still read like the pre-numbered paper sheet.
      const emptyOrdinal = i - warmups.length;
      return (
        <Pressable
          key={`slot-${i}`}
          onPress={onAdd}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: "#ddd8d1",
            borderRadius: 10,
            paddingVertical: 10,
            paddingHorizontal: 12,
          }}
        >
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#d6d1ca", width: 14 }}>
            {lastNumber + emptyOrdinal + 1}
          </Text>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#a8a29e" }}>+ Insert warm-up</Text>
        </Pressable>
      );
    }
    const linked = Boolean(w.superset_group_id);
    return (
      <View
        key={w.id}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: linked ? "#fdf6f2" : "#fff",
          borderWidth: 1,
          borderColor: linked ? "#f0ddd2" : CARD_BORDER,
          borderRadius: 10,
          paddingVertical: 9,
          paddingHorizontal: 12,
        }}
      >
        <Text
          style={{
            fontFamily: linked ? fonts.sansBold : fonts.sans,
            fontSize: 11,
            color: linked ? "#b23a22" : "#c9c4bd",
            width: 14,
          }}
        >
          {numbers[i]}
        </Text>
        {/* Superset with the previous warm-up (in numbering order). Every
            cell but the first reserves the slot so names line up. */}
        {onToggleLink ? (
          i > 0 ? (
            <Pressable
              onPress={() => onToggleLink(w, i)}
              hitSlop={6}
              accessibilityLabel={
                linked ? "Break this warm-up superset" : "Superset with the previous warm-up"
              }
            >
              <Ionicons name={linked ? "link" : "link-outline"} size={14} color={linked ? "#b23a22" : "#d5cdc4"} />
            </Pressable>
          ) : (
            <View style={{ width: 14 }} />
          )
        ) : null}
        <Text style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c" }} numberOfLines={1}>
          {w.exercises?.name ?? w.label ?? "Warm-up"}
        </Text>
        {/* template_warmups has no sets/reps columns at all, unlike
            group and SPC — so the template builder passes editable=false
            and shows the movement alone rather than dead inputs. */}
        {editable ? (
          <>
            {/* Real boxed inputs — the old borderless fields read as static
                text, and coaches didn't realise sets/reps were editable
                here at all (this bit twice: the "stuck" report during the
                print work, and again 2026-08-23). */}
            <TextInput
              value={w.sets ?? ""}
              onChangeText={(v) => onChange(w.id, { sets: v })}
              placeholder="—"
              placeholderTextColor="#c9c4bd"
              style={{
                width: 36,
                borderWidth: 1,
                borderColor: CARD_BORDER,
                borderRadius: 6,
                backgroundColor: "#faf8f6",
                paddingVertical: 4,
                paddingHorizontal: 5,
                fontFamily: fonts.sans,
                fontSize: 12,
                color: "#57534e",
                textAlign: "center",
              }}
            />
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>×</Text>
            <TextInput
              value={w.reps ?? ""}
              onChangeText={(v) => onChange(w.id, { reps: v })}
              placeholder="reps"
              placeholderTextColor="#c9c4bd"
              style={{
                width: 72,
                borderWidth: 1,
                borderColor: CARD_BORDER,
                borderRadius: 6,
                backgroundColor: "#faf8f6",
                paddingVertical: 4,
                paddingHorizontal: 7,
                fontFamily: fonts.sans,
                fontSize: 12,
                color: "#57534e",
              }}
            />
          </>
        ) : null}
        <Pressable onPress={() => onRemove(w.id)} hitSlop={8} accessibilityLabel={`Remove ${w.exercises?.name ?? "warm-up"}`}>
          <Text style={{ color: "#c9c4bd", fontSize: 13 }}>✕</Text>
        </Pressable>
      </View>
    );
  };

  // Two real column Views rather than a flex-wrap row: wrap order is
  // row-major, which would put 1,2 / 3,4 / 5,6 back. On a rail too narrow
  // for two columns the outer row wraps and the columns stack, reading
  // 1..3 then 4..6 — still in order.
  const rows = Math.ceil(slots.length / 2);
  const columns = [slots.slice(0, rows), slots.slice(rows)];

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <Eyebrow>WARM-UP · {warmups.length} OF {WARMUP_SLOTS}</Eyebrow>
        {warmups.length < WARMUP_SLOTS ? (
          <Pressable onPress={onAdd}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>+ Add</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {columns.map((column, c) => (
          <View key={c} style={{ flexBasis: "48%", flexGrow: 1, minWidth: 240, gap: 10 }}>
            {column.map((w, r) => renderCell(w, c * rows + r))}
          </View>
        ))}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- lifts */

// Common rep ranges as one-tap chips — saves typing the same range into
// every lift (per Terra 2026-08-23).
const QUICK_REPS = ["6-8", "8-10", "10-12", "10-15"];

export function SetTable({ item, onChange }) {
  const scheme = item.rep_scheme?.length ? item.rep_scheme : [item.reps ?? ""];
  // "Uniform" = every set asks the same reps. That's the common case, so the
  // default view is one Sets × Reps pair — the per-set table (the thing that
  // was "a pain to type every single time") is behind "Vary reps by set".
  const uniform = new Set(scheme.map((r) => (r ?? "").trim())).size <= 1;
  const [perSet, setPerSet] = useState(!uniform);
  const commit = (next) => onChange(item.id, { rep_scheme: next, sets: next.length, reps: summarizeRepScheme(next) });

  const reps = scheme[0] ?? "";
  const setCount = scheme.length;

  if (!perSet) {
    return (
      <View style={{ minWidth: 230 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.9, color: "#a8a29e", marginBottom: 5 }}>SETS</Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderWidth: 1,
                borderColor: CARD_BORDER,
                borderRadius: 8,
                backgroundColor: "#fff",
                overflow: "hidden",
              }}
            >
              <Pressable
                onPress={() => setCount > 1 && commit(scheme.slice(0, setCount - 1))}
                hitSlop={6}
                accessibilityLabel="One fewer set"
                style={{ paddingVertical: 8, paddingHorizontal: 11, opacity: setCount > 1 ? 1 : 0.35 }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#57534e" }}>−</Text>
              </Pressable>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: "#2a211c", minWidth: 20, textAlign: "center" }}>
                {setCount}
              </Text>
              <Pressable
                onPress={() => commit([...scheme, reps])}
                hitSlop={6}
                accessibilityLabel="One more set"
                style={{ paddingVertical: 8, paddingHorizontal: 11 }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#57534e" }}>+</Text>
              </Pressable>
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 90 }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.9, color: "#a8a29e", marginBottom: 5 }}>REPS</Text>
            <TextInput
              value={reps}
              onChangeText={(v) => commit(Array(setCount).fill(v))}
              placeholder="10"
              placeholderTextColor="#c9c4bd"
              style={{
                borderWidth: 1,
                borderColor: CARD_BORDER,
                borderRadius: 8,
                backgroundColor: "#fff",
                paddingVertical: 8,
                paddingHorizontal: 10,
                fontFamily: fonts.sansSemiBold,
                fontSize: 13.5,
                color: "#2a211c",
              }}
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
          {QUICK_REPS.map((range) => {
            const active = reps.trim() === range;
            return (
              <Pressable
                key={range}
                onPress={() => commit(Array(setCount).fill(range))}
                style={{
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor: active ? "#33251f" : "#fff",
                  borderWidth: 1,
                  borderColor: active ? "#33251f" : CARD_BORDER,
                }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: active ? "#f7f3ee" : "#57534e" }}>{range}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setPerSet(true)} style={{ marginTop: 9 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.primaryOnWhite }}>Vary reps by set ⌄</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ minWidth: 230 }}>
      <View style={{ borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 10, overflow: "hidden", minWidth: 210 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#faf8f6", paddingVertical: 7, paddingHorizontal: 11 }}>
          <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.9, color: "#a8a29e" }}>SET</Text>
          <Text style={{ flex: 1.4, fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.9, color: "#a8a29e" }}>REPS</Text>
          <Pressable
            onPress={() => commit([...scheme, scheme[scheme.length - 1] ?? ""])}
            hitSlop={8}
            accessibilityLabel="Add a set"
            style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ color: "#fff", fontFamily: fonts.sansBold, fontSize: 13, lineHeight: 15 }}>+</Text>
          </Pressable>
        </View>
        {scheme.map((r, i) => (
          <View
            key={i}
            style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: "#f4f1ec" }}
          >
            <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>Set {i + 1}</Text>
            <TextInput
              value={r ?? ""}
              onChangeText={(v) => commit(scheme.map((prev, idx) => (idx === i ? v : prev)))}
              placeholder="10"
              style={{ flex: 1.4, fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c", paddingVertical: 9 }}
            />
            {scheme.length > 1 ? (
              <Pressable onPress={() => commit(scheme.filter((_, idx) => idx !== i))} hitSlop={8} accessibilityLabel={`Remove set ${i + 1}`} style={{ width: 20 }}>
                <Text style={{ color: "#c9c4bd", fontSize: 12 }}>✕</Text>
              </Pressable>
            ) : (
              <View style={{ width: 20 }} />
            )}
          </View>
        ))}
      </View>
      {/* Collapsing when the sets differ would have to throw away the
          variation, so the link only shows once they're uniform again. */}
      {uniform ? (
        <Pressable onPress={() => setPerSet(false)} style={{ marginTop: 9 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.primaryOnWhite }}>Same reps every set ⌃</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Four digits, not a free string — a tempo is always four numbers and the
// old text field let "3-1-1-0", "3110" and "3/1/1/0" all mean the same thing.
const parseTempoDigits = (value) =>
  String(value ?? "").replace(/[^0-9xX]/g, "").padEnd(4, " ").slice(0, 4).split("");

export function TempoDigits({ value, onChange }) {
  // Local digit state, NOT derived from the prop each render. The old
  // derived version made tempo un-deletable: clearing a box zero-filled it
  // in the saved value, the optimistic prop echoed "0-1-1-0" back, and the
  // "0" popped straight back into the box — so all four boxes could never
  // be blank at once, which was the only path to saving null. Now blanks
  // stay blank on screen, and emptying all four writes null (the reported
  // "coach couldn't delete a tempo" bug, 2026-08-23).
  const [digits, setDigits] = useState(() => parseTempoDigits(value));
  const lastEmitted = useRef(value ?? null);
  useEffect(() => {
    // Reseed only on a genuinely external change (copy-last-week, switching
    // lifts) — never off the echo of our own optimistic write.
    if ((value ?? null) !== lastEmitted.current) {
      setDigits(parseTempoDigits(value));
      lastEmitted.current = value ?? null;
    }
  }, [value]);
  const set = (i, v) => {
    const next = [...digits];
    next[i] = (v.replace(/[^0-9xX]/g, "").slice(-1) || " ").toUpperCase();
    setDigits(next);
    const anyFilled = next.some((d) => d !== " ");
    const out = anyFilled ? next.map((d) => (d === " " ? "0" : d)).join("-") : null;
    lastEmitted.current = out;
    onChange(out);
  };
  return (
    <View style={{ flexDirection: "row", gap: 5 }}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          value={d.trim()}
          onChangeText={(v) => set(i, v)}
          maxLength={1}
          placeholder="–"
          style={{
            width: 30,
            height: 34,
            textAlign: "center",
            borderWidth: 1,
            borderColor: CARD_BORDER,
            borderRadius: 8,
            fontFamily: fonts.sansSemiBold,
            fontSize: 13,
            color: "#2a211c",
            backgroundColor: "#fff",
          }}
        />
      ))}
    </View>
  );
}

export function RestChips({ value, onChange }) {
  const current = value == null || value === "" ? null : Number(String(value).replace(/[^0-9]/g, ""));
  const isCustom = current != null && !REST_CHIPS.includes(current);
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {REST_CHIPS.map((n) => {
        const active = current === n;
        return (
          <Pressable
            key={n}
            onPress={() => {
              setCustomOpen(false);
              onChange(active ? null : String(n));
            }}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 13,
              borderRadius: 8,
              backgroundColor: active ? "#33251f" : "#fff",
              borderWidth: 1,
              borderColor: active ? "#33251f" : CARD_BORDER,
            }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: active ? "#f7f3ee" : "#57534e" }}>{formatRest(n)}</Text>
          </Pressable>
        );
      })}
      {customOpen || isCustom ? (
        <TextInput
          value={current != null && isCustom ? String(current) : ""}
          onChangeText={(v) => {
            const digits = v.replace(/[^0-9]/g, "");
            onChange(digits || null);
          }}
          placeholder="secs"
          keyboardType="number-pad"
          autoFocus={customOpen && !isCustom}
          style={{
            width: 66,
            paddingVertical: 7,
            paddingHorizontal: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: "#fff",
            fontFamily: fonts.sansSemiBold,
            fontSize: 12,
            color: "#2a211c",
          }}
        />
      ) : (
        <Pressable
          onPress={() => setCustomOpen(true)}
          style={{ paddingVertical: 7, paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: "#ddd8d1" }}
        >
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>custom</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SortableLift({
  item,
  index,
  // "A" for a standalone lift, "B1"/"B2" for superset members — from
  // liftLabelsFor, the one labeling language shared with the printed sheet
  // and the member app.
  label,
  expanded,
  onExpand,
  onChange,
  onRemove,
  onToggleSuperset,
  // True when the lift directly below is the other half of this superset.
  // Was passed by the group builder and never destructured here, so the
  // "these two are joined" cue never rendered at all.
  linkedToNext = false,
  showTempo = true,
  showSuperset = true,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const inSuperset = Boolean(item.superset_group_id);

  return (
    <div ref={setNodeRef} style={style}>
      <View
        style={{
          backgroundColor: inSuperset ? "#fdf6f2" : "#fff",
          borderWidth: expanded ? 0 : 1,
          borderColor: CARD_BORDER,
          borderTopWidth: index === 0 || expanded ? (expanded ? 0 : 1) : 0,
          borderRadius: expanded ? 12 : 0,
          borderLeftWidth: expanded ? 3 : inSuperset ? 3 : 1,
          borderLeftColor: expanded || inSuperset ? colors.primary : CARD_BORDER,
          marginBottom: expanded ? 8 : 0,
          overflow: "hidden",
          ...(expanded
            ? { shadowColor: "#44403c", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, borderWidth: 1, borderColor: CARD_BORDER }
            : null),
        }}
      >
        {/* The collapsed line. Everything about the lift, in one row. */}
        <Pressable
          onPress={() => onExpand(expanded ? null : item.id)}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12 }}
        >
          <div {...attributes} {...listeners} style={{ cursor: "grab", padding: 2, color: "#c9c4bd", fontSize: 13 }}>
            ⠿
          </div>
          <View
            style={{
              minWidth: 22,
              height: 22,
              borderRadius: 99,
              paddingHorizontal: 5,
              backgroundColor: expanded ? colors.primary : inSuperset ? "#fdece5" : "#f4f1ec",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: fonts.sansBold,
                fontSize: 11,
                color: expanded ? "#fff" : inSuperset ? "#b23a22" : "#a8a29e",
              }}
            >
              {label ?? index + 1}
            </Text>
          </View>
          <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 14, color: "#2a211c" }} numberOfLines={1}>
            {item.exercises?.name ?? "Unknown exercise"}
          </Text>

          {expanded ? null : (
            <>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#57534e", width: 130, textAlign: "right" }} numberOfLines={1}>
                {schemeLabel(item)}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", width: 52, textAlign: "right" }}>
                {formatRest(item.rest)}
              </Text>
              {showTempo ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", width: 62, textAlign: "right" }}>
                  {item.tempo || "—"}
                </Text>
              ) : null}
            </>
          )}

          {expanded && item.exercises?.video_url ? (
            <Pressable onPress={() => Linking.openURL(item.exercises.video_url)} hitSlop={8}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: colors.primaryOnWhite }}>▶ video</Text>
            </Pressable>
          ) : null}

          <Text style={{ color: "#c9c4bd", fontSize: 12, width: 14, textAlign: "center" }}>{expanded ? "⌃" : "⌄"}</Text>
        </Pressable>

        {expanded ? (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14, flexDirection: "row", gap: 20, flexWrap: "wrap" }}>
            <View>
              <Eyebrow style={{ marginBottom: 7 }}>SETS</Eyebrow>
              <SetTable item={item} onChange={onChange} />
            </View>

            <View style={{ flex: 1, minWidth: 280 }}>
              <Eyebrow style={{ marginBottom: 7 }}>REST</Eyebrow>
              <RestChips value={item.rest} onChange={(v) => onChange(item.id, { rest: v })} />

              <View style={{ flexDirection: "row", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
                {showTempo ? (
                  <View>
                    <Eyebrow style={{ marginBottom: 7 }}>TEMPO</Eyebrow>
                    <TempoDigits value={item.tempo} onChange={(v) => onChange(item.id, { tempo: v })} />
                  </View>
                ) : null}
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Eyebrow style={{ marginBottom: 7 }}>NOTE TO MEMBER</Eyebrow>
                  <TextInput
                    value={item.notes ?? ""}
                    onChangeText={(v) => onChange(item.id, { notes: v })}
                    placeholder="A cue shown under this lift…"
                    style={{
                      height: 34,
                      borderWidth: 1,
                      borderColor: CARD_BORDER,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      backgroundColor: "#fff",
                      fontFamily: fonts.sans,
                      fontSize: 12.5,
                      color: "#2a211c",
                    }}
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 14 }}>
                {showSuperset ? (
                  <Pressable onPress={() => onToggleSuperset(item)}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: inSuperset ? "#b23a22" : colors.primaryOnWhite }}>
                      {inSuperset ? "Break superset" : "Superset with the next lift"}
                    </Text>
                  </Pressable>
                ) : null}
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => onRemove(item.id)}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#b23a22" }}>Remove lift</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
      {/* Visual joiner between the two halves of a superset. Rendered
          outside the card so it can't be clipped by its overflow:hidden,
          and only when both are collapsed — an expanded card already has
          its own margin and shadow separating it. */}
      {linkedToNext && !expanded ? (
        <View style={{ height: 8, justifyContent: "center", paddingLeft: 18 }}>
          <View style={{ width: 2, height: 8, backgroundColor: colors.primary, borderRadius: 1 }} />
        </View>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------- right rail */

export function BalanceRail({ counts, note, label = "BALANCE THIS WEEK" }) {
  const max = Math.max(1, ...Object.values(counts));
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <View>
      <Eyebrow>{label}</Eyebrow>
      <View style={{ marginTop: 10 }}>
        {entries.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>Nothing tagged with a pattern yet.</Text>
        ) : (
          entries.map(([pattern, n]) => (
            <View key={pattern} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#44403c", textTransform: "capitalize" }}>
                  {pattern.replace(/_/g, " ")}
                </Text>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: "#2a211c" }}>{n}</Text>
              </View>
              <View style={{ height: 5, borderRadius: 99, backgroundColor: "#ece7e1", overflow: "hidden" }}>
                <View style={{ width: `${(n / max) * 100}%`, height: 5, backgroundColor: n === max ? "#8a5140" : "#4d6142" }} />
              </View>
            </View>
          ))
        )}
      </View>
      {note ? (
        <View style={{ backgroundColor: "#fdf6f2", borderRadius: 10, padding: 12, marginTop: 4 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#8a5140", lineHeight: 17 }}>{note}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function LastWeekRail({ lastWeek, onCopy, copying }) {
  if (!lastWeek) return null;
  return (
    <View style={{ marginTop: 26 }}>
      <Eyebrow>SAME SESSION, LAST WEEK</Eyebrow>
      <View style={{ marginTop: 10, borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 12, padding: 13, backgroundColor: "#fff" }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#2a211c", marginBottom: 8 }}>
          Week {lastWeek.workout.week_number} · Session {lastWeek.workout.session_number}
        </Text>
        {lastWeek.lifts.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>Nothing was written for it.</Text>
        ) : (
          lastWeek.lifts.map((l) => (
            <View key={l.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 3 }}>
              <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12, color: "#57534e" }} numberOfLines={1}>
                {l.exercises?.name ?? "Unknown"}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>{schemeLabel(l)}</Text>
            </View>
          ))
        )}
        {lastWeek.lifts.length > 0 ? (
          <Pressable onPress={onCopy} disabled={copying} style={{ marginTop: 10 }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>
              {copying ? "Copying…" : "Copy into this session"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// (The old supersetLettersFor lived here — superseded by
// lib/programming/sessionLabels.js's liftLabelsFor, the one labeling
// language shared with the printed sheet and the member app. The hub and
// SpcSessionReadout keep their own copy in spcBlockDetail.js.)

export function patternCountsFor(exercises, siblingLifts = []) {
  const counts = {};
  const add = (patterns) => {
    for (const p of patterns ?? []) counts[p] = (counts[p] ?? 0) + 1;
  };
  for (const e of exercises) add(e.exercises?.movement_pattern);
  for (const s of siblingLifts) add(s.patterns);
  return counts;
}

export function balanceNoteFor(patternCounts) {
  const entries = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length < 2) return null;
  const [top, topCount] = entries[0];
  const rest = entries.slice(1).reduce((sum, [, n]) => sum + n, 0);
  if (topCount >= 4 && topCount > rest) {
    return `${top.replace(/_/g, " ")}-heavy this week — everything else adds up to ${rest}.`;
  }
  return null;
}
