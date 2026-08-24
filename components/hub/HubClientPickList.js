import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { listStartableHubClients } from "../../lib/programming/hub";
import { fonts, colors, type } from "../../lib/theme";

// The roster the wall display picks from — every active SPC client with a
// block covering today, their week, and that week's published sessions.
//
// Shared by "start a session" (multi-select, up to 4) and "add a client"
// (single-select, mid-session). One list rather than two so the two flows
// can't disagree about who is startable or which session defaults.
//
// A client who can't be started still shows, greyed and unpickable with the
// reason on the row — either "No block running" or "Nothing published this
// week". A name quietly missing from the list is the kind of thing a coach
// hunts for.
//
// A client who has NEVER had a block is absent entirely, and that is the
// server's call, not this component's (see migration 0084): an spc_clients
// row is created by the enrolment toggle whether or not anyone ever
// programmed for that person, and on real data that is 62 of 72 rows. Showing
// them would bury the ten real ones.

const CARD_BORDER = "#ece7e1";
const MAX_SLOTS = 4;

function SessionPill({ session, active, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        marginRight: 8,
        marginTop: 6,
        backgroundColor: active ? colors.primary : "white",
        borderWidth: 1,
        borderColor: active ? colors.primary : CARD_BORDER,
      }}
    >
      {session.completed ? (
        <Ionicons name="checkmark-circle" size={14} color={active ? "white" : "#4d6142"} style={{ marginRight: 4 }} />
      ) : null}
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: active ? "white" : "#57534e" }}>
        {`Session ${session.sessionNumber}${session.title ? ` — ${session.title}` : ""}`}
      </Text>
    </PressFade>
  );
}

export function HubClientPickList({
  mode = "multi", // "multi" (start) | "single" (add mid-session)
  excludeUserIds = [],
  onChange, // (slots) => void — [{ userId, name, spcWorkoutId, weekNumber }]
  compact = false,
}) {
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState({}); // userId -> spcWorkoutId

  const load = () => {
    setLoadError(false);
    setRoster(null);
    listStartableHubClients()
      .then(setRoster)
      .catch(() => setLoadError(true));
  };
  useEffect(load, []);

  const excluded = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (roster ?? []).filter((r) => !excluded.has(r.userId) && (!q || r.name.toLowerCase().includes(q)));
  }, [roster, search, excluded]);

  const emit = (next) => {
    setPicked(next);
    const slots = Object.entries(next).map(([userId, spcWorkoutId]) => {
      const row = (roster ?? []).find((r) => r.userId === userId);
      return { userId, name: row?.name ?? "", spcWorkoutId, weekNumber: row?.weekNumber ?? null };
    });
    onChange?.(slots);
  };

  const toggle = (row) => {
    if (row.sessions.length === 0) return;
    if (picked[row.userId]) {
      const next = { ...picked };
      delete next[row.userId];
      emit(next);
      return;
    }
    // Defaults to her next incomplete session, same rule the phone uses.
    const firstIncomplete = row.sessions.find((s) => !s.completed) ?? row.sessions[0];
    const next = mode === "single" ? {} : { ...picked };
    if (mode === "multi" && Object.keys(next).length >= MAX_SLOTS) return;
    next[row.userId] = firstIncomplete.spcWorkoutId;
    emit(next);
  };

  if (loadError) {
    return (
      <View style={{ paddingVertical: 24, alignItems: "center" }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: "#b23a22", marginBottom: 12, textAlign: "center" }}>
          Couldn't load the client list.
        </Text>
        <PressFade onPress={load} style={{ borderRadius: 999, borderWidth: 1, borderColor: CARD_BORDER, paddingHorizontal: 18, paddingVertical: 10 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.primaryOnWhite }}>Try again</Text>
        </PressFade>
      </View>
    );
  }
  if (!roster) {
    return (
      <View style={{ paddingVertical: 40, alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const full = mode === "multi" && Object.keys(picked).length >= MAX_SLOTS;

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search clients"
        placeholderTextColor={colors.hint}
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: CARD_BORDER,
          backgroundColor: "white",
          paddingHorizontal: 14,
          paddingVertical: compact ? 10 : 13,
          fontFamily: fonts.sans,
          fontSize: compact ? 15 : 17,
          color: "#292524",
          marginBottom: 10,
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
        {rows.length === 0 ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, paddingVertical: 14 }}>
            {roster.length === 0 ? "Nobody has a block running today." : "No clients match."}
          </Text>
        ) : null}
        {rows.map((row) => {
          const selectedWorkout = picked[row.userId];
          const selected = Boolean(selectedWorkout);
          const betweenBlocks = row.weekNumber == null;
          const unavailable = betweenBlocks || row.sessions.length === 0;
          const reason = betweenBlocks ? "No block running" : "Nothing published this week";
          const blocked = !selected && (full || unavailable);
          return (
            <View
              key={row.userId}
              style={{
                borderRadius: 14,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? colors.primary : CARD_BORDER,
                backgroundColor: selected ? "#fdf6f2" : "white",
                paddingHorizontal: 14,
                paddingVertical: 12,
                marginBottom: 8,
                opacity: blocked ? 0.45 : 1,
              }}
            >
              <PressFade onPress={() => toggle(row)} disabled={blocked} style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name={selected ? "checkmark-circle" : "ellipse-outline"}
                  size={compact ? 22 : 26}
                  color={selected ? colors.primary : "#ddd6cd"}
                  style={{ marginRight: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: compact ? 16 : 19, color: "#292524" }}>{row.name}</Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: unavailable ? "#b23a22" : colors.muted, marginTop: 2 }}>
                    {unavailable ? reason : `Week ${row.weekNumber}`}
                  </Text>
                </View>
              </PressFade>
              {selected && row.sessions.length > 1 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginLeft: compact ? 32 : 36 }}>
                  {row.sessions.map((s) => (
                    <SessionPill
                      key={s.spcWorkoutId}
                      session={s}
                      active={selectedWorkout === s.spcWorkoutId}
                      onPress={() => emit({ ...picked, [row.userId]: s.spcWorkoutId })}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
