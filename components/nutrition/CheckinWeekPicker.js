import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { CheckinWeekTimeline } from "./CheckinWeekTimeline";
import { fonts, colors } from "../../lib/theme";

// Jump between check-ins from the Check-In tab's own title. The ‹ Older /
// Newer › pair steps one week at a time, which is fine for last week and
// useless for "what did she say when she started" — this is the way back
// through a year of them.
//
// It renders CheckinWeekTimeline rather than a list of its own, so the
// statuses here (completed, awaiting review, missed, reopened, photos in or
// missing) are the same ones the Settings tab shows, from the same code. A
// second implementation would be a second definition of "completed".
// Exported because the page has to LOAD at least this much check-in history
// for the list to be truthful. Showing more weeks than were fetched renders
// real, completed check-ins as "Missed" with a Reopen button next to them —
// so these two numbers must never drift apart.
export const PICKER_PAST_WEEKS = 16;

export function CheckinWeekPicker({
  visible,
  onClose,
  userId,
  coachId,
  client,
  checkins,
  reopens,
  photos,
  today,
  onChanged,
  selectedWeekStart,
  onSelectWeek,
  viewingOnboarding,
  onSelectOnboarding,
  onboardingSubmittedAt,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center px-4" style={{ backgroundColor: "rgba(68,64,60,0.35)" }} onPress={onClose}>
        {/* Stops a tap inside the card falling through to the scrim's
            dismiss — the card is a Pressable with no handler purely to
            swallow it. */}
        <Pressable className="w-full rounded-2xl bg-white" style={{ maxWidth: 520, maxHeight: "85%" }} onPress={() => {}}>
          <View className="flex-row items-center justify-between px-5 pb-3 pt-5">
            <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.primary }}>Jump to a check-in</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 18, color: "#a8a29e" }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 20 }}>
            <CheckinWeekTimeline
              userId={userId}
              coachId={coachId}
              client={client}
              checkins={checkins}
              reopens={reopens}
              photos={photos}
              today={today}
              onChanged={onChanged}
              pastWeeks={PICKER_PAST_WEEKS}
              selectedWeekStart={viewingOnboarding ? null : selectedWeekStart}
              onSelectWeek={onSelectWeek}
              onboardingEntry={{
                onSelect: onSelectOnboarding,
                selected: viewingOnboarding,
                submittedAt: onboardingSubmittedAt,
              }}
            />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
