import { forwardRef, useEffect, useRef } from "react";
import { View, Text, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../../PressFade";
import { PillarDropdown } from "./PillarDropdown";
import { T } from "./ui";
import { fonts } from "../../../lib/theme";

// The strategy session template. Two boxes, and the split between them is the
// point: "Shared with {first}" holds Goal, Plan and Notes, which is exactly
// what she gets if the coach texts her a copy; "Coach only" holds the pillar
// and coach-only notes, which never leave the coach side. The coach-only box
// is a different surface (inset colour, dashed edge, lock) so which side a
// field is on reads at a glance, without a sentence explaining it.
//
// Every field wraps and grows downward (GrowingInput); none scrolls inside
// itself. Plan is a list of bullets in the nutrition Plan tab's style.

const RED = "#b23a22";

// A stable React key per bullet. Seeded from the clock so a hot reload
// (which resets the counter but not the page's bullets) can't reuse one.
let nextBulletId = Date.now();
export function bullet(text = "") {
  return { id: nextBulletId++, text };
}

const LINE = 22;
const TEXT = { fontFamily: fonts.sans, fontSize: 15, lineHeight: LINE, color: T.ink };

// A text field that wraps and grows downward with what's typed, with no
// scrollbar. Built so it can't loop: it never measures itself. An invisible
// copy of the text sits in normal flow with the same font, padding and
// border, so IT sets the wrapper's height (the browser just lays out text),
// and the real input is pinned to the wrapper's four edges. The input's own
// height never feeds back into anything. This codebase has been bitten three
// times by the other way (onContentSizeChange -> height on web, React #185
// and a blank screen); see platform-auth-infra history.
//
// boxed: the bordered white field. Unboxed is a bare line of text, for plan
// bullets.
// inRow: it sits beside other things in a row (a plan bullet), so it takes
// the row's leftover width rather than its text's natural width.
function GrowingInput({ value, onChangeText, placeholder, minLines = 1, boxed = true, inRow, invalid, disabled, inputRef, ...rest }) {
  const padH = boxed ? 12 : 0;
  const padV = boxed ? 10 : 5;
  const border = boxed ? 1.5 : 0;
  const box = { paddingHorizontal: padH, paddingVertical: padV, borderWidth: border };
  return (
    <View
      style={{
        position: "relative",
        minWidth: 0,
        minHeight: minLines * LINE + padV * 2 + border * 2,
        ...(inRow ? { flexGrow: 1, flexShrink: 1, flexBasis: 0 } : null),
      }}
    >
      <Text
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{ ...TEXT, ...box, borderColor: "transparent", opacity: 0 }}
      >
        {/* The trailing space makes a trailing newline count as a line. */}
        {`${value || placeholder || ""} `}
      </Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        placeholder={placeholder}
        placeholderTextColor={T.ink4}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          ...TEXT,
          ...box,
          borderColor: invalid ? RED : T.inputBorder,
          borderRadius: boxed ? 14 : 0,
          backgroundColor: boxed ? T.card : "transparent",
          overflow: "hidden",
          opacity: disabled ? 0.6 : 1,
        }}
        {...rest}
      />
    </View>
  );
}

function FieldLabel({ children, hint, missing, required }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: T.ink }}>
        {children}
        {required ? <Text style={{ color: RED }}> *</Text> : null}
      </Text>
      {missing ? (
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: RED }}>{missing}</Text>
      ) : hint ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: T.ink4 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

function BoxHeader({ icon, title, color }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 12 }}>
      <Ionicons name={icon} size={15} color={color} />
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color }}>{title}</Text>
    </View>
  );
}

// Plan bullets, modelled on the nutrition Plan tab's phase bullets (a dash,
// the text, a faint ✕), but each in its own white field so it's obvious
// every bullet is its own entry. Enter in a bullet starts the next one
// (text after the cursor comes with it); Backspace in an empty bullet
// removes it and goes back to the one above.
function PlanList({ plan, onChange, disabled }) {
  const refs = useRef(new Map());
  const focusId = useRef(null);

  // Focus a bullet once it has rendered (a new one, or the one above after
  // a Backspace delete).
  useEffect(() => {
    if (focusId.current == null) return;
    refs.current.get(focusId.current)?.focus?.();
    focusId.current = null;
  });

  const setText = (i, text) => {
    if (!text.includes("\n")) {
      onChange(plan.map((b, j) => (j === i ? { ...b, text } : b)));
      return;
    }
    const [head, ...rest] = text.split("\n");
    const added = rest.map((t) => bullet(t));
    focusId.current = added[added.length - 1].id;
    onChange([...plan.slice(0, i), { ...plan[i], text: head }, ...added, ...plan.slice(i + 1)]);
  };

  const add = () => {
    const b = bullet();
    focusId.current = b.id;
    onChange([...plan, b]);
  };

  const remove = (i) => onChange(plan.filter((_, j) => j !== i));

  const onKey = (i, e) => {
    if (e.nativeEvent.key !== "Backspace" || plan[i].text || plan.length < 2) return;
    e.preventDefault?.();
    focusId.current = plan[i === 0 ? 1 : i - 1].id;
    remove(i);
  };

  return (
    <View>
      {plan.map((b, i) => (
        <View key={b.id} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 8 }}>
          <Text style={{ ...TEXT, color: T.ink4, width: 16, flexGrow: 0, flexShrink: 0, paddingTop: 11.5 }}>–</Text>
          <GrowingInput
            inRow
            inputRef={(el) => (el ? refs.current.set(b.id, el) : refs.current.delete(b.id))}
            value={b.text}
            onChangeText={(t) => setText(i, t)}
            onKeyPress={(e) => onKey(i, e)}
            disabled={disabled}
            placeholder={i === 0 ? "One step in her plan" : "Next step"}
            accessibilityLabel={`Plan bullet ${i + 1}`}
          />
          {plan.length > 1 ? (
            <PressFade
              onPress={() => remove(i)}
              disabled={disabled}
              accessibilityLabel={`Remove bullet ${i + 1}`}
              style={{ width: 36, height: 46, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#c3bdb4" }}>✕</Text>
            </PressFade>
          ) : null}
        </View>
      ))}
      <PressFade
        onPress={add}
        disabled={disabled}
        style={{ alignSelf: "flex-start", height: 40, justifyContent: "center", paddingLeft: 16, opacity: disabled ? 0.5 : 1 }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: T.clayText }}>+ Add bullet</Text>
      </PressFade>
    </View>
  );
}

export const CoachOnlyBox = forwardRef(function CoachOnlyBox(
  { first, pillar, onPillar, suggested, pillarMissing, coachNotes, onCoachNotes, showCoachNotes, onShowCoachNotes, autoFocusCoachNotes, disabled },
  ref
) {
  return (
    <View
      ref={ref}
      style={{ backgroundColor: T.inset, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", borderColor: T.dashed, padding: 16 }}
    >
      <BoxHeader icon="lock-closed" title={`Coach only · not sent to ${first}`} color={T.ink2} />
      <FieldLabel required missing={pillarMissing && !pillar ? "Pick her pillar to save" : null}>
        Her pillar
      </FieldLabel>
      <PillarDropdown value={pillar} suggested={suggested} invalid={pillarMissing && !pillar} disabled={disabled} onChange={onPillar} />
      {showCoachNotes ? (
        <View style={{ marginTop: 14 }}>
          <FieldLabel hint="optional">Coach notes</FieldLabel>
          <GrowingInput
            value={coachNotes}
            onChangeText={onCoachNotes}
            disabled={disabled}
            autoFocus={autoFocusCoachNotes}
            minLines={3}
            placeholder="Anything for the coaches, not for her."
          />
        </View>
      ) : (
        <PressFade
          onPress={onShowCoachNotes}
          disabled={disabled}
          style={{ alignSelf: "flex-start", height: 44, justifyContent: "center", marginTop: 6, opacity: disabled ? 0.5 : 1 }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: T.clayText }}>+ Add coach-only notes</Text>
        </PressFade>
      )}
    </View>
  );
});

export function SharedBox({ first, goal, onGoal, plan, onPlan, clientNotes, onClientNotes, showMissing, disabled }) {
  const goalMissing = showMissing && !goal.trim();
  const planMissing = showMissing && !plan.some((b) => b.text.trim());
  return (
    <View style={{ backgroundColor: T.clayTint, borderRadius: 18, borderWidth: 1.5, borderColor: T.clayTintBorder, padding: 16 }}>
      <BoxHeader icon="chatbubble-ellipses" title={`Shared with ${first}`} color={T.clayText} />

      <FieldLabel required missing={goalMissing ? "Required" : null}>
        Goal
      </FieldLabel>
      <GrowingInput value={goal} onChangeText={onGoal} disabled={disabled} invalid={goalMissing} placeholder="What she's working toward" />

      <View style={{ marginTop: 16 }}>
        <FieldLabel required missing={planMissing ? "Add at least one bullet" : null}>
          Plan
        </FieldLabel>
        <PlanList plan={plan} onChange={onPlan} disabled={disabled} />
      </View>

      <View style={{ marginTop: 8 }}>
        <FieldLabel hint="optional">Notes</FieldLabel>
        <GrowingInput
          value={clientNotes}
          onChangeText={onClientNotes}
          disabled={disabled}
          minLines={3}
          placeholder="Anything else she should remember"
        />
      </View>
    </View>
  );
}
