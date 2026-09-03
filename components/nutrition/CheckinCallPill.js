import { View, Text } from "react-native";
import { formatBookingWhen } from "../../lib/nutrition/checkinBooking";
import { fonts } from "../../lib/theme";

// "She has a call booked" on a roster line, and the day and time next to it.
//
// The label says ZOOM because that is the wording the client picked on her
// own check-in (see booking_option, 0042) -- the appointment itself is a
// GoHighLevel calendar slot and the call is run manually at that time, but
// naming the mechanism rather than the thing would only puzzle a coach.
//
// Peach on peach, matching the "last time" pill and the selected-session
// banner: this is context, not an alert. A booked call is good news.
export function CheckinCallPill({ booking, today, long = false }) {
  if (!booking?.startsAt) return null;
  return (
    <View className="flex-row items-center" style={{ gap: 6, flexShrink: 1, minWidth: 0 }}>
      <View
        style={{
          backgroundColor: "#fdece5",
          borderRadius: 999,
          paddingHorizontal: 6,
          paddingVertical: 1.5,
          flexShrink: 0,
        }}
      >
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={{ fontFamily: fonts.sansBold, fontSize: 9, color: "#b23a22", letterSpacing: 0.5 }}
        >
          ZOOM
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={{ fontFamily: fonts.sansMedium, fontSize: long ? 12 : 11.5, color: "#8a5140", flexShrink: 1, minWidth: 0 }}
      >
        {formatBookingWhen(booking.startsAt, { today, long })}
      </Text>
    </View>
  );
}
