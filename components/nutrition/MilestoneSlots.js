import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MAX_ACTIVE_MILESTONES, MILESTONE_COLORS } from "../../lib/nutrition/milestones";
import { MilestoneFormModal } from "./MilestoneFormModal";
import { MilestoneHistoryModal } from "./MilestoneHistoryModal";
import { fonts, colors } from "../../lib/theme";

const SLOT_HEIGHT = 132;

function MilestoneSquare({ milestone, onPress }) {
  if (!milestone) {
    return (
      <Pressable
        onPress={onPress}
        style={{
          flex: 1,
          height: SLOT_HEIGHT,
          borderRadius: 14,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: "#d6d3d1",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="add" size={22} color="#a8a29e" />
      </Pressable>
    );
  }
  const palette = MILESTONE_COLORS[milestone.color_index % MILESTONE_COLORS.length];
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, height: SLOT_HEIGHT, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg, padding: 10 }}
    >
      <Text numberOfLines={2} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: palette.text }}>
        {milestone.title}
      </Text>
      {milestone.details ? (
        <Text numberOfLines={4} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: palette.text, opacity: 0.85, marginTop: 4 }}>
          {milestone.details}
        </Text>
      ) : null}
    </Pressable>
  );
}

// 3-slot row on a client's Dashboard tab — a filled slot is a colored card
// (click to edit/close/delete), an empty slot is a dashed "+" placeholder
// (click to create). Capped at MAX_ACTIVE_MILESTONES active at once — see
// lib/nutrition/milestones.js's createMilestone, which enforces this
// server-side too, not just via slot count here.
export function MilestoneSlots({ userId, coachId, milestones, onChanged }) {
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = creating, object = editing
  const [showHistory, setShowHistory] = useState(false);

  const slots = Array.from({ length: MAX_ACTIVE_MILESTONES }, (_, i) => milestones[i] ?? null);

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {slots.map((m, i) => (
          <MilestoneSquare key={m?.id ?? `empty-${i}`} milestone={m} onPress={() => setEditing(m ?? null)} />
        ))}
      </View>
      <Pressable onPress={() => setShowHistory(true)} className="mt-2.5 self-start" hitSlop={8}>
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: colors.primaryOnWhite }}>History →</Text>
      </Pressable>

      <MilestoneFormModal
        visible={editing !== undefined}
        milestone={editing}
        userId={userId}
        createdBy={coachId}
        onClose={() => setEditing(undefined)}
        onChanged={onChanged}
      />
      <MilestoneHistoryModal visible={showHistory} userId={userId} onClose={() => setShowHistory(false)} onChanged={onChanged} />
    </View>
  );
}
