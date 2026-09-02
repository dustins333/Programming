import { useCallback, useContext, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { listTemplates, createTemplate, deleteTemplate, setTemplateCategory } from "../../../lib/programming/templates";
import {
  listTemplateCategories,
  createTemplateCategory,
  renameTemplateCategory,
  deleteTemplateCategory,
} from "../../../lib/programming/templateCategories";
import { CoachShell } from "../../../components/CoachShell";
import { TemplateCategoryManager } from "../../../components/coach/TemplateCategoryManager";
import { OptionPicker } from "../../../components/nutrition/OptionPicker";
import { fonts, colors } from "../../../lib/theme";
import { toastError } from "../../../lib/toast";
import { confirmDeleteTemplate } from "../../../lib/confirmDialog";
import { useKeyboardHeight, DONE_BAR_HEIGHT } from "../../../lib/scrollToKeyboard";

const UNCATEGORISED = "__none__";

function NewTemplateForm({ categories, onCreate }) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? null);
  const [saving, setSaving] = useState(false);

  // A category deleted while this form is open would otherwise leave a
  // stale id selected and file the new template nowhere silently.
  const selected = categories.some((c) => c.id === categoryId) ? categoryId : (categories[0]?.id ?? null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate({ name: name.trim(), categoryId: selected });
      setName("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="mb-8 rounded-2xl border border-stone-200 p-5">
      <Text
        className="mb-3 text-xs uppercase text-stone-400"
        style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}
      >
        New template
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Hotel Full Body A"
        className="mb-3 rounded-lg border border-stone-300 px-4 py-3"
        style={{ fontFamily: fonts.sans }}
      />
      {categories.length > 0 ? (
        <View className="mb-3">
          <Text
            className="mb-1.5 text-xs uppercase text-stone-400"
            style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}
          >
            Category
          </Text>
          <OptionPicker
            value={selected}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            onChange={setCategoryId}
          />
        </View>
      ) : null}
      <Pressable
        onPress={handleCreate}
        disabled={saving || !name.trim()}
        style={{ opacity: saving || !name.trim() ? 0.5 : 1 }}
        className="self-start rounded-lg bg-primary px-4 py-2.5"
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
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [managing, setManaging] = useState(false);

  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const occludedHeight = keyboardHeight > 0 ? keyboardHeight + DONE_BAR_HEIGHT : 0;
  const keyboardPadding = Math.max(0, occludedHeight - tabBarHeight);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [templateRows, categoryRows] = await Promise.all([listTemplates(), listTemplateCategories()]);
      setTemplates(templateRows);
      setCategories(categoryRows);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    }
  }, []);

  // A Tabs child stays mounted across tab switches, so a mount-only effect
  // would leave a coach looking at a stale library after adding a template
  // from somewhere else.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Counts feed the category manager, so deleting a label can say how many
  // templates it holds rather than leaving a coach to guess.
  const counts = useMemo(() => {
    const out = {};
    for (const t of templates ?? []) {
      if (t.category_id) out[t.category_id] = (out[t.category_id] ?? 0) + 1;
    }
    return out;
  }, [templates]);

  // Every category is drawn even when empty, so a coach can see where a new
  // template would land. Uncategorised only appears when something is
  // actually in it (which happens when a category is deleted).
  const groups = useMemo(() => {
    const rows = templates ?? [];
    const out = categories.map((category) => ({
      key: category.id,
      label: category.name,
      rows: rows.filter((t) => t.category_id === category.id),
    }));
    const orphans = rows.filter((t) => !t.category_id);
    if (orphans.length) out.push({ key: UNCATEGORISED, label: "Uncategorised", rows: orphans });
    return out;
  }, [templates, categories]);

  const handleCreate = async ({ name, categoryId }) => {
    try {
      const created = await createTemplate({ name, categoryId, createdBy: profile.id });
      router.push(`/(coach)/templates/${created.id}`);
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

  const handleRefile = async (template, categoryId) => {
    try {
      await setTemplateCategory(template.id, categoryId === UNCATEGORISED ? null : categoryId);
      await load();
    } catch (err) {
      toastError("Couldn't move that template", err);
    }
  };

  if (loadError) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white px-6">
          <Text className="text-center text-red-600" style={{ fontFamily: fonts.sans }}>
            Something went wrong: {loadError}
          </Text>
          <Pressable onPress={load} style={{ marginTop: 12, alignSelf: "center" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </Pressable>
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
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 32,
          paddingBottom: 32 + keyboardPadding,
          maxWidth: 640,
        }}
      >
        <Text className="mb-1 text-2xl" style={{ fontFamily: "ProtestStrike_400Regular", color: colors.primary }}>
          Templates
        </Text>
        <Text className="mb-4 text-stone-500" style={{ fontFamily: fonts.sans }}>
          Reusable workouts you can assign to any client, either as a single session or across a run of weeks. Assign
          them from a client's own page under Alternate programming.
        </Text>
        <Pressable onPress={() => setManaging(true)} hitSlop={8} style={{ alignSelf: "flex-start", marginBottom: 20 }}>
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>Manage categories</Text>
        </Pressable>

        <NewTemplateForm categories={categories} onCreate={handleCreate} />

        {groups.map((group) => (
          <View key={group.key} className="mb-6">
            <Text
              className="mb-2 text-xs uppercase text-stone-400"
              style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.4 }}
            >
              {group.label}
            </Text>
            {group.rows.length === 0 ? (
              <Text className="text-stone-400" style={{ fontFamily: fonts.sans }}>
                Nothing filed here yet.
              </Text>
            ) : (
              group.rows.map((t) => (
                <View
                  key={t.id}
                  className="mb-2 flex-row items-center justify-between rounded-lg border border-stone-200 px-4 py-3"
                >
                  <Pressable
                    onPress={() => router.push(`/(coach)/templates/${t.id}`)}
                    className="flex-1"
                    style={{ minWidth: 0 }}
                  >
                    <Text style={{ fontFamily: fonts.sansSemiBold }} className="text-stone-700" numberOfLines={1}>
                      {t.name}
                    </Text>
                  </Pressable>
                  {categories.length > 1 ? (
                    <View style={{ width: 150, marginRight: 8 }}>
                      <OptionPicker
                        value={t.category_id ?? UNCATEGORISED}
                        options={[
                          ...categories.map((c) => ({ value: c.id, label: c.name })),
                          ...(t.category_id ? [] : [{ value: UNCATEGORISED, label: "Uncategorised" }]),
                        ]}
                        onChange={(value) => handleRefile(t, value)}
                      />
                    </View>
                  ) : null}
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
        ))}
      </ScrollView>

      <TemplateCategoryManager
        visible={managing}
        categories={categories}
        counts={counts}
        onClose={() => setManaging(false)}
        onChanged={load}
        api={{ createTemplateCategory, renameTemplateCategory, deleteTemplateCategory }}
      />
    </CoachShell>
  );
}
