import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Modal, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../../PressFade";
import { listTemplates } from "../../../lib/programming/templates";
import { fonts, colors } from "../../../lib/theme";

// "+ Add a session" on the SPC client page. Two ways to make a one-off:
//   Use a template  — pick one, it is copied onto her and sent (published)
//                     straight away, same as assigning one anywhere else.
//   Build new       — name it, then the full builder opens on a DRAFT. Desktop
//                     only (allowBuild), same call as every other builder.
//
// A one-off does not count toward her SPC week and has no date: it is open on
// her My Week until she finishes it (Terra's calls, 2026-09-13).
//
// Centered card, the coach-desktop dialog convention, at both widths.
export function AddOneOffModal({ visible, clientFirst, allowBuild, onClose, onUseTemplate, onBuildNew }) {
  const [step, setStep] = useState("choose"); // choose | template | build
  const [templates, setTemplates] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [asTemplate, setAsTemplate] = useState(false);
  const [busy, setBusy] = useState(null); // template id | "build"

  useEffect(() => {
    if (!visible) return;
    setStep(allowBuild ? "choose" : "template");
    setSearch("");
    setName("");
    setAsTemplate(false);
    setBusy(null);
  }, [visible, allowBuild]);

  useEffect(() => {
    if (!visible || step !== "template" || templates) return;
    setLoadError(null);
    listTemplates()
      .then(setTemplates)
      .catch((err) => setLoadError(err.message ?? String(err)));
  }, [visible, step, templates]);

  // Grouped by category, in category order, so a trial session and an away
  // day read as the different things they are.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byCat = new Map();
    for (const t of templates ?? []) {
      if (q && !t.name.toLowerCase().includes(q)) continue;
      const cat = t.template_categories;
      const key = cat?.id ?? "none";
      if (!byCat.has(key)) byCat.set(key, { name: cat?.name ?? "Uncategorized", position: cat?.position ?? 9999, items: [] });
      byCat.get(key).items.push(t);
    }
    return [...byCat.values()].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }, [templates, search]);

  const pickTemplate = async (template) => {
    if (busy) return;
    setBusy(template.id);
    try {
      await onUseTemplate(template);
    } finally {
      setBusy(null);
    }
  };

  const build = async () => {
    if (busy || !name.trim()) return;
    setBusy("build");
    try {
      await onBuildNew({ title: name.trim(), saveAsTemplate: asTemplate });
    } finally {
      setBusy(null);
    }
  };

  const title =
    step === "template" ? "Use a template" : step === "build" ? "Build a new session" : `Add a session for ${clientFirst}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.35)", alignItems: "center", justifyContent: "center", padding: 18 }}>
        <View style={{ width: "100%", maxWidth: 480, maxHeight: "86%", backgroundColor: "#fff", borderRadius: 16, overflow: "hidden" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 }}>
            {step !== "choose" && allowBuild ? (
              <PressFade onPress={() => setStep("choose")} hitSlop={8} accessibilityLabel="Back">
                <Ionicons name="chevron-back" size={20} color="#78716c" />
              </PressFade>
            ) : null}
            <Text style={{ flex: 1, fontFamily: fonts.sansBold, fontSize: 17, color: "#2a211c" }}>{title}</Text>
            <PressFade onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={21} color="#a8a29e" />
            </PressFade>
          </View>

          {step === "choose" ? (
            <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 10 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginBottom: 2 }}>
                A one-off sits on her week until she does it. It doesn't count toward her SPC sessions.
              </Text>
              <ChoiceCard
                icon="copy-outline"
                label="Use a template"
                sub="Pick a ready-made session. She sees it right away."
                onPress={() => setStep("template")}
              />
              <ChoiceCard
                icon="construct-outline"
                label="Build a new session"
                sub="Opens the builder. She sees it once you send it."
                onPress={() => setStep("build")}
              />
            </View>
          ) : null}

          {step === "template" ? (
            <View style={{ flexShrink: 1 }}>
              <View style={{ paddingHorizontal: 20 }}>
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search templates"
                  placeholderTextColor={colors.hint}
                  style={{
                    borderWidth: 1,
                    borderColor: "#e2ddd6",
                    borderRadius: 10,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    fontFamily: fonts.sans,
                    fontSize: 14,
                    color: "#2a211c",
                  }}
                />
              </View>
              <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 20, paddingTop: 12 }}>
                {loadError ? (
                  <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22" }}>Couldn't load templates: {loadError}</Text>
                ) : !templates ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
                ) : groups.length === 0 ? (
                  <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c" }}>
                    {templates.length === 0 ? "No templates yet." : "No templates match."}
                  </Text>
                ) : (
                  groups.map((g) => (
                    <View key={g.name} style={{ marginBottom: 14 }}>
                      <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.1, color: "#a8a29e", marginBottom: 6 }}>
                        {g.name.toUpperCase()}
                      </Text>
                      {g.items.map((t) => (
                        <PressFade
                          key={t.id}
                          onPress={() => pickTemplate(t)}
                          disabled={Boolean(busy)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            borderWidth: 1,
                            borderColor: "#ece7e1",
                            borderRadius: 10,
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            marginBottom: 6,
                            opacity: busy && busy !== t.id ? 0.5 : 1,
                          }}
                        >
                          <Text style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 14, color: "#2a211c" }} numberOfLines={1}>
                            {t.name}
                          </Text>
                          {busy === t.id ? (
                            <ActivityIndicator color={colors.primary} size="small" />
                          ) : (
                            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: colors.primaryOnWhite }}>Assign</Text>
                          )}
                        </PressFade>
                      ))}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          ) : null}

          {step === "build" ? (
            <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginBottom: 6 }}>Session name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                onSubmitEditing={build}
                autoFocus
                placeholder="e.g. Trial session, Hotel gym day"
                placeholderTextColor={colors.hint}
                style={{
                  borderWidth: 1,
                  borderColor: "#e2ddd6",
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  fontFamily: fonts.sans,
                  fontSize: 14,
                  color: "#2a211c",
                }}
              />
              <PressFade
                onPress={() => setAsTemplate((v) => !v)}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: asTemplate }}
              >
                <Ionicons name={asTemplate ? "checkbox" : "square-outline"} size={20} color={asTemplate ? colors.primary : "#a8a29e"} />
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: "#44403c" }}>Also save as a template</Text>
              </PressFade>
              <PressFade
                onPress={build}
                disabled={!name.trim() || Boolean(busy)}
                style={{
                  backgroundColor: "#33251f",
                  borderRadius: 11,
                  paddingVertical: 13,
                  alignItems: "center",
                  marginTop: 18,
                  opacity: !name.trim() || busy ? 0.45 : 1,
                }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: "#f7f3ee" }}>
                  {busy === "build" ? "Opening…" : "Open the builder"}
                </Text>
              </PressFade>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ChoiceCard({ icon, label, sub, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#ece7e1", borderRadius: 12, padding: 14 }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: "#fdf6f2", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={19} color={colors.primaryOnWhite} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 14.5, color: "#2a211c" }}>{label}</Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#78716c", marginTop: 2 }}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color="#c9c4bd" />
    </PressFade>
  );
}
