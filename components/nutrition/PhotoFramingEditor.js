import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Image, Pressable, PanResponder, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FramedPhoto } from "./FramedPhoto";
import { MAX_SCALE, MIN_SCALE, SCALE_STEP, normalizeFraming, panRange, withAspectRatio, withPan, withScale } from "../../lib/nutrition/photoFraming";
import { fonts } from "../../lib/theme";

const isWeb = Platform.OS === "web";

// Head, waist, feet — the three things the coach said she lines up.
export const DEFAULT_GUIDES = [0.17, 0.52, 0.93];

const GUIDE_TONE = "#a46a57";

// Drag to move, buttons to zoom.
//
// Deliberately PanResponder and plain buttons rather than
// gesture-handler pinch: this is coach work, done on the web build at a
// desk, and the responder system is the one thing in this app proven
// identical on web and native. A pinch gesture would also be the one part
// of the feature that could not be verified from here.
export function AdjustablePhoto({ uri, framing, width, height, radius = 12, onChange, onCommit, tone }) {
  const framingRef = useRef(framing);
  framingRef.current = framing;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const [dragging, setDragging] = useState(false);

  // The image's intrinsic ratio is captured here — the one deliberate,
  // interactive moment — and stored on the framing, so that every renderer
  // afterwards can work out the cover fit synchronously instead of running
  // an async measurement on every photo it draws. If it never resolves the
  // framing simply carries no `ar`, and the maths falls back to the
  // conservative rule that can't expose an edge at any frame shape.
  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (cancelled || !w || !h) return;
        const current = normalizeFraming(framingRef.current);
        const next = withAspectRatio(framingRef.current, w / h);
        if (!current || current.ar !== next.ar) onChangeRef.current(next);
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  // Recomputed from the framing at gesture START plus the total distance
  // travelled, never accumulated per move event — so dragging past the
  // clamp and back again returns exactly where it should instead of
  // sticking at the edge.
  const startRef = useRef(null);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = framingRef.current;
          setDragging(true);
        },
        onPanResponderMove: (_, gesture) => {
          const start = startRef.current;
          if (!start) return;
          onChangeRef.current(withPan(start, gesture.dx / width, gesture.dy / height, width, height));
        },
        onPanResponderRelease: () => {
          startRef.current = null;
          setDragging(false);
          onCommitRef.current();
        },
        onPanResponderTerminate: () => {
          startRef.current = null;
          setDragging(false);
          onCommitRef.current();
        },
      }),
    [width, height]
  );

  const f = normalizeFraming(framing);
  const scale = f?.scale ?? 1;
  const range = panRange(framing, width, height);
  const canPan = range.x > 0.001 || range.y > 0.001;

  const step = (delta) => {
    onChange(withScale(framing, scale + delta, width, height));
    onCommit();
  };

  const reset = () => {
    onChange(f ? { scale: 1, x: 0, y: 0, ar: f.ar } : null);
    onCommit();
  };

  return (
    <View style={{ width, height }}>
      <View
        {...panResponder.panHandlers}
        // In adjust mode the drag IS the intent, so the browser must not
        // take the gesture for a page scroll instead.
        style={isWeb ? { touchAction: "none", cursor: canPan ? "move" : "default" } : undefined}
      >
        <FramedPhoto uri={uri} framing={framing} width={width} height={height} radius={radius}>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              borderRadius: radius,
              borderWidth: 2,
              borderColor: dragging ? tone : "rgba(255,255,255,0.55)",
            }}
          />
        </FramedPhoto>
      </View>

      <View
        style={{ position: "absolute", left: 8, right: 8, bottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}
      >
        <View className="flex-row items-center" style={{ borderRadius: 999, backgroundColor: "rgba(26,20,17,0.72)", paddingHorizontal: 4, paddingVertical: 3, gap: 2 }}>
          <ZoomButton icon="remove" onPress={() => step(-SCALE_STEP)} disabled={scale <= MIN_SCALE + 0.001} />
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "white", minWidth: 42, textAlign: "center" }}>
            {Math.round(scale * 100)}%
          </Text>
          <ZoomButton icon="add" onPress={() => step(SCALE_STEP)} disabled={scale >= MAX_SCALE - 0.001} />
        </View>

        <Pressable
          onPress={reset}
          style={{ borderRadius: 999, backgroundColor: "rgba(26,20,17,0.72)", paddingHorizontal: 12, paddingVertical: 7 }}
        >
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "white" }}>Reset</Text>
        </Pressable>
      </View>

      {!canPan ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 8, right: 8, top: 46, alignItems: "center" }}>
          <Text
            style={{
              fontFamily: fonts.sans,
              fontSize: 11,
              color: "white",
              backgroundColor: "rgba(26,20,17,0.6)",
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
              overflow: "hidden",
            }}
          >
            Zoom in to move this photo
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ZoomButton({ icon, onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}
    >
      <Ionicons name={icon} size={16} color="white" />
    </Pressable>
  );
}

// Horizontal rules running across BOTH photos. Without them you are
// judging whether two heads are level across a gap with nothing to measure
// against, which is the actual hard part of the job.
export function AlignmentGuides({ height, guides, onChange }) {
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: 0, height }}>
      {guides.map((value, index) => (
        <Guide key={index} value={value} height={height} onChange={(next) => onChange(guides.map((g, i) => (i === index ? next : g)))} />
      ))}
    </View>
  );
}

function Guide({ value, height, onChange }) {
  const startRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = valueRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          const next = Math.min(0.99, Math.max(0.01, startRef.current + gesture.dy / height));
          onChangeRef.current(next);
        },
      }),
    [height]
  );

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: value * height - 11, height: 22, justifyContent: "center" }}>
      <View pointerEvents="none" style={{ height: 1.5, backgroundColor: GUIDE_TONE, opacity: 0.9 }} />
      <View
        {...panResponder.panHandlers}
        style={{
          position: "absolute",
          left: -2,
          width: 30,
          height: 22,
          borderRadius: 6,
          backgroundColor: GUIDE_TONE,
          alignItems: "center",
          justifyContent: "center",
          ...(isWeb ? { touchAction: "none", cursor: "ns-resize" } : {}),
        }}
      >
        <Ionicons name="reorder-two" size={15} color="white" />
      </View>
    </View>
  );
}
