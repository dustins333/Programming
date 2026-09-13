import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { getUser } from "../../../lib/programming/clients";
import {
  getOneOff,
  updateOneOff,
  listOneOffWarmups,
  addOneOffWarmup,
  updateOneOffWarmup,
  removeOneOffWarmup,
  listOneOffExercises,
  addOneOffExercise,
  updateOneOffExercise,
  removeOneOffExercise,
  reorderOneOffExercises,
  saveOneOffAsTemplate,
} from "../../../lib/programming/oneOffWorkouts";
import { FlatSessionBuilder } from "../../../components/builder/FlatSessionBuilder";
import { PressFade } from "../../../components/PressFade";
import { fonts, colors } from "../../../lib/theme";
import { toastError, toastSuccess } from "../../../lib/toast";

// Building a one-off session for one client, from the SPC client page's
// "+ Add a session" -> Build a new session. Same builder as a template
// (FlatSessionBuilder), pointed at the one_off tables.
//
// A new one is a DRAFT until "Send to {name}" (createBlankOneOff's note), so
// she never sees a half-built session on her My Week. Everything autosaves;
// the button only publishes.
//
// "Also save as a template" is carried in from the add window as a param and
// can still be changed here. The copy happens on the way out (Send, Done or
// the back arrow), once there is something in the session to copy, and only
// once: a template made from an empty session is worse than none.
export default function OneOffBuilderWeb() {
  const { oneOffId, saveTemplate } = useLocalSearchParams();
  const router = useRouter();
  const { profile } = useAuth();

  const [oneOff, setOneOff] = useState(null);
  const [client, setClient] = useState(null);
  const [title, setTitle] = useState("");
  const [asTemplate, setAsTemplate] = useState(saveTemplate === "1");
  const [finishing, setFinishing] = useState(false);
  const templateSaved = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getOneOff(oneOffId)
      .then(async (row) => {
        if (cancelled) return;
        setOneOff(row);
        setTitle(row.title ?? "");
        const member = await getUser(row.user_id).catch(() => null);
        if (!cancelled) setClient(member);
      })
      .catch((err) => toastError("Couldn't load this session", err));
    return () => {
      cancelled = true;
    };
  }, [oneOffId]);

  const first = (client?.name ?? "").trim().split(/\s+/)[0] || "her";
  const isDraft = oneOff?.status !== "published";

  const saveTitle = async () => {
    const next = title.trim();
    if (!oneOff || !next || next === oneOff.title) return;
    try {
      await updateOneOff(oneOff.id, { title: next });
      setOneOff((o) => ({ ...o, title: next }));
    } catch (err) {
      toastError("Couldn't rename it", err);
    }
  };

  const leave = () => {
    if (router.canGoBack()) router.back();
    else if (oneOff) router.push(`/(coach)/spc/${oneOff.user_id}`);
    else router.push("/(coach)/spc");
  };

  const finish = async (state, { send }) => {
    if (!oneOff || finishing) return;
    if (send && state.exercises.length === 0) {
      toastError("Nothing to send yet", "Add at least one exercise first.");
      return;
    }
    setFinishing(true);
    try {
      await saveTitle();
      if (asTemplate && !templateSaved.current && state.exercises.length > 0) {
        await saveOneOffAsTemplate({
          oneOffWorkoutId: oneOff.id,
          name: title.trim() || oneOff.title,
          createdBy: profile?.id,
        });
        templateSaved.current = true;
        toastSuccess("Saved as a template too.");
      }
      if (send) {
        await updateOneOff(oneOff.id, { status: "published" });
        toastSuccess(`Sent. ${first} sees it now.`);
      }
      leave();
    } catch (err) {
      toastError(send ? "Couldn't send it" : "Couldn't finish up", err);
    } finally {
      setFinishing(false);
    }
  };

  const api = {
    load: async () => {
      const [warmups, exercises] = await Promise.all([listOneOffWarmups(oneOffId), listOneOffExercises(oneOffId)]);
      return { warmups, exercises };
    },
    addWarmup: ({ exerciseId, position }) => addOneOffWarmup({ oneOffWorkoutId: oneOffId, exerciseId, position }),
    updateWarmup: updateOneOffWarmup,
    removeWarmup: removeOneOffWarmup,
    addExercise: ({ exerciseId, position, sets, reps }) =>
      addOneOffExercise({ oneOffWorkoutId: oneOffId, exerciseId, position, sets, reps }),
    updateExercise: updateOneOffExercise,
    removeExercise: removeOneOffExercise,
    reorderExercises: reorderOneOffExercises,
  };

  return (
    <FlatSessionBuilder
      loadKey={oneOffId}
      api={api}
      lastLiftNoun="session"
      note={
        isDraft
          ? `${first === "her" ? "She" : first} can't see this until you send it. Everything saves as you go.`
          : `${first === "her" ? "She" : first} already has this session, so changes show up for her right away.`
      }
      onBack={(state) => finish(state, { send: false })}
      previewTitle={title || "One-off session"}
      previewSubtitle={`What ${first} sees`}
      header={() => (
        <View style={{ minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
            One-off session{client?.name ? ` · ${client.name}` : ""}
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onBlur={saveTitle}
            placeholder="Name this session"
            placeholderTextColor="#c9c4bd"
            style={{ fontFamily: fonts.display, fontSize: 22, color: "#2a211c", minWidth: 240, outlineStyle: "none" }}
          />
        </View>
      )}
      headerActions={(state) => (
        <>
          <PressFade
            onPress={() => setAsTemplate((v) => !v)}
            disabled={templateSaved.current}
            style={{ flexDirection: "row", alignItems: "center", gap: 7, opacity: templateSaved.current ? 0.5 : 1 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: asTemplate }}
          >
            <Ionicons name={asTemplate ? "checkbox" : "square-outline"} size={19} color={asTemplate ? colors.primary : "#a8a29e"} />
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>Also save as a template</Text>
          </PressFade>
          <PressFade
            onPress={() => finish(state, { send: isDraft })}
            disabled={finishing}
            style={{
              backgroundColor: isDraft ? "#33251f" : "#4d6142",
              borderRadius: 9,
              paddingVertical: 9,
              paddingHorizontal: 16,
              opacity: finishing ? 0.5 : 1,
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>
              {finishing ? "Saving…" : isDraft ? `Send to ${first}` : "Done"}
            </Text>
          </PressFade>
        </>
      )}
    />
  );
}
