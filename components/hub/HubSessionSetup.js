import { useState } from "react";
import { Text, View } from "react-native";
import { PressFade } from "../PressFade";
import { HubClientPickList } from "./HubClientPickList";
import { startHubSession } from "../../lib/programming/hub";
import { toastError } from "../../lib/toast";
import { fonts, colors, type } from "../../lib/theme";

// The coach's "start a live session" picker — the SAME list the wall display
// uses (HubClientPickList), so the two surfaces cannot disagree about who is
// startable or which session defaults.
//
// It used to be four slots over a modal that listed every active SPC client
// and only told you a name was unusable AFTER you picked it. On real data that
// was 72 names of which 62 failed, because an spc_clients row exists whether
// or not anyone ever programmed a block for that person. The list now asks
// the database which clients are actually startable — see migration 0084 for
// what it includes and, more importantly, what it leaves out.
//
// No PIN on this side: the coach is already signed in. The PIN only exists so
// the board can name a coach who isn't.

export function HubSessionSetup({ profile, onStarted }) {
  const [slots, setSlots] = useState([]);
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    if (slots.length === 0 || starting) return;
    setStarting(true);
    try {
      await startHubSession({
        coachId: profile.id,
        coachName: profile.name ?? null,
        slots: slots.map((s) => ({
          userId: s.userId,
          clientName: s.name,
          spcWorkoutId: s.spcWorkoutId,
          weekNumber: s.weekNumber,
        })),
      });
      setSlots([]);
      onStarted?.();
    } catch (e) {
      toastError("Couldn't start the session.", e);
    } finally {
      setStarting(false);
    }
  };

  return (
    <View>
      <Text style={{ fontFamily: fonts.sans, fontSize: type.body, lineHeight: 20, color: colors.muted, marginBottom: 14 }}>
        Up to four clients. Each defaults to her next incomplete session this week — tap a session pill to change it.
      </Text>

      {/* A fixed height because this sits inside the page's own ScrollView: a
          flex:1 list would collapse to nothing there, and a self-sizing one
          would nest a scroller inside a scroller. */}
      <View style={{ height: 460 }}>
        <HubClientPickList mode="multi" onChange={setSlots} compact />
      </View>

      <PressFade
        onPress={handleStart}
        disabled={slots.length === 0 || starting}
        style={{
          marginTop: 14,
          borderRadius: 14,
          paddingVertical: 15,
          alignItems: "center",
          backgroundColor: colors.primary,
          opacity: slots.length === 0 || starting ? 0.5 : 1,
        }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "white" }}>
          {starting ? "Starting…" : `Start live session${slots.length > 0 ? ` (${slots.length})` : ""}`}
        </Text>
      </PressFade>
    </View>
  );
}
