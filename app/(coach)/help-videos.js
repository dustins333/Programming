import { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Redirect, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import {
  listHelpVideos,
  createHelpVideo,
  updateHelpVideo,
  deleteHelpVideo,
  reorderHelpVideos,
  pickHelpVideo,
  uploadHelpVideo,
  helpVideoUrl,
  UNIVERSAL_MIME,
} from "../../lib/media/helpVideos";
import { HelpVideoPlayer } from "../../components/HelpVideoPlayer";
import { SortableList } from "../../components/SortableList";
import { CoachShell } from "../../components/CoachShell";
import { PressFade } from "../../components/PressFade";
import { confirmDelete } from "../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../lib/toast";
import { fonts, colors } from "../../lib/theme";

const CANVAS = "#faf8f6";

// Admin-only. What members see at /(member)/how-to, in the order set
// here. Admin rather than a can_view_* module toggle, matching announcements
// and events: this is gym-wide published content, not a coaching module.
export default function HelpVideosAdmin() {
  const { profile } = useAuth();
  const [videos, setVideos] = useState(null);
  const [loadError, setLoadError] = useState(null);

  // New-video form. The file uploads on pick (same as GraphicPicker) so a
  // slow upload never stalls Save; `pending` holds the uploaded path until
  // the row is created.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  if (profile && profile.role !== "admin") {
    return <Redirect href="/(coach)" />;
  }

  const handlePick = async () => {
    setUploading(true);
    try {
      const picked = await pickHelpVideo();
      // null = cancelled, or media-library permission denied.
      if (!picked) return;
      const path = await uploadHelpVideo(picked);
      setPending({ path, mimeType: picked.mimeType, fileName: picked.fileName });
    } catch (err) {
      toastError("Couldn't upload that video", err);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !pending) return;
    setSaving(true);
    try {
      await createHelpVideo({
        title: title.trim(),
        description: description.trim(),
        storagePath: pending.path,
        mimeType: pending.mimeType,
        createdBy: profile?.id,
        // Appended to the end — reorder with the arrows/handles below.
        position: (videos?.length || 0) + 1,
      });
      setTitle("");
      setDescription("");
      setPending(null);
      await load();
      toastSuccess("Video added");
    } catch (err) {
      toastError("Couldn't save that video", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (video) => {
    if (!(await confirmDelete(`"${video.title}" will no longer show to members. This can't be undone.`, "Delete this video?"))) {
      return;
    }
    try {
      await deleteHelpVideo(video);
      await load();
      toastSuccess("Video deleted");
    } catch (err) {
      toastError("Couldn't delete that video", err);
    }
  };

  // Optimistic: the list re-renders in the new order immediately and the
  // writes follow, so a drag doesn't visibly snap back while N updates land.
  const handleReorder = async (next) => {
    setVideos(next);
    try {
      await reorderHelpVideos(next.map((v) => v.id));
    } catch (err) {
      toastError("Couldn't save the new order", err);
      await load();
    }
  };

  const handleRename = async (video, value) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === video.title) return;
    try {
      await updateHelpVideo(video.id, { title: trimmed });
      await load();
    } catch (err) {
      toastError("Couldn't rename that video", err);
    }
  };

  const notMp4 = pending && pending.mimeType !== UNIVERSAL_MIME;

  return (
    <CoachShell>
      <ScrollView className="flex-1" style={{ backgroundColor: CANVAS }} contentContainerStyle={{ padding: 24, paddingBottom: 60 }}>
        <View style={{ maxWidth: 720, width: "100%" }}>
          <Text className="mb-1" style={{ fontFamily: fonts.display, fontSize: 28, color: colors.primaryOnWhite }}>
            Help videos
          </Text>
          <Text className="mb-6 text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
            Members see these under Settings → Help → How-to videos, in this order.
          </Text>

          {/* ---------------- Add ---------------- */}
          <View
            className="mb-8 p-5"
            style={{ borderRadius: 16, borderWidth: 1, borderColor: "#f0ddd2", backgroundColor: "#fdf6f2" }}
          >
            <Text className="mb-3" style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#44403c" }}>
              Add a video
            </Text>

            <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
              Title
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="How to log a workout"
              placeholderTextColor="#c9c4bd"
              className="mb-3 bg-white px-3 py-2.5"
              style={{ borderRadius: 10, borderWidth: 1, borderColor: "#e7e5e4", fontFamily: fonts.sans, fontSize: 14 }}
            />

            <Text className="mb-1 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
              Description (optional)
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="A one-line summary of what this covers"
              placeholderTextColor="#c9c4bd"
              multiline
              className="mb-3 bg-white px-3 py-2.5"
              style={{ borderRadius: 10, borderWidth: 1, borderColor: "#e7e5e4", fontFamily: fonts.sans, fontSize: 14, minHeight: 60 }}
            />

            {pending ? (
              <View className="mb-3">
                <View className="mb-2 flex-row items-center gap-2">
                  <Ionicons name="checkmark-circle" size={18} color="#4d6142" />
                  <Text className="flex-1 text-sm" style={{ fontFamily: fonts.sansMedium, color: "#4d6142" }}>
                    {pending.fileName || "Video uploaded"}
                  </Text>
                  <PressFade onPress={() => setPending(null)} hitSlop={8} accessibilityLabel="Remove uploaded video">
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#b23a22" }}>Remove</Text>
                  </PressFade>
                </View>
                {notMp4 ? (
                  <Text className="mb-2 text-xs" style={{ fontFamily: fonts.sans, color: "#b23a22" }}>
                    That isn't an MP4. It'll play on iPhone, but some browsers and Android phones can't play .mov —
                    exporting as MP4 is safer.
                  </Text>
                ) : null}
                <HelpVideoPlayer url={helpVideoUrl(pending.path)} title={title || "Preview"} />
              </View>
            ) : (
              <PressFade onPress={handlePick} disabled={uploading}>
                <View
                  className="mb-3 items-center justify-center py-6"
                  style={{ borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#e0b6a5", backgroundColor: "white", opacity: uploading ? 0.5 : 1 }}
                >
                  {uploading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={26} color={colors.primary} />
                      <Text className="mt-1.5 text-sm" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
                        Choose a video file
                      </Text>
                      <Text className="mt-0.5 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                        MP4 up to 60MB
                      </Text>
                    </>
                  )}
                </View>
              </PressFade>
            )}

            <Pressable
              onPress={handleSave}
              disabled={saving || !title.trim() || !pending}
              className="self-start px-5 py-2.5"
              style={{ borderRadius: 10, backgroundColor: colors.primary, opacity: saving || !title.trim() || !pending ? 0.5 : 1 }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {saving ? "Saving…" : "Add video"}
              </Text>
            </Pressable>
            {!pending || !title.trim() ? (
              <Text className="mt-2 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                Needs a title and a video file.
              </Text>
            ) : null}
          </View>

          {/* ---------------- Existing ---------------- */}
          <Text className="mb-3" style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#44403c" }}>
            Live for members
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
            <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
              Nothing here yet. The first video you add shows up for every member.
            </Text>
          ) : (
            <SortableList
              items={videos}
              onReorder={handleReorder}
              renderItem={(video, controls) => (
                <View
                  className="mb-3 p-4"
                  style={{ borderRadius: 16, borderWidth: 1, borderColor: "#ece7e1", backgroundColor: "white" }}
                >
                  <View className="flex-row items-start gap-2">
                    {controls}
                    <View className="flex-1">
                      <TextInput
                        defaultValue={video.title}
                        onBlur={(e) => handleRename(video, e.nativeEvent.text)}
                        className="px-2 py-1"
                        style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#44403c", borderRadius: 8, borderWidth: 1, borderColor: "#f1efed" }}
                      />
                      {video.description ? (
                        <Text className="mt-1 px-2 text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
                          {video.description}
                        </Text>
                      ) : null}
                    </View>
                    <PressFade onPress={() => handleDelete(video)} hitSlop={8} accessibilityLabel={`Delete ${video.title}`}>
                      <Ionicons name="trash-outline" size={18} color="#b23a22" />
                    </PressFade>
                  </View>
                  <View className="mt-3">
                    <HelpVideoPlayer url={helpVideoUrl(video.storage_path)} title={video.title} />
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </ScrollView>
    </CoachShell>
  );
}
