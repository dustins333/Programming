import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Linking, Modal, Platform, ScrollView, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { GraphicImage } from "../GraphicImage";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { CARD_BORDER, DONE_BORDER } from "./EventCard";
import { formatDateShort } from "../../lib/formatDate";
import { dateInBoise } from "../../lib/boiseDate";
import { setBottomDockHeight } from "../../lib/bottomDock";
import { formatPrice } from "../../lib/programming/events";
import { readBag, saveBag, clearBag, sameBag, normalizeBag } from "../../lib/programming/eventBag";
import { fonts, colors } from "../../lib/theme";

// The member's view of one event — everything below the back link.
//
// Extracted from app/(member)/events/[eventId].js so the coach's "Preview"
// button renders THIS, not a lookalike. The whole value of a preview is that
// it can't disagree with what members actually get.
//
// Owns its own form state (guests / answers / quantities), seeded from
// `response`. The screen keeps data loading and the API calls; this keeps
// the form. In `preview` mode every control is inert and nothing submits.

// One key per orderable (item, option) pair — matching the unique
// constraint on programming.event_response_items, so an item WITH options
// gets a quantity per option (2 smalls and 1 medium is a real order) rather
// than forcing one choice per item.
export const lineKey = (itemId, option) => `${itemId}::${option ?? ""}`;

function Card({ children, style }) {
  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: CARD_BORDER,
        backgroundColor: "white",
        padding: 16,
        marginBottom: 14,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function QtyStepper({ value, onChange, label, disabled }) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text className="flex-1 pr-3" style={{ fontFamily: fonts.sans, color: "#44403c" }}>
        {label}
      </Text>
      <View className="flex-row items-center gap-3">
        <PressFade
          onPress={() => onChange(Math.max(0, value - 1))}
          disabled={disabled || value === 0}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ opacity: value === 0 ? 0.35 : 1 }}
        >
          <Ionicons name="remove-circle-outline" size={26} color={colors.primary} />
        </PressFade>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, minWidth: 22, textAlign: "center", color: "#44403c" }}>
          {value}
        </Text>
        <PressFade onPress={() => onChange(value + 1)} disabled={disabled} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="add-circle" size={26} color={colors.primary} />
        </PressFade>
      </View>
    </View>
  );
}

function ChoiceAnswer({ question, value, onChange, disabled }) {
  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>
        {question.question_text}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {(question.options ?? []).map((opt) => {
          const active = value === opt;
          return (
            <PressFade
              key={opt}
              onPress={() => onChange(opt)}
              disabled={disabled}
              style={{
                borderRadius: 999,
                borderWidth: active ? 2 : 1,
                borderColor: active ? colors.primary : "#d6d3d1",
                backgroundColor: active ? "#fdf6f2" : "white",
                paddingVertical: 8,
                paddingHorizontal: 14,
              }}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: active ? colors.primaryOnWhite : "#57534e" }}>
                {opt}
              </Text>
            </PressFade>
          );
        })}
      </View>
    </View>
  );
}

// Web gets a real <select> (big enough for a thumb, unlike the coach-side
// OptionPicker); native gets a tap-to-open list.
function ChoiceSelect({ options, value, onChange, placeholder, disabled }) {
  const [open, setOpen] = useState(false);
  if (Platform.OS === "web") {
    return (
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          fontFamily: fonts.sans,
          fontSize: 15,
          width: "100%",
          padding: "11px 12px",
          borderRadius: 12,
          border: "1px solid #d6d3d1",
          color: value ? "#292524" : "#78716c",
          backgroundColor: "white",
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }
  return (
    <>
      <PressFade
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderWidth: 1,
          borderColor: "#d6d3d1",
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor: "white",
        }}
      >
        <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: value ? "#292524" : "#78716c" }}>{value ?? placeholder}</Text>
        <Ionicons name="chevron-down" size={16} color="#78716c" />
      </PressFade>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, backgroundColor: "rgba(0,0,0,0.4)" }}
        >
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 320, maxHeight: "70%", borderRadius: 16, backgroundColor: "white", padding: 8 }}>
            <ScrollView>
              {options.map((opt) => (
                <PressFade
                  key={opt}
                  onPress={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  style={{ borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: opt === value ? "#fdf6f2" : "transparent" }}
                >
                  <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: opt === value ? colors.primaryOnWhite : "#44403c" }}>{opt}</Text>
                </PressFade>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function MiniStepper({ value, onChange, min = 1, disabled, label }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <PressFade
        onPress={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`Fewer ${label}`}
        style={{ opacity: value <= min ? 0.35 : 1 }}
      >
        <Ionicons name="remove-circle-outline" size={28} color={colors.primary} />
      </PressFade>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, minWidth: 20, textAlign: "center", color: "#44403c" }}>{value}</Text>
      <PressFade
        onPress={() => onChange(value + 1)}
        disabled={disabled}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`More ${label}`}
      >
        <Ionicons name="add-circle" size={28} color={colors.primary} />
      </PressFade>
    </View>
  );
}

// One product, store-style: photo, name, price, pick a variant, how many,
// Add to bag. Adding the same variant again adds to what's already in the
// bag rather than making a second line.
function ProductCard({ item, onAdd, preview }) {
  const options = item.options ?? [];
  const [choice, setChoice] = useState(null);
  const [qty, setQty] = useState(1);
  const needsChoice = options.length > 0 && !choice;
  const price = formatPrice(item.price);

  const handleAdd = () => {
    if (preview || needsChoice) return;
    onAdd(item, options.length > 0 ? choice : null, qty);
    setQty(1);
  };

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {item.image_path ? (
        <View style={{ backgroundColor: "#f7f4f1", paddingVertical: 12 }}>
          <GraphicImage path={item.image_path} minRatio={0.8} maxHeight={220} radius={10} style={{ backgroundColor: "transparent" }} />
        </View>
      ) : null}
      <View style={{ padding: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 17, color: "#292524" }}>{item.name}</Text>
          {price ? <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, color: colors.primaryOnWhite }}>{price}</Text> : null}
        </View>
        {item.description ? (
          <Text className="mt-1 text-sm" style={{ fontFamily: fonts.sans, color: colors.muted }}>
            {item.description}
          </Text>
        ) : null}

        {options.length > 0 ? (
          <View style={{ marginTop: 12 }}>
            <ChoiceSelect options={options} value={choice} onChange={setChoice} placeholder="Choose one" disabled={preview} />
          </View>
        ) : null}

        <View style={{ marginTop: 14, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <MiniStepper value={qty} onChange={setQty} disabled={preview} label={item.name} />
          <PressFade
            onPress={handleAdd}
            disabled={preview || needsChoice}
            style={{
              flex: 1,
              opacity: needsChoice ? 0.45 : 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: 12,
              paddingVertical: 12,
              backgroundColor: colors.primary,
            }}
          >
            <Ionicons name="bag-add-outline" size={17} color="white" />
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 15 }}>
              Add to bag
            </Text>
          </PressFade>
        </View>
      </View>
    </Card>
  );
}

// The bag, pinned above the submit button. Collapsed it's one row (what's
// in it, how many, the total); tapping opens the lines so she can adjust
// quantities without scrolling back up. `lines` has already been filtered
// to items and options that still exist on the event.
function BagBar({ lines, onChangeQty, sent, unsentChanges, totalPrice, preview, expanded, onToggle }) {
  const count = lines.reduce((sum, l) => sum + l.qty, 0);
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: sent ? 2 : 1,
        borderColor: sent ? DONE_BORDER : CARD_BORDER,
        backgroundColor: "white",
        overflow: "hidden",
      }}
    >
      <PressFade
        onPress={onToggle}
        accessibilityLabel={expanded ? "Hide bag" : "Show bag"}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, paddingHorizontal: 14 }}
      >
        <Ionicons name={sent ? "checkmark-circle" : "bag-outline"} size={20} color={sent ? DONE_BORDER : colors.primary} />
        <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 15, color: sent ? DONE_BORDER : "#44403c" }}>
          {sent ? "Order sent" : "Your bag"}
        </Text>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.muted }}>
          {count} {count === 1 ? "item" : "items"}
          {totalPrice != null && count > 0 ? ` | ${formatPrice(totalPrice)}` : ""}
        </Text>
        <Ionicons name={expanded ? "chevron-down" : "chevron-up"} size={18} color="#78716c" />
      </PressFade>

      {expanded ? (
        <ScrollView style={{ maxHeight: 260, borderTopWidth: 1, borderTopColor: CARD_BORDER }} contentContainerStyle={{ paddingHorizontal: 14 }}>
          {lines.length === 0 ? (
            <Text className="py-3 text-sm" style={{ fontFamily: fonts.sans, color: colors.muted }}>
              Nothing in your bag.
            </Text>
          ) : (
            lines.map((line, i) => (
              <View
                key={line.key}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: CARD_BORDER,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: "#292524" }}>{line.item.name}</Text>
                  <Text className="text-xs" style={{ fontFamily: fonts.sans, color: colors.muted, marginTop: 1 }}>
                    {[line.option, line.item.price != null ? `${formatPrice(line.item.price)} each` : null].filter(Boolean).join(" | ")}
                  </Text>
                </View>
                <MiniStepper value={line.qty} min={0} onChange={(q) => onChangeQty(line.key, q)} disabled={preview} label={line.item.name} />
              </View>
            ))
          )}
          {totalPrice != null && lines.length > 0 ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 1, borderTopColor: CARD_BORDER }}>
              <Text style={{ fontFamily: fonts.sansBold, color: "#44403c" }}>Total</Text>
              <Text style={{ fontFamily: fonts.sansBold, color: "#44403c" }}>{formatPrice(totalPrice)}</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {unsentChanges ? (
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: "#b23a22", paddingHorizontal: 14, paddingBottom: 10, marginTop: -4 }}>
          Not sent yet. Submit to place your order.
        </Text>
      ) : null}
    </View>
  );
}

export function EventDetailView({
  event,
  items = [],
  questions = [],
  response = null,
  onSubmit,
  onCancel,
  submitting = false,
  preview = false,
  // Whose bag this is. Without it (the coach's preview) the bag is never
  // saved to or restored from the device.
  bagUserId = null,
  onBagDirtyChange,
  // Rendered at the top of the scroll area: the host's back link or tab
  // heading. This view owns its own ScrollView so the submit button and the
  // bag can pin to the bottom of the screen outside it.
  header = null,
  contentContainerStyle,
}) {
  const [bagExpanded, setBagExpanded] = useState(false);
  // Measured, so the last card can scroll clear of the pinned bar. The
  // fallback covers the first paint (and any browser where onLayout is slow).
  const [dockHeight, setDockHeight] = useState(0);
  const [guestCount, setGuestCount] = useState(response?.guest_count ?? 0);
  const [answers, setAnswers] = useState({});
  const [quantities, setQuantities] = useState({});
  // The persist effect must not run until the saved bag has been read, or
  // the empty initial state would overwrite it.
  const [bagReady, setBagReady] = useState(false);
  const submittedRef = useRef({});

  const isOrder = event.response_type === "order";
  const bagEnabled = isOrder && !preview && Boolean(bagUserId);

  // Reseed whenever the loaded response changes: the screen refetches after
  // every submit, and the form must reflect what actually landed. For an
  // order, a bag saved on this device that differs from what was sent wins,
  // because that's unsent work she left mid-way.
  useEffect(() => {
    let cancelled = false;
    setGuestCount(response?.guest_count ?? 0);
    setAnswers(Object.fromEntries((response?.answers ?? []).map((a) => [a.question, a.answer])));
    const submitted = Object.fromEntries(
      (response?.lineItems ?? []).map((li) => [lineKey(li.event_item_id, li.option), li.qty])
    );
    submittedRef.current = submitted;
    if (!bagEnabled) {
      setQuantities(submitted);
      setBagReady(true);
      return undefined;
    }
    readBag(bagUserId, event.id).then((saved) => {
      if (cancelled) return;
      setQuantities(saved && !sameBag(saved, submitted) ? saved : submitted);
      setBagReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [response, bagEnabled, bagUserId, event.id]);

  // Only the lines that still point at a real item and option: a coach can
  // remove a flavor after someone put it in her bag.
  const itemsById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const bagLines = useMemo(
    () =>
      Object.entries(normalizeBag(quantities))
        .map(([key, qty]) => {
          const [itemId, option] = key.split("::");
          const item = itemsById[itemId];
          if (!item) return null;
          const opts = item.options ?? [];
          if (opts.length > 0 ? !opts.includes(option) : option) return null;
          return { key, item, option: option || null, qty };
        })
        .filter(Boolean)
        .sort((a, b) => (a.item.position ?? 0) - (b.item.position ?? 0)),
    [quantities, itemsById]
  );
  const liveBag = useMemo(() => Object.fromEntries(bagLines.map((l) => [l.key, l.qty])), [bagLines]);
  const orderTotal = bagLines.reduce((sum, l) => sum + l.qty, 0);
  const totalPrice = useMemo(() => {
    let priced = false;
    let total = 0;
    for (const l of bagLines) {
      if (l.item.price == null) continue;
      priced = true;
      total += Number(l.item.price) * l.qty;
    }
    return priced ? Math.round(total * 100) / 100 : null;
  }, [bagLines]);

  const bagDirty = isOrder && bagReady && !sameBag(liveBag, submittedRef.current);

  // Keep the device copy in step: stored while it differs from what was
  // sent, removed the moment it matches. Keyed on the bag alone; the
  // submitted snapshot is read from a ref so a cancel or submit refetch
  // can't write the old bag back.
  useEffect(() => {
    if (!bagEnabled || !bagReady) return;
    if (sameBag(liveBag, submittedRef.current)) clearBag(bagUserId, event.id);
    else saveBag(bagUserId, event.id, liveBag);
  }, [liveBag, bagEnabled, bagReady, bagUserId, event.id]);

  // Read through a ref so a caller passing a fresh function every render
  // can't turn this into a render loop.
  const onBagDirtyChangeRef = useRef(onBagDirtyChange);
  onBagDirtyChangeRef.current = onBagDirtyChange;
  useEffect(() => {
    onBagDirtyChangeRef.current?.(bagDirty, orderTotal);
  }, [bagDirty, orderTotal]);

  const addToBag = (item, option, qty) => {
    const key = lineKey(item.id, option);
    // No toast: the pinned bag bar counts up in view, and a toast per tap
    // stacked over the event title.
    setQuantities((prev) => ({ ...prev, [key]: (Number(prev[key]) || 0) + qty }));
  };

  const setLineQty = (key, qty) => setQuantities((prev) => ({ ...prev, [key]: qty }));

  const collectsResponse = event.response_type === "signup" || event.response_type === "order";
  // Is there anything to change once they've responded? An order always has
  // quantities; a sign-up only does if the coach asked for guests or extra
  // questions. Without this, a bare sign-up shows an "Update" button that
  // can't update anything.
  const canEditResponse = event.response_type === "order" || event.ask_guest_count || questions.length > 0;

  const handleSubmit = () => {
    if (preview || !onSubmit) return;
    onSubmit({
      orderTotal,
      // null, not 0, when guests were never asked about — otherwise a
      // program sign-up roster reads "On their own" against every name.
      guestCount: event.response_type === "signup" && event.ask_guest_count ? guestCount : null,
      answers: questions.map((q) => ({ question: q.question_text, answer: answers[q.question_text] ?? "" })),
      lineItems: isOrder
        ? bagLines.map((line) => ({ eventItemId: line.item.id, option: line.option, qty: line.qty }))
        : [],
    });
  };

  const showSubmit = collectsResponse && !((response && !canEditResponse) || (isOrder && response && !bagDirty));
  const showBag = isOrder && (bagLines.length > 0 || Boolean(response));
  const hasDock = showSubmit || showBag;

  // Tell the floating message bubble how tall the pinned bar is, so it sits
  // above it instead of on top of Submit. Only for a real member's screen.
  const reportDock = Boolean(bagUserId) && !preview;
  useEffect(() => {
    if (!reportDock) return undefined;
    setBottomDockHeight(hasDock ? dockHeight : 0);
    return () => setBottomDockHeight(0);
  }, [reportDock, hasDock, dockHeight]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[contentContainerStyle, { paddingBottom: hasDock ? (dockHeight || 150) + 20 : 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        {header}
        {event.image_path ? (
          <View className="mb-4">
            <GraphicImage path={event.image_path} minRatio={0.5} maxHeight={360} radius={18} />
          </View>
        ) : null}

        <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }}>{event.title}</Text>
        <Text className="mb-4 mt-1 text-xs" style={{ fontFamily: fonts.sans, color: colors.muted }}>
          {`Closes ${formatDateShort(dateInBoise(new Date(event.closes_at)))}`}
          {event.location ? ` | ${event.location}` : ""}
        </Text>

        {event.body ? (
          <Card>
            <Text style={{ fontFamily: fonts.sans, color: "#44403c", lineHeight: 21 }}>{event.body}</Text>
          </Card>
        ) : null}

        {event.response_type === "link" ? (
          <PressFade
            onPress={() => (preview ? null : Linking.openURL(event.link_url))}
            disabled={preview}
            style={{
              alignItems: "center",
              borderRadius: 12,
              paddingVertical: 15,
              backgroundColor: colors.primary,
              marginBottom: 14,
            }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 15 }}>
              {event.cta_label || "Open"}
            </Text>
          </PressFade>
        ) : null}

        {/* Only when the coach actually asked for a guest count — a sign-up is
            just as often "put me down for the program", where guests are
            nonsense. Without it the sign-up needs no card at all; the button
            below is the whole interaction. */}
        {event.response_type === "signup" && event.ask_guest_count ? (
          <Card style={response ? { borderWidth: 2, borderColor: DONE_BORDER } : undefined}>
            <Text className="mb-1" style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c" }}>
              {response ? "You're signed up" : "Bringing anyone?"}
            </Text>
            <Text className="mb-3 text-xs" style={{ fontFamily: fonts.sans, color: colors.muted }}>
              Set how many guests so we can plan for them.
            </Text>
            <QtyStepper value={guestCount} onChange={setGuestCount} label="Guests" disabled={preview} />
          </Card>
        ) : null}

        {/* A sign-up with nothing to edit still needs to say it landed —
            otherwise the only feedback is a button relabelled "Update" that
            updates nothing. */}
        {event.response_type === "signup" && response && !canEditResponse ? (
          <Card style={{ borderWidth: 2, borderColor: DONE_BORDER, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Ionicons name="checkmark-circle" size={22} color={DONE_BORDER} />
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: DONE_BORDER }}>You're signed up</Text>
          </Card>
        ) : null}

        {isOrder ? (
          items.length === 0 ? (
            <Card>
              <Text className="text-sm" style={{ fontFamily: fonts.sans, color: colors.muted }}>
                Nothing to order yet.
              </Text>
            </Card>
          ) : (
            items.map((item) => <ProductCard key={item.id} item={item} onAdd={addToBag} preview={preview} />)
          )
        ) : null}

        {collectsResponse && questions.length > 0 ? (
          <Card>
            {questions.map((q) =>
              q.question_type === "single_choice" ? (
                <ChoiceAnswer
                  key={q.id}
                  question={q}
                  disabled={preview}
                  value={answers[q.question_text]}
                  onChange={(val) => setAnswers((prev) => ({ ...prev, [q.question_text]: val }))}
                />
              ) : (
                <View key={q.id} className="mb-4">
                  <Text className="mb-2 text-sm" style={{ fontFamily: fonts.sansMedium, color: "#44403c" }}>
                    {q.question_text}
                  </Text>
                  <TextInput
                    value={answers[q.question_text] ?? ""}
                    editable={!preview}
                    onChangeText={(val) => setAnswers((prev) => ({ ...prev, [q.question_text]: val }))}
                    inputAccessoryViewID={NUMERIC_DONE_ID}
                    className="rounded-lg border border-stone-300 px-3 py-2.5"
                    style={{ fontFamily: fonts.sans }}
                  />
                </View>
              )
            )}
          </Card>
        ) : null}

        {response && collectsResponse ? (
          <PressFade onPress={onCancel} disabled={preview} style={{ alignItems: "center", paddingVertical: 14 }}>
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 13 }}>
              {isOrder ? "Cancel my order" : "Cancel my sign-up"}
            </Text>
          </PressFade>
        ) : null}
      </ScrollView>

      {/* Pinned to the bottom of the screen, outside the scroll: the bag (once
          there's something in it) sitting right above the button that sends
          it, so neither needs a scroll to the end of the page. */}
      {hasDock ? (
        <View
          onLayout={(e) => setDockHeight(Math.round(e.nativeEvent.layout.height))}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            gap: 10,
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: 14,
            backgroundColor: colors.canvas,
            borderTopWidth: 1,
            borderTopColor: CARD_BORDER,
          }}
        >
          {showBag ? (
            <BagBar
              lines={bagLines}
              onChangeQty={setLineQty}
              sent={Boolean(response) && !bagDirty}
              unsentChanges={bagDirty && orderTotal > 0}
              totalPrice={totalPrice}
              preview={preview}
              expanded={bagExpanded}
              onToggle={() => setBagExpanded((v) => !v)}
            />
          ) : null}
          {showSubmit ? (
            <PressFade
              onPress={handleSubmit}
              disabled={submitting || preview}
              style={{
                opacity: submitting ? 0.5 : 1,
                alignItems: "center",
                borderRadius: 12,
                paddingVertical: 15,
                backgroundColor: response && !isOrder ? DONE_BORDER : colors.primary,
              }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 15 }}>
                {submitting
                  ? "Sending…"
                  : isOrder
                  ? response
                    ? "Update order"
                    : "Submit order"
                  : response
                  ? "Update"
                  : "Sign me up"}
              </Text>
            </PressFade>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
