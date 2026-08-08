import { View, Image, Pressable, Text, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

// Full-screen pinch-zoom/pan/double-tap-to-reset image viewer — native
// parity with the standalone web app's PhotoLightbox, per the confirmed
// nutrition-rebuild decision (photo compare gets full native functionality,
// not a simplified fallback). Built on react-native-gesture-handler +
// reanimated, both already app dependencies (used elsewhere for native
// interactions), rather than pulling in a separate viewer library.
export function ZoomableImage({ uri, onClose }) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Called from inside .onEnd() gesture worklets below, which run on the UI
  // thread — a plain JS function can't be called synchronously from there
  // ("[Worklets] Tried to synchronously call a Remote Function"). Since
  // this only touches shared values (no React state, nothing JS-thread-only),
  // marking it a worklet directly is correct here, not runOnJS — that would
  // just bounce back to the JS thread for no reason.
  const reset = () => {
    "worklet";
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = 1;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) reset();
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value <= 1) return;
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        reset();
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(Gesture.Race(doubleTap, pan), pinch);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.95)" }}>
      <Pressable
        onPress={onClose}
        hitSlop={12}
        style={{ position: "absolute", top: 48, right: 20, zIndex: 10, width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)" }}
      >
        <Ionicons name="close" size={22} color="white" />
      </Pressable>
      <GestureDetector gesture={composed}>
        <Animated.View style={[{ flex: 1, alignItems: "center", justifyContent: "center" }, animatedStyle]}>
          <Image source={{ uri }} style={{ width, height: height * 0.85 }} resizeMode="contain" />
        </Animated.View>
      </GestureDetector>
      <Text style={{ position: "absolute", bottom: 40, alignSelf: "center", color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
        Pinch to zoom · double-tap to reset
      </Text>
    </View>
  );
}
