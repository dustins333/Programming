import { View, Text, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import { fonts, colors } from "../lib/theme";
import { toastError } from "../lib/toast";

// Native half of the how-to video player.
//
// There is no video library in this project — expo-video/expo-av are not
// dependencies, and adding one means a native module, a pod install and a
// fresh TestFlight build before anybody could watch anything. So native hands
// the public URL to the OS instead: iOS and Android both play an MP4 straight
// in the browser, full screen, with their own controls.
//
// It leaves the app, which is why the button says so rather than pretending
// to be an inline player. Swap this file for a real <VideoView> if expo-video
// is ever added; HelpVideoPlayer.web.js needs no change either way.
export function HelpVideoPlayer({ url, title }) {
  if (!url) return null;

  const open = async () => {
    try {
      await Linking.openURL(url);
    } catch (err) {
      toastError("Couldn't open that video", err);
    }
  };

  return (
    <PressFade onPress={open} accessibilityLabel={`Play ${title || "how-to video"}`}>
      <View
        className="flex-row items-center gap-3 px-4 py-3.5"
        style={{ borderRadius: 12, backgroundColor: "#2a1f1b" }}
      >
        <Ionicons name="play-circle" size={30} color="#ffffff" />
        <View className="flex-1">
          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#ffffff", fontSize: 14 }}>Play video</Text>
          <Text style={{ fontFamily: fonts.sans, color: "#d8cfc9", fontSize: 12, marginTop: 1 }}>
            Opens in your browser
          </Text>
        </View>
        <Ionicons name="open-outline" size={16} color={colors.primary} />
      </View>
    </PressFade>
  );
}
