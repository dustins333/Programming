import { useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "./PressFade";
import { GraphicImage } from "./GraphicImage";
import { pickGraphic, uploadGraphic } from "../lib/media/graphics";
import { toastError } from "../lib/toast";
import { fonts, colors } from "../lib/theme";

// Coach-side "attach a graphic" control, shared by the announcement compose
// form and the event composer. `value` is a storage path (or null),
// `onChange` receives the new path (or null when cleared).
//
// Library only, no camera option: this is for a Canva export sitting in
// Photos or on disk, and on web launchImageLibraryAsync is just a file
// dialog anyway.
//
// The upload happens on pick rather than on save, so a slow upload never
// stalls the Send button. That means abandoning a compose can leave an
// unreferenced object in the bucket — deliberately not cleaned up: paths are
// unique so an orphan can't collide with anything, and chasing them risks
// deleting a file a saved row still points at.
export function GraphicPicker({
  value,
  onChange,
  folder = "announcements",
  label = "Graphic",
  hint = "Optional. A square or 4:5 export looks best.",
}) {
  const [busy, setBusy] = useState(false);

  const handlePick = async () => {
    setBusy(true);
    try {
      const picked = await pickGraphic();
      // null = cancelled, or photo-library permission denied.
      if (!picked) return;
      const path = await uploadGraphic({ ...picked, folder });
      onChange(path);
    } catch (err) {
      toastError("Couldn't add that image", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>

      {value ? (
        <View style={{ maxWidth: 260 }}>
          <GraphicImage path={value} maxHeight={200} />
          <View className="mt-2 flex-row items-center gap-4">
            <PressFade onPress={handlePick} disabled={busy} style={{ opacity: busy ? 0.5 : 1 }}>
              <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>
                {busy ? "Uploading…" : "Replace"}
              </Text>
            </PressFade>
            <PressFade onPress={() => onChange(null)} disabled={busy} style={{ opacity: busy ? 0.5 : 1 }}>
              <Text style={{ fontFamily: fonts.sansMedium, color: "#78716c", fontSize: 13 }}>Remove</Text>
            </PressFade>
          </View>
        </View>
      ) : (
        <PressFade
          onPress={handlePick}
          disabled={busy}
          style={{
            opacity: busy ? 0.5 : 1,
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: "#d6d3d1",
            borderRadius: 10,
            paddingVertical: 12,
            paddingHorizontal: 16,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="image-outline" size={18} color={colors.primary} />
          )}
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, fontSize: 13 }}>
            {busy ? "Uploading…" : "Add a graphic"}
          </Text>
        </PressFade>
      )}

      {hint ? (
        <Text className="mt-1.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
