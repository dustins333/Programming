import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { GraphicImage } from "../GraphicImage";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";
import { CARD_BORDER, DONE_BORDER } from "./EventCard";
import { formatDateMDY } from "../../lib/formatDate";
import { formatDateTimeInBoise } from "../../lib/boiseDate";
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

export function EventDetailView({
  event,
  items = [],
  questions = [],
  response = null,
  onSubmit,
  onCancel,
  submitting = false,
  preview = false,
}) {
  const [guestCount, setGuestCount] = useState(response?.guest_count ?? 0);
  const [answers, setAnswers] = useState({});
  const [quantities, setQuantities] = useState({});

  // Reseed whenever the loaded response changes — the screen refetches after
  // every submit, and the form must reflect what actually landed rather than
  // whatever was typed.
  useEffect(() => {
    setGuestCount(response?.guest_count ?? 0);
    setAnswers(Object.fromEntries((response?.answers ?? []).map((a) => [a.question, a.answer])));
    setQuantities(
      Object.fromEntries((response?.lineItems ?? []).map((li) => [lineKey(li.event_item_id, li.option), li.qty]))
    );
  }, [response]);

  const orderTotal = useMemo(() => Object.values(quantities).reduce((sum, q) => sum + (q || 0), 0), [quantities]);

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
      lineItems:
        event.response_type === "order"
          ? Object.entries(quantities)
              .filter(([, qty]) => qty > 0)
              .map(([key, qty]) => {
                const [eventItemId, option] = key.split("::");
                return { eventItemId, option: option || null, qty };
              })
          : [],
    });
  };

  return (
    <>
      {event.image_path ? (
        <View className="mb-4">
          <GraphicImage path={event.image_path} minRatio={0.5} maxHeight={360} radius={18} />
        </View>
      ) : null}

      <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primary }}>{event.title}</Text>
      <Text className="mb-4 mt-1 text-xs" style={{ fontFamily: fonts.sans, color: "#8a8580" }}>
        {event.event_date ? `${formatDateMDY(event.event_date)} · ` : ""}
        {`Closes ${formatDateTimeInBoise(event.closes_at)}`}
        {event.location ? ` · ${event.location}` : ""}
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
          <Text className="mb-3 text-xs" style={{ fontFamily: fonts.sans, color: "#8a8580" }}>
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

      {event.response_type === "order" ? (
        <Card style={response ? { borderWidth: 2, borderColor: DONE_BORDER } : undefined}>
          <Text className="mb-1" style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#44403c" }}>
            {response ? "Your order" : "What do you want?"}
          </Text>
          <Text className="mb-2 text-xs" style={{ fontFamily: fonts.sans, color: "#8a8580" }}>
            No payment now — we'll sort that when it arrives.
          </Text>

          {items.length === 0 ? (
            <Text className="mt-3 text-sm" style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>
              Nothing to order yet.
            </Text>
          ) : null}

          {items.map((item) => {
            const options = item.options ?? [];
            return (
              <View key={item.id} className="mt-3 border-t pt-2" style={{ borderTopColor: CARD_BORDER }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{item.name}</Text>
                {item.description ? (
                  <Text className="mt-0.5 text-xs" style={{ fontFamily: fonts.sans, color: "#8a8580" }}>
                    {item.description}
                  </Text>
                ) : null}

                {options.length > 0 ? (
                  options.map((opt) => {
                    const key = lineKey(item.id, opt);
                    return (
                      <QtyStepper
                        key={key}
                        label={opt}
                        disabled={preview}
                        value={quantities[key] ?? 0}
                        onChange={(qty) => setQuantities((prev) => ({ ...prev, [key]: qty }))}
                      />
                    );
                  })
                ) : (
                  <QtyStepper
                    label="How many"
                    disabled={preview}
                    value={quantities[lineKey(item.id, null)] ?? 0}
                    onChange={(qty) => setQuantities((prev) => ({ ...prev, [lineKey(item.id, null)]: qty }))}
                  />
                )}
              </View>
            );
          })}

          {orderTotal > 0 ? (
            <Text className="mt-4 text-sm" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
              {orderTotal} {orderTotal === 1 ? "item" : "items"} total
            </Text>
          ) : null}
        </Card>
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

      {collectsResponse ? (
        <>
          {/* Hidden once they've responded and there's nothing left to
              change — the confirmation card above already says it landed. */}
          {response && !canEditResponse ? null : (
            <PressFade
              onPress={handleSubmit}
              disabled={submitting || preview}
              style={{
                opacity: submitting ? 0.5 : 1,
                alignItems: "center",
                borderRadius: 12,
                paddingVertical: 15,
                backgroundColor: response ? DONE_BORDER : colors.primary,
              }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 15 }}>
                {submitting
                  ? "Sending…"
                  : response
                  ? "Update"
                  : event.response_type === "order"
                  ? "Place order"
                  : "Sign me up"}
              </Text>
            </PressFade>
          )}

          {response ? (
            <PressFade onPress={onCancel} disabled={preview} style={{ alignItems: "center", paddingVertical: 14 }}>
              <Text style={{ fontFamily: fonts.sansMedium, color: "#8a8580", fontSize: 13 }}>
                {event.response_type === "order" ? "Cancel my order" : "Cancel my sign-up"}
              </Text>
            </PressFade>
          ) : null}
        </>
      ) : null}
    </>
  );
}
