import { useCallback, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { listHelpVideos, helpVideoUrl } from "../../lib/media/helpVideos";
import { HelpVideoPlayer } from "../../components/HelpVideoPlayer";
import { fonts, colors } from "../../lib/theme";

const CANVAS = "#faf8f6";

// Short screen recordings — how to log a session, how to match TrueCoach
// history. Reached from the Help card in member Settings, not its own tab
// (same hidden-route pattern as settings.js and messages.js).
//
// Admins add and remove these on /(coach)/help-videos (a deliberately
// different URL — route groups are stripped on web, so two files both named
// help-videos would both claim /help-videos and a refresh could land on the
// wrong one, the way /settings already is ambiguous).
export default function HelpVideos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [videos, setVideos] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      setVideos(await listHelpVideos());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: CANVAS }}
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 12, paddingBottom: 40, maxWidth: 640, width: "100%", alignSelf: "center" }}
    >
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.push("/(member)/settings"))}
        className="mb-3 self-start"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>‹ Settings</Text>
      </Pressable>

      <Text className="mb-1" style={{ fontFamily: fonts.display, fontSize: 26, color: colors.primaryOnWhite }}>
        How-to videos
      </Text>
      <Text className="mb-5 text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
        Short walkthroughs of the app.
      </Text>

      {loadError ? (
        <View className="p-4" style={{ borderRadius: 16, borderWidth: 1, borderColor: "#f5c9b8", backgroundColor: "#fdece5" }}>
          <Text className="mb-3 text-sm" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
            Couldn't load the videos. {loadError}
          </Text>
          <Pressable onPress={load} className="self-start rounded-lg px-4 py-2" style={{ backgroundColor: "#b23a22" }}>
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : videos === null ? (
        <ActivityIndicator color={colors.primary} />
      ) : videos.length === 0 ? (
        <View className="p-5" style={{ borderRadius: 16, borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white" }}>
          <Text className="text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
            No videos yet. Check back soon — we're adding walkthroughs here.
          </Text>
        </View>
      ) : (
        videos.map((video) => (
          <View
            key={video.id}
            className="mb-4 p-4"
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "#ece7e1",
              backgroundColor: "white",
              shadowColor: "#44403c",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.05,
              shadowRadius: 10,
              elevation: 1,
            }}
          >
            <Text className="text-base" style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
              {video.title}
            </Text>
            {video.description ? (
              <Text className="mt-1 text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
                {video.description}
              </Text>
            ) : null}
            <View className="mt-3">
              <HelpVideoPlayer url={helpVideoUrl(video.storage_path)} title={video.title} />
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}
