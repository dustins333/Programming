import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, Platform, AppState } from "react-native";
import { toastError } from "../../lib/toast";
import { updateGamePlan, beaconGamePlan } from "../../lib/nutrition/coachClient";
import { fonts } from "../../lib/theme";
import { NUMERIC_DONE_ID } from "../NumericInputAccessory";

const isWeb = Platform.OS === "web";
const MIN_HEIGHT = 100;
// Web can't grow (see the comment above the input), so it opens taller —
// roughly the length of a real check-in note before it needs to scroll.
const WEB_HEIGHT = 150;
// Same delay the builder's Coach Ed rail uses — long enough not to write on
// every keystroke, short enough that a browser tab closed mid-sentence has
// almost certainly already saved.
const SAVE_DELAY = 700;

// Coach notes on a nutrition client. AUTOSAVES — there is deliberately no
// Save button any more.
//
// It used to hold the text in local state behind an explicit "Save notes"
// button, and every surface that renders it unmounts on a tap: the Check-In
// tab is torn down when the coach switches tab or pages to another week, and
// the floating notes bubble closes on a tap-away. So typing a review and
// then navigating anywhere silently threw it away. That happened three times
// in one sitting before it was reported.
//
// Three flushes, because each covers a case the others miss:
//   1. debounce   — the normal path, while the coach is still typing.
//   2. blur       — clicking a tab, a link, or anything else outside the box
//                   moves focus first, so this lands before the unmount.
//   3. unmount    — programmatic navigation and the bubble's tap-away close
//                   don't always blur first. Fired directly rather than by
//                   leaving the timer running: the write should start now,
//                   not 700ms after the component is gone.
//   4. tab hidden — switching apps or browser tabs unmounts nothing and
//                   blurs nothing, and iOS freezes a hidden page, so a
//                   pending debounce can simply never fire.
//   5. page hide  — a hard refresh or a closed tab tears the document down
//                   WITHOUT running React cleanup, so 3 never happens. This
//                   is the one that loses a note across "wrote it, navigated
//                   away, came back and it wasn't there": measured in a real
//                   browser, typing and reloading 120ms later produced zero
//                   outgoing requests. See beaconGamePlan for why it's a raw
//                   keepalive PATCH and not a normal save.
export const GamePlan = forwardRef(function GamePlan({ userId, initialGamePlan, onSaved }, ref) {
  const [text, setText] = useState(initialGamePlan ?? "");
  // What's actually persisted, so "dirty" survives a save without waiting
  // for the parent to reload and hand down a fresh initialGamePlan.
  const savedRef = useRef(initialGamePlan ?? "");
  const textRef = useRef(initialGamePlan ?? "");
  textRef.current = text;
  // The last value we've either accepted from the parent or written
  // ourselves, and the value that write replaced — see the seeding effect.
  const seenRef = useRef(initialGamePlan ?? "");
  const supersededRef = useRef(null);
  const [height, setHeight] = useState(MIN_HEIGHT);
  // "idle" | "saving" | "saved" | "failed" — the quiet status line that
  // replaced the button, same idea as the builder header's save light.
  const [status, setStatus] = useState("idle");
  const timer = useRef(null);
  const mounted = useRef(true);
  // Everything below reads through refs, never the closed-over `text`: blur
  // and unmount handlers can be closures from an earlier render, and a stale
  // one would save the wrong thing.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      // Fire-and-forget: React cleanup can't await, but the request itself
      // outlives the component.
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flushes 4 and 5 from the header. Split because they need different
  // machinery: a hidden page is still alive, so an ordinary write works and
  // is preferred (it updates savedRef and the status line); a page being
  // unloaded can't await anything at all.
  useEffect(() => {
    if (Platform.OS !== "web") {
      // Native never tears the app down under us the way a browser does, so
      // backgrounding only needs the ordinary flush.
      const sub = AppState.addEventListener("change", (next) => {
        if (next !== "active") flush();
      });
      return () => sub.remove();
    }
    if (typeof document === "undefined" || typeof window === "undefined") return undefined;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onPageHide = () => {
      // Deliberately not `flush()`: an awaited supabase call is dead the
      // moment the document goes. A duplicate write of the same text is
      // possible when visibilitychange fired first and hasn't landed — that
      // is harmless, and losing the note is not.
      if (textRef.current === savedRef.current) return;
      beaconGamePlan(userIdRef.current, textRef.current);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Takes a NEW value from the parent while mounted. Without this the box is
  // seeded once and never again, which is what made autosave look broken: a
  // note typed in the floating bubble saved fine, but the Notes card on the
  // tab behind it was still showing the pre-edit text, and reopening the
  // bubble re-mounted it from the page's equally stale copy. The write had
  // landed; every surface was just still rendering the old text.
  //
  // Three guards, because a re-seed is a clobber if it's wrong:
  //   - nothing new from the parent (the usual render) does nothing;
  //   - a coach mid-edit is never overwritten, however new the value is;
  //   - a page reload that started BEFORE our last write returns the value
  //     that write replaced, so ignore exactly that one rather than walking
  //     the box backwards.
  useEffect(() => {
    const incoming = initialGamePlan ?? "";
    if (incoming === seenRef.current) return;
    if (incoming === supersededRef.current) return;
    seenRef.current = incoming;
    if (textRef.current !== savedRef.current) return;
    if (incoming === savedRef.current) return;
    savedRef.current = incoming;
    setText(incoming);
    setStatus("idle");
  }, [initialGamePlan]);

  // Returns "unchanged" | "saved" | "failed" — three outcomes, not a
  // boolean, because a caller closing on tap-away has to tell "nothing to
  // do" apart from "the write failed", or it closes over an unsaved note.
  const flush = async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const value = textRef.current;
    if (value === savedRef.current) return "unchanged";
    if (mounted.current) setStatus("saving");
    try {
      await updateGamePlan(userIdRef.current, value);
      supersededRef.current = savedRef.current;
      savedRef.current = value;
      // Our own write is not news when it comes back down as a prop.
      seenRef.current = value;
      onSavedRef.current?.(value);
      // Guarded because the most important flush of all is the one that runs
      // as this component is being torn down.
      if (mounted.current) setStatus(textRef.current === value ? "saved" : "idle");
      return "saved";
    } catch (err) {
      if (mounted.current) setStatus("failed");
      toastError("Failed to save notes", err);
      return "failed";
    }
  };

  // Auto-grow is NATIVE ONLY, and that is not a regression: measured in a
  // real 1280px viewport, react-native-web fires onContentSizeChange exactly
  // ONCE (the initial 98px) and never again as the text grows, so the web box
  // has always been a fixed-height textarea that scrolls. It just opens
  // taller now, since nothing is going to grow it.
  //
  // Don't "fix" this by feeding a measured height back into the style on web
  // without checking it in a real browser window: in a zero-width viewport
  // (which the sandboxed preview pane is) that same handler reports nonsense
  // and walks the box 659 → 642 → … → 516 until React throws "Maximum update
  // depth exceeded". That was an artifact of the harness, not production —
  // but it's a live trap for anyone testing this component in one.
  const handleChange = (next) => {
    setText(next);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  };

  useImperativeHandle(ref, () => ({ saveIfDirty: flush }));

  const statusLabel =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "failed" ? "Not saved — tap to retry" : "Saves as you type";
  const statusColor = status === "failed" ? "#b23a22" : status === "saved" ? "#4d6142" : "#a8a29e";
  // Only the failed state is pressable. Nothing is lost while it says that —
  // the text is still in the box, and blurring or editing retries too — but
  // an explicit retry beats asking a coach to guess what will trigger one.
  const statusLine = (
    <Text className="text-xs" style={{ fontFamily: fonts.sans, color: statusColor }}>
      {statusLabel}
    </Text>
  );

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={handleChange}
        onBlur={flush}
        onContentSizeChange={isWeb ? undefined : (e) => setHeight(Math.max(MIN_HEIGHT, e.nativeEvent.contentSize.height))}
        multiline
        inputAccessoryViewID={NUMERIC_DONE_ID}
        placeholder="Freeform notes, visible to the client…"
        className="mb-1 rounded border border-stone-300 px-3 py-2 text-sm"
        style={{ fontFamily: fonts.sans, textAlignVertical: "top", height: isWeb ? WEB_HEIGHT : height }}
      />
      {status === "failed" ? (
        <Pressable onPress={flush} hitSlop={6} className="self-start">
          {statusLine}
        </Pressable>
      ) : (
        statusLine
      )}
    </View>
  );
});
