import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { verifyHubPin } from "../../lib/programming/hub";
import { fonts, colors } from "../../lib/theme";

// The gate on the wall display's own "start a session" flow.
//
// It does three jobs with four taps: it keeps the control off a screen the
// whole gym walks past, it names the coach on the session (so a coaching note
// typed at the wall is attributed rather than anonymous — 0076), and it stops
// anyone pulling a client's goal and programming up in front of the room.
//
// It unlocks the SESSION, not each action: once a coach is in, adding and
// dropping need no further PIN, and ending needs none at all.
//
// The lockout below is client-side and a reload clears it. That is
// deliberate and proportionate — this is a private gym, the PIN protects a
// wall board rather than anything destructive, and the server has no
// per-device identity to rate-limit against anyway. It exists to make
// thumbing through 10,000 combinations tedious, not impossible.

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", null, "0", "del"];

function Dot({ filled }) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        marginHorizontal: 9,
        borderWidth: 2,
        borderColor: filled ? colors.primary : "#ddd6cd",
        backgroundColor: filled ? colors.primary : "transparent",
      }}
    />
  );
}

export function HubPinPad({ onVerified, onCancel, compact = false }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const attempts = useRef(0);
  const submitting = useRef(null);

  // A deadline, not a countdown — a tab that gets backgrounded throttles
  // timers, and a decrementing number drifts behind real time.
  useEffect(() => {
    if (lockedUntil <= now) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [lockedUntil, now]);

  const locked = lockedUntil > now;
  const secondsLeft = locked ? Math.ceil((lockedUntil - now) / 1000) : 0;

  // Digits go in through a functional update and the submit hangs off an
  // effect, rather than press() reading `pin` out of its own closure and
  // deciding there and then. Two taps landing in one React batch would
  // otherwise both read the same stale value and the second would overwrite
  // the first — which is exactly what four fast jabs at a wall touchscreen
  // look like.
  useEffect(() => {
    if (pin.length !== 4) return;
    if (submitting.current === pin) return;
    submitting.current = pin;
    submit(pin).finally(() => {
      submitting.current = null;
    });
  }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (value) => {
    setChecking(true);
    setError(null);
    try {
      const coach = await verifyHubPin(value);
      if (coach) {
        attempts.current = 0;
        onVerified(coach, value);
        return;
      }
      attempts.current += 1;
      setPin("");
      if (attempts.current >= MAX_ATTEMPTS) {
        attempts.current = 0;
        setLockedUntil(Date.now() + LOCKOUT_MS);
        setNow(Date.now());
        setError("Too many tries. Wait a moment.");
      } else {
        setError("That PIN didn't match.");
      }
    } catch (e) {
      setPin("");
      setError("Couldn't check that — check the connection.");
    } finally {
      setChecking(false);
    }
  };

  const press = (key) => {
    if (locked || checking) return;
    setError(null);
    if (key === "del") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    setPin((p) => (p + key).slice(0, 4));
  };

  const keySize = compact ? 62 : 84;

  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: compact ? 19 : 24, color: "#292524" }}>Coach PIN</Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: compact ? 13 : 15, color: colors.muted, marginTop: 5, textAlign: "center" }}>
        Enter your PIN to start a session on the board.
      </Text>

      <View style={{ flexDirection: "row", marginTop: 20, marginBottom: 6 }}>
        {[0, 1, 2, 3].map((i) => (
          <Dot key={i} filled={i < pin.length} />
        ))}
      </View>

      <View style={{ height: 22, justifyContent: "center" }}>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: error ? "#b23a22" : colors.muted }}>
          {locked ? `Locked for ${secondsLeft}s` : error ?? (checking ? "Checking…" : " ")}
        </Text>
      </View>

      <View style={{ width: keySize * 3 + 24, flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
        {KEYS.map((key, i) => {
          if (key === null) return <View key={i} style={{ width: keySize, height: keySize, margin: 4 }} />;
          return (
            <PressFade
              key={i}
              onPress={() => press(key)}
              disabled={locked || checking}
              style={{
                width: keySize,
                height: keySize,
                margin: 4,
                borderRadius: keySize / 2,
                borderWidth: 1,
                borderColor: "#ece7e1",
                backgroundColor: "white",
                alignItems: "center",
                justifyContent: "center",
                opacity: locked || checking ? 0.5 : 1,
              }}
            >
              {key === "del" ? (
                <Ionicons name="backspace-outline" size={compact ? 22 : 28} color={colors.muted} />
              ) : (
                <Text style={{ fontFamily: fonts.sansBold, fontSize: compact ? 24 : 30, color: "#292524" }}>{key}</Text>
              )}
            </PressFade>
          );
        })}
      </View>

      <PressFade onPress={onCancel} style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.muted }}>Cancel</Text>
      </PressFade>

      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: colors.hint, marginTop: 4, textAlign: "center", maxWidth: 300 }}>
        No PIN yet? Set one on your phone, under SPC · Live session. You can always start a session from there instead.
      </Text>
    </View>
  );
}
