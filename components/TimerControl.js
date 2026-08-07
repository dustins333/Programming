import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../lib/theme";

const CARD_BORDER = "#ece7e1";

// A manual stopwatch, not an automatic "workout duration" clock — a member
// might use it to time how long a lift takes, or reset it and use it again
// to time their rest before the next set. Shape: { elapsedMs, running,
// startedAt }. While running, true elapsed = elapsedMs + (now - startedAt);
// paused, it's just elapsedMs. Ticks its own re-render once a second while
// running so the display stays live without the parent re-rendering.
export function useElapsedTimer(timer) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!timer?.running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timer?.running]);

  if (!timer) return "00:00";
  const elapsedMs = timer.running ? timer.elapsedMs + (Date.now() - timer.startedAt) : timer.elapsedMs;
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// `compact` is used inside SessionFocusModal's header (smaller, no label);
// the standalone bar on My Fitness itself uses the default size.
export function TimerControl({ timer, onToggle, onReset, compact }) {
  const display = useElapsedTimer(timer);
  const hasElapsed = timer.elapsedMs > 0 || timer.running;
  const size = compact ? 28 : 34;
  const iconSize = compact ? 14 : 16;

  return (
    <View
      className="flex-row items-center rounded-2xl"
      style={{
        gap: compact ? 8 : 10,
        paddingVertical: compact ? 4 : 8,
        paddingHorizontal: compact ? 6 : 12,
        backgroundColor: compact ? "transparent" : "white",
        borderWidth: compact ? 0 : 1,
        borderColor: CARD_BORDER,
      }}
    >
      <Pressable
        onPress={onToggle}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={timer.running ? "Pause timer" : "Start timer"}
        className="items-center justify-center"
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary }}
      >
        <Ionicons name={timer.running ? "pause" : "play"} size={iconSize} color="white" style={timer.running ? undefined : { marginLeft: 1.5 }} />
      </Pressable>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: compact ? 13 : 15, color: "#44403c", minWidth: compact ? 42 : 48 }}>{display}</Text>
      {hasElapsed ? (
        <Pressable
          onPress={onReset}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Reset timer"
          className="items-center justify-center"
        >
          <Ionicons name="refresh" size={compact ? 14 : 15} color="#a8a29e" />
        </Pressable>
      ) : null}
    </View>
  );
}
