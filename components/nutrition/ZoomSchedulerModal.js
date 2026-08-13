import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, ActivityIndicator } from "react-native";
import { fonts, colors } from "../../lib/theme";
import { getCheckinBookingSlots, bookCheckinSession } from "../../lib/nutrition/checkinBooking";

const BOISE_TZ = "America/Boise";

function formatDayHeading(dateStr) {
  // dateStr is a plain "YYYY-MM-DD" key from GHL's free-slots response —
  // parse as noon UTC so it can't roll to the previous/next day in any
  // timezone before formatting.
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { timeZone: BOISE_TZ, weekday: "short", month: "short", day: "numeric" });
}

function formatSlotTime(iso) {
  // iso already carries its own real UTC offset (e.g. "...T09:30:00-06:00")
  // from GHL — formatting with an explicit Boise timeZone renders the
  // correct wall-clock time regardless of the viewing device's own zone.
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: BOISE_TZ, hour: "numeric", minute: "2-digit" });
}

// Opened right after a member's check-in submits with the Zoom option
// picked (see the booking_option column, migration 0042) — a real slot
// picker against Terra's GHL calendar, not a placeholder. Booking itself
// happens server-side (book-checkin-session) using the member's stored
// ghl_contact_id, never a raw phone number.
export function ZoomSchedulerModal({ visible, onClose }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [days, setDays] = useState([]);
  const [booking, setBooking] = useState(null);
  const [bookError, setBookError] = useState(null);
  const [booked, setBooked] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setLoadError(null);
    setBooked(null);
    setBookError(null);
    getCheckinBookingSlots()
      .then(setDays)
      .catch((err) => setLoadError(err.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [visible]);

  const handlePick = async (iso) => {
    setBooking(iso);
    setBookError(null);
    try {
      await bookCheckinSession(iso);
      setBooked(iso);
    } catch (err) {
      setBookError(err.message ?? String(err));
    } finally {
      setBooking(null);
    }
  };

  const handleClose = () => {
    setBooked(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      {/* House bottom sheet — was a centered white card, the odd one out
          among the member-facing content modals. */}
      <Pressable onPress={handleClose} className="flex-1 justify-end" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="w-full"
          style={{ maxHeight: "85%", backgroundColor: "#faf8f6", borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden" }}
        >
          <View className="border-b border-stone-200 px-5 py-4">
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 16 }}>Schedule your Zoom check-in</Text>
            <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
              Pick a time that works for you.
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {booked ? (
              <View className="items-center py-6">
                <Text className="mb-1 text-center" style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#4d6142" }}>
                  You're booked!
                </Text>
                <Text className="text-center text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
                  {formatDayHeading(booked.slice(0, 10))} at {formatSlotTime(booked)}
                </Text>
              </View>
            ) : loading ? (
              <View className="items-center py-8">
                <ActivityIndicator color={colors.primaryOnWhite} />
              </View>
            ) : loadError ? (
              <View className="items-center py-6">
                <Text className="mb-3 text-center text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
                  {loadError}
                </Text>
                <Pressable
                  onPress={() => {
                    setLoading(true);
                    // Cleared here, not just in the mount effect — the render
                    // below branches on loadError before days, so a
                    // successful retry otherwise left this error screen up
                    // with the slots loaded behind it and no way past.
                    setLoadError(null);
                    getCheckinBookingSlots()
                      .then(setDays)
                      .catch((err) => setLoadError(err.message ?? String(err)))
                      .finally(() => setLoading(false));
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
                </Pressable>
              </View>
            ) : days.length === 0 ? (
              <Text className="text-center text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                No open times in the next two weeks — message your coach to find a time.
              </Text>
            ) : (
              days.map((day) => (
                <View key={day.date} className="mb-4">
                  <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
                    {formatDayHeading(day.date)}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {day.slots.map((iso) => (
                      <Pressable
                        key={iso}
                        onPress={() => handlePick(iso)}
                        disabled={booking !== null}
                        className="rounded-lg border px-3 py-2 disabled:opacity-50"
                        style={{ borderColor: "#d6d3d1" }}
                      >
                        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13 }}>
                          {booking === iso ? "Booking…" : formatSlotTime(iso)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))
            )}

            {bookError ? (
              <Text className="mt-1 text-center text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
                {bookError}
              </Text>
            ) : null}
          </ScrollView>

          <View className="flex-row justify-end border-t border-stone-100 p-4">
            <Pressable onPress={handleClose} className="rounded-lg bg-primary px-4 py-3">
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {booked ? "Done" : "Skip for now"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
