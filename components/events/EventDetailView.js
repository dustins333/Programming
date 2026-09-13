import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Linking, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { GraphicImage } from "../GraphicImage";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { CARD_BORDER, DONE_BORDER } from "./EventCard";
import { formatDateShort } from "../../lib/formatDate";
import { dateInBoise } from "../../lib/boiseDate";
import { setBottomDockHeight } from "../../lib/bottomDock";
import { formatPrice, itemOptions } from "../../lib/programming/events";
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

// A square photo for a product or one of its options, or nothing at all when
// there isn't one (an empty grey square in every row reads as broken).
function Thumb({ path, size = 56 }) {
  if (!path) return null;
  return (
    <View style={{ width: size, height: size, borderRadius: 10, overflow: "hidden", backgroundColor: "#f1efed" }}>
      <GraphicImage path={path} coverHeight={size} radius={0} />
    </View>
  );
}

// The control on a sellable row: a single + until it's in the bag, then
// - count + so the bag can be adjusted right where it was added.
function BagStepper({ qty, onChange, disabled, label }) {
  if (!qty) {
    return (
      <PressFade
        onPress={() => onChange(1)}
        disabled={disabled}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`Add ${label} to bag`}
      >
        <Ionicons name="add-circle" size={34} color={colors.primary} />
      </PressFade>
    );
  }
  return <MiniStepper value={qty} min={0} onChange={onChange} disabled={disabled} label={label} />;
}

// One product, store-style. A product with options (Protein: Vanilla,
// Chocolate) is a parent: tap it to open its options, each with its own
// photo and a + that goes straight into the bag. A product with no options
// gets the + on the card itself. Price is the parent's, shared by its
// options.
function ProductCard({ item, quantities, onChangeQty, preview }) {
  const options = itemOptions(item);
  const [expanded, setExpanded] = useState(false);
  const price = formatPrice(item.price);
  const inBag = options.reduce((sum, opt) => sum + (Number(quantities[lineKey(item.id, opt.name)]) || 0), 0);

  const summary = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
      <Thumb path={item.image_path} size={72} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, color: "#292524" }}>{item.name}</Text>
        {price ? <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: colors.primaryOnWhite, marginTop: 2 }}>{price}</Text> : null}
        {item.description ? (
          <Text className="text-xs" style={{ fontFamily: fonts.sans, color: colors.muted, marginTop: 2 }}>
            {item.description}
          </Text>
        ) : null}
        {options.length > 0 ? (
          <Text className="text-xs" style={{ fontFamily: fonts.sansMedium, color: inBag ? colors.primaryOnWhite : colors.muted, marginTop: 4 }}>
            {options.length} {options.length === 1 ? "option" : "options"}
            {inBag ? ` | ${inBag} in your bag` : ""}
          </Text>
        ) : null}
      </View>
      {options.length > 0 ? (
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color="#78716c" />
      ) : (
        <BagStepper
          qty={Number(quantities[lineKey(item.id, null)]) || 0}
          onChange={(q) => onChangeQty(lineKey(item.id, null), q)}
          disabled={preview}
          label={item.name}
        />
      )}
    </View>
  );

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {options.length > 0 ? (
        <PressFade onPress={() => setExpanded((v) => !v)} accessibilityLabel={`${expanded ? "Hide" : "Show"} ${item.name} options`}>
          {summary}
        </PressFade>
      ) : (
        summary
      )}

      {expanded
        ? options.map((opt) => {
            const key = lineKey(item.id, opt.name);
            return (
              <View
                key={opt.name}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderTopWidth: 1,
                  borderTopColor: CARD_BORDER,
                  backgroundColor: "#fdfbf9",
                }}
              >
                <Thumb path={opt.image_path} size={56} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#292524" }}>{opt.name}</Text>
                  {price ? <Text className="text-xs" style={{ fontFamily: fonts.sans, color: colors.muted, marginTop: 1 }}>{price}</Text> : null}
                </View>
                <BagStepper
                  qty={Number(quantities[key]) || 0}
                  onChange={(q) => onChangeQty(key, q)}
                  disabled={preview}
                  label={`${item.name} ${opt.name}`}
                />
              </View>
            );
          })
        : null}
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
          const opts = itemOptions(item).map((o) => o.name);
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
            items.map((item) => (
            <ProductCard key={item.id} item={item} quantities={quantities} onChangeQty={setLineQty} preview={preview} />
          ))
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
