import { useState } from "react";
import { Pressable } from "react-native";

// Use this instead of `<Pressable style={({ pressed }) => ...}>`.
//
// NativeWind v4's cssInterop drops a Pressable's `style` prop **entirely**
// on native whenever it's passed as a function. Confirmed on a real
// simulator build with a four-way A/B: a plain object style renders; the
// function form renders completely unstyled — with or without a `className`
// alongside it, and whether the function returns an object or an array. On
// react-native-web it works fine either way, which is exactly why this
// survived several "bundle-checked, no errors" passes and only showed up on
// a device (a cream button vanished into a dark hero, session stripes
// collapsed to their caption width, selected day chips turned into white
// text on nothing).
//
// The function form is the only way RN exposes the `pressed` state, so this
// tracks it with onPressIn/onPressOut instead and always hands Pressable a
// plain object. `style` here is a plain style object, never a function.
export function PressFade({ style, pressedOpacity = 0.6, children, onPressIn, onPressOut, ...rest }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={{ ...style, opacity: pressed ? pressedOpacity : style?.opacity ?? 1 }}
    >
      {children}
    </Pressable>
  );
}
