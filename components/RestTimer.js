import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { fonts } from "../lib/theme";

const PRESETS = [60, 90, 120];

function formatSeconds(total) {
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// A between-sets countdown on the logging card — tap a preset, watch it
// run down, "Rest done" at zero. Local, ephemeral state only (like the
// warm-up checkboxes): this is a live-session aid, not tracked data. No
// sound/haptics — the member is looking at this screen between sets
// anyway, and the app has no haptics dependency to lean on.
export function RestTimer() {
  const [endsAt, setEndsAt] = useState(null);
  const [, tick] = useState(0);

  const remainingMs = endsAt ? endsAt - Date.now() : null;
  const running = endsAt !== null && remainingMs > 0;
  const done = endsAt !== null && remainingMs <= 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [running]);

  return (
    <View className="mb-2.5 flex-row items-center" style={{ gap: 8, flexWrap: "wrap" }}>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#78716c" }}>Rest</Text>
      {running ? (
        <>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#b23a22", minWidth: 40 }}>
            {formatSeconds(Math.ceil(remainingMs / 1000))}
          </Text>
          <Pressable onPress={() => setEndsAt(null)} hitSlop={8} accessibilityLabel="Cancel rest timer">
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#a8a29e" }}>✕ cancel</Text>
          </Pressable>
        </>
      ) : done ? (
        <Pressable onPress={() => setEndsAt(null)} hitSlop={8} accessibilityLabel="Dismiss rest timer">
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#4d6142" }}>Rest done — go! ✕</Text>
        </Pressable>
      ) : (
        PRESETS.map((seconds) => (
          <Pressable
            key={seconds}
            onPress={() => setEndsAt(Date.now() + seconds * 1000)}
            className="rounded-full border px-2.5 py-1"
            style={{ borderColor: "#d9d4cd" }}
            accessibilityLabel={`Start ${formatSeconds(seconds)} rest timer`}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11.5, color: "#78716c" }}>{formatSeconds(seconds)}</Text>
          </Pressable>
        ))
      )}
    </View>
  );
}
