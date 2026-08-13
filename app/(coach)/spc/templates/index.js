import { useCallback, useContext, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { Link, useRouter } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { listTemplates, createTemplate, deleteTemplate } from "../../../../lib/programming/templates";
import { CoachShell } from "../../../../components/CoachShell";
import { fonts, colors } from "../../../../lib/theme";
import { toastError } from "../../../../lib/toast";
import { confirmDeleteTemplate } from "../../../../lib/confirmDialog";
import { useKeyboardHeight, DONE_BAR_HEIGHT } from "../../../../lib/scrollToKeyboard";

const CATEGORY_LABELS = { away: "Away programming", trial: "Trial sessions" };

function NewTemplateForm({ onCreate }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("away");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), category });
      setName("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="mb-8 rounded-2xl border border-stone-200 p-5">
      <Text className="mb-3 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
        New template
      </Text>
      <View className="mb-3 flex-row gap-2">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setCategory(key)}
            className={`rounded-full border px-3.5 py-2.5 ${category === key ? "border-primary bg-primary" : "border-stone-300"}`}
          >
            <Text className={category === key ? "text-white" : "text-stone-700"} style={{ fontFamily: fonts.sans }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Away — Lower Body, Trial Session A"
        className="mb-3 rounded-lg border border-stone-300 px-4 py-3"
        style={{ fontFamily: fonts.sans }}
      />
      <Pressable
        onPress={handleCreate}
        disabled={saving || !name.trim()}
        className="self-start rounded-lg bg-primary px-4 py-2.5 disabled:opacity-50"
      >
        <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
          {saving ? "Creating…" : "+ Create template"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function TemplatesIndex() {
  const { profile } = useAuth();
  const router = useRouter();
  const [templates, setTemplates] = useState(null);
  const [loadError, setLoadError] = useState(null);

  // The New Template name field always sits near the top of this page, so
  // it's low-risk — this is just the cheap consistency/future-proofing
  // padding bump per lib/scrollToKeyboard.js's convention, not a fix for an
  // observed bug here.
  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const keyboardPadding = Math.max(0, occludedHeight - tabBarHeight);

  const load = useCallback(async () => {
    // Clear any previous failure first — without this a successful
    // Retry loaded the data but left the error screen up until the app
    // restarted, since the render branches on loadError alone.
    setLoadError(null);
    try {
      setTemplates(await listTemplates());
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async ({ name, category }) => {
    try {
      const created = await createTemplate({ name, category, createdBy: profile.id });
      router.push(`/(coach)/spc/templates/${created.id}`);
    } catch (err) {
      toastError("Failed to create template", err);
    }
  };

  const handleDelete = async (template) => {
    const proceed = await confirmDeleteTemplate(template.name);
    if (!proceed) return;
    try {
      await deleteTemplate(template.id);
      await load();
    } catch (err) {
      toastError("Failed to delete template", err);
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <><Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong: {loadError}
          </Text>
        <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
        </Pressable>
      </>
        </View>
      </CoachShell>
    );
  }

  if (!templates) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32 + keyboardPadding, maxWidth: 640 }}
      >
        <Link href="/(coach)/spc" style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite, marginBottom: 20 }}>
          ‹ Back to SPC
        </Link>
        <Text className="mb-1 text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: colors.primary }}>
          Templates
        </Text>
        <Text className="mb-6 text-stone-500" style={{ fontFamily: fonts.sans }}>
          Reusable workouts a coach can assign as a one-off to any client's profile — away programming for travel, or a
          trial session for a prospect.
        </Text>

        <NewTemplateForm onCreate={handleCreate} />

        {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
          const rows = templates.filter((t) => t.category === category);
          return (
            <View key={category} className="mb-6">
              <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}>
                {label}
              </Text>
              {rows.length === 0 ? (
                <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
                  None yet — create one with “+ New template” above.
                </Text>
              ) : (
                rows.map((t) => (
                  <View key={t.id} className="mb-2 flex-row items-center justify-between rounded-lg border border-stone-200 px-4 py-3">
                    <Pressable onPress={() => router.push(`/(coach)/spc/templates/${t.id}`)} className="flex-1">
                      <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700">
                        {t.name}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDelete(t)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel={`Delete template ${t.name}`}
                    >
                      <Text className="text-stone-400">✕</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          );
        })}
      </ScrollView>
    </CoachShell>
  );
}
