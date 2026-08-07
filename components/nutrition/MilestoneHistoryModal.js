import { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { toastError } from "../../lib/toast";
import { listAllMilestones, completeMilestone, reopenMilestone, MILESTONE_COLORS } from "../../lib/nutrition/milestones";
import { formatDateTimeInBoise } from "../../lib/boiseDate";
import { MilestoneCompleteCheckbox } from "./MilestoneCompleteCheckbox";
import { fonts } from "../../lib/theme";

function MilestoneRow({ milestone, userId, onToggled }) {
  const [busy, setBusy] = useState(false);
  const isActive = milestone.status === "active";
  const palette = MILESTONE_COLORS[milestone.color_index % MILESTONE_COLORS.length];

  const handleToggle = async () => {
    setBusy(true);
    try {
      if (isActive) {
        await completeMilestone(milestone.id);
      } else {
        await reopenMilestone(milestone.id, userId);
      }
      await onToggled();
    } catch (err) {
      toastError(isActive ? "Failed to close out milestone" : "Failed to reopen milestone", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="mb-2.5 flex-row items-center gap-3 rounded-xl px-3.5 py-3" style={{ borderWidth: 1, borderColor: isActive ? palette.border : "#ece7e1", backgroundColor: isActive ? palette.bg : "#faf8f6" }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: isActive ? palette.text : "#78716c" }}>
          {milestone.title}
        </Text>
        {milestone.details ? (
          <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 12, color: "#a8a29e", marginTop: 2 }}>
            {milestone.details}
          </Text>
        ) : null}
        {!isActive ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: "#a8a29e", marginTop: 4 }}>
            Completed {formatDateTimeInBoise(milestone.completed_at)}
          </Text>
        ) : null}
      </View>
      <MilestoneCompleteCheckbox completed={isActive ? false : true} onToggle={handleToggle} busy={busy} />
    </View>
  );
}

// Bottom-sheet popup listing every milestone (active + completed) for one
// client — same house bottom-sheet pattern as SessionHistoryModal. Doubles
// as a "close it out" / "resurrect it" surface via the same checkbox both
// directions, so a coach doesn't have to open each square individually.
export function MilestoneHistoryModal({ visible, userId, onClose, onChanged }) {
  const [milestones, setMilestones] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = () => {
    listAllMilestones(userId)
      .then(setMilestones)
      .catch((err) => setLoadError(err.message ?? String(err)));
  };

  useEffect(() => {
    if (!visible) return;
    setMilestones(null);
    setLoadError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, userId]);

  const handleToggled = async () => {
    load();
    await onChanged();
  };

  const active = (milestones ?? []).filter((m) => m.status === "active");
  const completed = (milestones ?? []).filter((m) => m.status === "completed");

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 justify-end px-0" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{ maxHeight: "82%", width: "100%", backgroundColor: "#faf8f6", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 24 }}
        >
          <View className="mb-3 flex-row items-start justify-between gap-2.5">
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 18, color: "#44403c" }}>Milestones</Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="items-center justify-center"
              style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#e7e5e4" }}
            >
              <Text style={{ color: "#a8a29e", fontSize: 15 }}>×</Text>
            </Pressable>
          </View>

          {loadError ? (
            <Text className="text-red-600" style={{ fontFamily: fonts.sans }}>
              Something went wrong loading milestones: {loadError}
            </Text>
          ) : !milestones ? (
            <View className="items-center py-8">
              <ActivityIndicator />
            </View>
          ) : milestones.length === 0 ? (
            <Text className="py-3 text-center text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
              No milestones yet.
            </Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {active.length > 0 ? (
                <View className="mb-3">
                  <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
                    Active
                  </Text>
                  {active.map((m) => (
                    <MilestoneRow key={m.id} milestone={m} userId={userId} onToggled={handleToggled} />
                  ))}
                </View>
              ) : null}
              {completed.length > 0 ? (
                <View>
                  <Text className="mb-2 text-xs uppercase text-stone-400" style={{ fontFamily: fonts.sansSemiBold, letterSpacing: 0.5 }}>
                    Completed
                  </Text>
                  {completed.map((m) => (
                    <MilestoneRow key={m.id} milestone={m} userId={userId} onToggled={handleToggled} />
                  ))}
                </View>
              ) : null}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
