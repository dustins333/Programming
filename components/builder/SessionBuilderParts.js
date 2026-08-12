import { useState } from "react";
import { View, Text, Pressable, TextInput, Linking } from "react-native";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { summarizeRepScheme } from "../../lib/programming/exercises";
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
export function schemeLabel(item) {
  const scheme = item.rep_scheme?.length ? item.rep_scheme : null;
  if (scheme) {
    const unique = [...new Set(scheme.map((r) => (r ?? "").trim()))];
    return `${scheme.length} × ${unique.length === 1 ? unique[0] || "—" : scheme.join(",")}`;
  }
  return `${item.sets ?? 0} × ${item.reps || "—"}`;
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

// A fixed 2×3 grid of six slots rather than a growing list — the coaching
// convention here is five or six movements, so the empty slots are the
// prompt and there's nothing to "add a row" to.
export function WarmupGrid({ warmups, onChange, onRemove, onAdd, editable = true }) {
  const slots = [...warmups];
  while (slots.length < 6) slots.push(null);

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <Eyebrow>WARM-UP · {warmups.length} OF 6</Eyebrow>
        {warmups.length < 6 ? (
          <Pressable onPress={onAdd}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: colors.primaryOnWhite }}>+ Add</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {slots.slice(0, 6).map((w, i) =>
          w ? (
            <View
              key={w.id}
              style={{
                flexBasis: "48%",
                flexGrow: 1,
                minWidth: 240,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: CARD_BORDER,
                borderRadius: 10,
                paddingVertical: 9,
                paddingHorizontal: 12,
              }}
            >
              <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#c9c4bd", width: 12 }}>{i + 1}</Text>
              <Text style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#2a211c" }} numberOfLines={1}>
                {w.exercises?.name ?? w.label ?? "Warm-up"}
              </Text>
              {/* template_warmups has no sets/reps columns at all, unlike
                  group and SPC — so the template builder passes editable=false
                  and shows the movement alone rather than dead inputs. */}
              {editable ? (
                <>
                  <TextInput
                    value={w.sets ?? ""}
                    onChangeText={(v) => onChange(w.id, { sets: v })}
                    placeholder="2"
                    style={{ width: 30, fontFamily: fonts.sans, fontSize: 12, color: "#57534e", textAlign: "right" }}
                  />
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e" }}>×</Text>
                  <TextInput
                    value={w.reps ?? ""}
                    onChangeText={(v) => onChange(w.id, { reps: v })}
                    placeholder="10/side"
                    style={{ width: 68, fontFamily: fonts.sans, fontSize: 12, color: "#57534e" }}
                  />
                </>
              ) : null}
              <Pressable onPress={() => onRemove(w.id)} hitSlop={8} accessibilityLabel={`Remove ${w.exercises?.name ?? "warm-up"}`}>
                <Text style={{ color: "#c9c4bd", fontSize: 13 }}>✕</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              key={`slot-${i}`}
              onPress={onAdd}
              style={{
                flexBasis: "48%",
                flexGrow: 1,
                minWidth: 240,
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
              <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#d6d1ca", width: 12 }}>{i + 1}</Text>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#a8a29e" }}>+ Insert warm-up</Text>
            </Pressable>
          )
        )}
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- lifts */

export function SetTable({ item, onChange }) {
  const scheme = item.rep_scheme?.length ? item.rep_scheme : [item.reps ?? ""];
  const commit = (next) => onChange(item.id, { rep_scheme: next, sets: next.length, reps: summarizeRepScheme(next) });

  return (
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
      {scheme.map((reps, i) => (
        <View
          key={i}
          style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: "#f4f1ec" }}
        >
          <Text style={{ flex: 1, fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c" }}>Set {i + 1}</Text>
          <TextInput
            value={reps ?? ""}
            onChangeText={(v) => commit(scheme.map((r, idx) => (idx === i ? v : r)))}
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
  );
}

// Four digits, not a free string — a tempo is always four numbers and the
// old text field let "3-1-1-0", "3110" and "3/1/1/0" all mean the same thing.
export function TempoDigits({ value, onChange }) {
  const digits = String(value ?? "").replace(/[^0-9xX]/g, "").padEnd(4, " ").slice(0, 4).split("");
  const set = (i, v) => {
    const next = [...digits];
    next[i] = (v.replace(/[^0-9xX]/g, "").slice(-1) || " ").toUpperCase();
    const joined = next.join("").trim();
    onChange(joined ? next.map((d) => (d === " " ? "0" : d)).join("-") : null);
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
  expanded,
  onExpand,
  onChange,
  onRemove,
  onToggleSuperset,
  supersetLetter,
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
              width: 22,
              height: 22,
              borderRadius: 99,
              backgroundColor: expanded ? colors.primary : "#f4f1ec",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, color: expanded ? "#fff" : "#a8a29e" }}>{index + 1}</Text>
          </View>
          <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 14, color: "#2a211c" }} numberOfLines={1}>
            {item.exercises?.name ?? "Unknown exercise"}
          </Text>

          {supersetLetter ? (
            <View style={{ backgroundColor: "#fdece5", borderRadius: 5, paddingVertical: 3, paddingHorizontal: 7 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 0.5, color: "#b23a22" }}>SS {supersetLetter}</Text>
            </View>
          ) : null}

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
                    placeholder="A cue she'll see under this lift…"
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

// Superset pairs get a letter (A, B, …) in document order so the two halves
// of a pairing are identifiable at a glance on the collapsed rows.
export function supersetLettersFor(exercises) {
  const letters = {};
  let next = 0;
  for (const e of exercises) {
    if (!e.superset_group_id) continue;
    if (!(e.superset_group_id in letters)) {
      letters[e.superset_group_id] = String.fromCharCode(65 + next);
      next += 1;
    }
  }
  return letters;
}

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
