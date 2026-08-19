import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { GraphicImage } from "../GraphicImage";
import { formatDateMDY } from "../../lib/formatDate";
import { formatDateTimeInBoise, dateInBoise } from "../../lib/boiseDate";
import { fonts, colors } from "../../lib/theme";

// One event as it appears in the member's Events list. Lives in components/
// rather than inside the list screen so the coach's "Preview" can render the
// real card instead of a lookalike — a preview that drifts from what members
// actually see is worse than no preview.
export const CARD_BORDER = "#ece7e1";
export const DONE_BORDER = "#4d6142";

// "Closes Friday" reads better than a full timestamp for anything close,
// and a real date is clearer for anything further out.
export function closesLabel(closesAt) {
  const closes = new Date(closesAt);
  const days = Math.ceil((closes - new Date()) / 86400000);
  if (days <= 1) return `Closes ${formatDateTimeInBoise(closesAt)}`;
  if (days <= 7) return `Closes ${closes.toLocaleDateString("en-US", { weekday: "long" })}`;
  // dateInBoise, never closesAt.slice(0, 10) — slicing reads the UTC date
  // out of the ISO string, which is already tomorrow for anything closing
  // in the Boise evening. Same class of bug as the completed_at slice this
  // codebase hit before.
  return `Closes ${formatDateMDY(dateInBoise(closes))}`;
}

function respondedLabel(event, response) {
  if (!response) return null;
  if (event.response_type === "order") return "Order placed";
  if (event.response_type === "signup") return "Signed up";
  return "Responded";
}

export function EventCard({ event, response, onPress }) {
  const done = Boolean(response);
  const needsResponse = event.response_type !== "none" && !done;

  return (
    <PressFade
      onPress={onPress}
      style={{
        marginBottom: 14,
        borderRadius: 18,
        borderWidth: done ? 2 : 1,
        borderColor: done ? DONE_BORDER : CARD_BORDER,
        backgroundColor: "white",
        overflow: "hidden",
      }}
    >
      {/* Cropped band, not the whole poster — this card is a doorway. The
          full graphic is shown uncropped on the event itself. */}
      {event.image_path ? <GraphicImage path={event.image_path} coverHeight={150} radius={0} /> : null}

      <View style={{ padding: 16 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, color: "#44403c" }}>{event.title}</Text>

        <Text className="mt-1 text-xs" style={{ fontFamily: fonts.sans, color: colors.muted }}>
          {event.event_date ? `${formatDateMDY(event.event_date)} · ` : ""}
          {closesLabel(event.closes_at)}
          {event.location ? ` · ${event.location}` : ""}
        </Text>

        {event.body ? (
          <Text numberOfLines={2} className="mt-2 text-sm" style={{ fontFamily: fonts.sans, color: "#57534e" }}>
            {event.body}
          </Text>
        ) : null}

        {done ? (
          <View className="mt-3 flex-row items-center gap-1.5">
            <Ionicons name="checkmark-circle" size={16} color={DONE_BORDER} />
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: DONE_BORDER }}>
              {respondedLabel(event, response)}
            </Text>
          </View>
        ) : needsResponse ? (
          <View className="mt-3 flex-row items-center gap-1.5">
            <Ionicons name="arrow-forward-circle-outline" size={16} color={colors.primaryOnWhite} />
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>
              {event.response_type === "order"
                ? "Put in your order"
                : event.response_type === "link"
                ? // Match the button the coach actually named, or the card
                  // promises "Open" and the event says "Register on our site".
                  event.cta_label || "Open"
                : "Sign up"}
            </Text>
          </View>
        ) : null}
      </View>
    </PressFade>
  );
}
