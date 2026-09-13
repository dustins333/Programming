import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  getTemplate,
  listTemplateWarmups,
  addTemplateWarmup,
  updateTemplateWarmup,
  removeTemplateWarmup,
  listTemplateExercises,
  addTemplateExercise,
  updateTemplateExercise,
  removeTemplateExercise,
  reorderTemplateExercises,
} from "../../../lib/programming/templates";
import { FlatSessionBuilder } from "../../../components/builder/FlatSessionBuilder";
import { fonts } from "../../../lib/theme";

// Template builder, coach web — design_handoff_coach_web_v2, screen 06. The
// builder itself is FlatSessionBuilder, shared with a client's one-off
// session (one-offs/[oneOffId].web.js), since the two are the same shape in
// different tables.
//
// A template is one flat prescription reused across clients, so things the
// group and SPC builders have don't apply: no draft/publish (a template isn't
// visible to any member directly), and no balance / last-week rails (there is
// no block to compare against).
export default function TemplateBuilderWeb() {
  const { templateId } = useLocalSearchParams();
  const router = useRouter();
  const [template, setTemplate] = useState(null);

  useEffect(() => {
    getTemplate(templateId)
      .then(setTemplate)
      .catch(() => setTemplate(null));
  }, [templateId]);

  const api = {
    load: async () => {
      const [warmups, exercises] = await Promise.all([listTemplateWarmups(templateId), listTemplateExercises(templateId)]);
      return { warmups, exercises };
    },
    addWarmup: ({ exerciseId, position }) => addTemplateWarmup({ templateId, exerciseId, position }),
    updateWarmup: updateTemplateWarmup,
    removeWarmup: removeTemplateWarmup,
    addExercise: ({ exerciseId, position, sets, reps }) => addTemplateExercise({ templateId, exerciseId, position, sets, reps }),
    updateExercise: updateTemplateExercise,
    removeExercise: removeTemplateExercise,
    reorderExercises: reorderTemplateExercises,
  };

  return (
    <FlatSessionBuilder
      loadKey={templateId}
      api={api}
      lastLiftNoun="template"
      note="A template is written once and copied onto a client when you assign it. Editing it here doesn't change any one-off already assigned from it."
      onBack={() => (router.canGoBack() ? router.back() : router.push("/(coach)/templates"))}
      previewTitle={template?.name ?? "Template"}
      previewSubtitle="Exactly what the client sees once this is assigned"
      header={() => (
        <View style={{ minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
            Template · {template?.template_categories?.name ?? "Uncategorised"}
          </Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 22, color: "#2a211c" }}>{template?.name ?? ""}</Text>
        </View>
      )}
    />
  );
}
