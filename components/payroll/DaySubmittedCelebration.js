// The "you definitely got your info in" moment, per direct ask — a plain
// toast wasn't enough of a confirmation for payroll, where the whole worry
// is a coach not being sure their hours actually landed.
//
// Built on react-native's own Animated (already used app-wide, no new
// dependency — deliberately not reaching for a confetti library for one
// screen). Confetti pieces each own their own Animated.Value via a child
// component, since hooks can't be created in a loop.
import { useEffect, useMemo, useRef } from "react";
import { Modal, View, Text, Pressable, Animated, Easing, Platform, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, colors } from "../../lib/theme";

// RNW ignores the native driver and warns; every animation here is
// transform/opacity only, so native gets the real thing and web falls back
// to the JS driver.
const USE_NATIVE_DRIVER = Platform.OS !== "web";

// The app's own palette — brand terracotta, the olive "done" tone, the
// peach card tint, and the two accent tones already used by status pills.
const CONFETTI_COLORS = ["#a46a57", "#4d6142", "#e8c9a0", "#b23a22", "#8fb473", "#f0ddd2"];
const PIECE_COUNT = 18;

const MESSAGES = ["Nice work!", "Boom — logged.", "That's in the books.", "Locked in.", "Got it. Nice."];

const CHECK_COLOR = "#4d6142";

function ConfettiPiece({ x, delay, color, size, distance }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 1500,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, delay]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-40, distance] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "540deg"] });
  const opacity = progress.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x,
        top: 0,
        width: size,
        height: size * 1.8,
        borderRadius: 2,
        backgroundColor: color,
        transform: [{ translateY }, { rotate }],
        opacity,
      }}
    />
  );
}

export function DaySubmittedCelebration({ visible, dateLabel, amountLabel, onClose }) {
  const { width, height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(0.7)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  // Regenerated per open (keyed on `visible`) so it doesn't look like the
  // exact same animation replaying every time.
  const pieces = useMemo(() => {
    if (!visible) return [];
    return Array.from({ length: PIECE_COUNT }, (_, i) => ({
      key: `${i}`,
      x: Math.random() * Math.max(width - 12, 40),
      delay: Math.random() * 420,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 5,
    }));
  }, [visible, width]);

  const message = useMemo(() => (visible ? MESSAGES[Math.floor(Math.random() * MESSAGES.length)] : ""), [visible]);

  // Held in a ref so the auto-dismiss timer below isn't restarted every
  // time the parent re-renders with a fresh inline onClose.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible) {
      scale.setValue(0.7);
      cardOpacity.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();

    const t = setTimeout(() => onCloseRef.current?.(), 2600);
    return () => clearTimeout(t);
  }, [visible, scale, cardOpacity]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height }}>
          {pieces.map((p) => (
            <ConfettiPiece key={p.key} x={p.x} delay={p.delay} color={p.color} size={p.size} distance={height} />
          ))}
        </View>

        <Animated.View
          style={{
            width: "100%",
            maxWidth: 340,
            alignItems: "center",
            borderRadius: 22,
            backgroundColor: "white",
            paddingVertical: 30,
            paddingHorizontal: 24,
            opacity: cardOpacity,
            transform: [{ scale }],
          }}
        >
          <View className="mb-4 items-center justify-center rounded-full" style={{ width: 64, height: 64, backgroundColor: "#eef1e7" }}>
            <Ionicons name="checkmark-circle" size={44} color={CHECK_COLOR} />
          </View>
          <Text className="mb-1 text-center text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            {message}
          </Text>
          <Text className="text-center" style={{ fontFamily: fonts.sansMedium, color: "#57534e" }}>
            {dateLabel} is submitted.
          </Text>
          {amountLabel ? (
            <Text className="mt-3 text-center text-xl" style={{ fontFamily: fonts.sansBold, color: CHECK_COLOR }}>
              {amountLabel}
            </Text>
          ) : null}
          <Text className="mt-4 text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            Tap anywhere to close
          </Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
