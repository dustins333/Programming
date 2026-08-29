import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { listStartableHubClients } from "../../lib/programming/hub";
import { fonts, colors, type } from "../../lib/theme";

// The roster both hub pickers work from — every active SPC client with a
// block covering today, their week, and that week's published sessions.
//
// Shared by "stage a session", "start a session" and "add a client
// mid-session". One list rather than three so they cannot disagree about who
// is startable or what she is doing this week.
//
// TAP A NAME TO EXPAND, TAP A SESSION TO PICK. Picking used to happen on the
// name, with the sessions appearing afterwards and only if there were more
// than one — so the coach chose a client before seeing what that choice
// committed her to, and a one-session client never showed her session at all.
// Expanding first is one extra tap and it puts the whole decision on screen:
// which sessions exist, which is already done this week, and how many times
// each has been logged this block.
//
// THE COUNT CIRCLE is that last number (migration 0098). SPC clients do their
// sessions out of order and miss them, so "Session 1 (3) · Session 2 (1)"
// is the sentence a coach is actually reading — it says which one is behind,
// which "completed this week" on its own cannot.
//
// A client who can't be started still shows, greyed and unpickable with the
// reason on the row — either "No block running" or "Nothing published this
// week". A name quietly missing from the list is the kind of thing a coach
// hunts for.
//
// A client who has NEVER had a block is absent entirely, and that is the
// server's call, not this component's (see migration 0084): an spc_clients
// row is created by the enrolment toggle whether or not anyone ever
// programmed for that person, and on real data that is 62 of 76 rows.

const CARD_BORDER = "#ece7e1";
const DONE_BG = "#eef1e7";
const DONE_BORDER = "#4d6142";
const TINT_BG = "#fdf6f2";
const INK = "#2a211c";
const MAX_SLOTS = 4;

/* ------------------------------------------------------------ count circle */

// Solid, so it reads as a badge on the pill rather than another control. It
// stays at zero rather than disappearing: an empty circle is the answer to
// "how many times has she done this" just as much as a 3 is, and a pill that
// grows a badge only sometimes makes the row heights jump.
function CountCircle({ count, tone }) {
  return (
    <View
      style={{
        minWidth: 22,
        height: 22,
        borderRadius: 11,
        paddingHorizontal: 5,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tone,
      }}
    >
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: fonts.sansBold, fontSize: 11.5, color: "#fff" }}>
        {count}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------- session row */

// Full width, not a wrapping chip row. Real session titles run to "Alicia
// SPC: Pull Ups + Athleticism", which cannot sit beside a sibling on a phone
// — and the count and the preview both need somewhere to live.
function SessionRow({ session, active, onPress, onPreview }) {
  const done = Boolean(session.completed);
  const bg = active ? colors.primary : done ? DONE_BG : "#fff";
  const border = active ? colors.primary : done ? DONE_BORDER : CARD_BORDER;
  const text = active ? "#fff" : INK;
  const sub = active ? "rgba(255,255,255,0.75)" : colors.muted;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        borderWidth: done && !active ? 2 : 1,
        borderColor: border,
        backgroundColor: bg,
        paddingLeft: 12,
        paddingRight: onPreview ? 4 : 12,
        paddingVertical: 8,
        marginTop: 7,
      }}
    >
      <PressFade onPress={onPress} style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 }}>
        {done ? (
          <Ionicons name="checkmark-circle" size={16} color={active ? "#fff" : DONE_BORDER} />
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansSemiBold, fontSize: 13.5, color: text }}>
            {`Session ${session.sessionNumber}`}
          </Text>
          {session.title ? (
            <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: sub, marginTop: 1 }}>
              {session.title}
            </Text>
          ) : null}
        </View>
        <CountCircle count={session.loggedCount ?? 0} tone={active ? "rgba(255,255,255,0.3)" : done ? DONE_BORDER : "#c9c4bd"} />
      </PressFade>
      {onPreview ? (
        <PressFade
          onPress={onPreview}
          accessibilityLabel={`Preview session ${session.sessionNumber}`}
          hitSlop={6}
          style={{ paddingHorizontal: 8, paddingVertical: 4 }}
        >
          <Ionicons name="eye-outline" size={18} color={active ? "#fff" : colors.primaryOnWhite} />
        </PressFade>
      ) : null}
    </View>
  );
}


/* ------------------------------------------------------------- client row */

export function HubClientRow({
  row,
  selectedWorkout,
  isOpen,
  unavailable,
  reason,
  full,
  compact,
  onToggleExpand,
  onChooseSession,
  onPreview,
}) {
  const selected = Boolean(selectedWorkout);
  const chosen = (row.sessions ?? []).find((s) => s.spcWorkoutId === selectedWorkout);
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : CARD_BORDER,
        backgroundColor: selected ? TINT_BG : "white",
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 8,
        opacity: unavailable ? 0.45 : 1,
      }}
    >
      <PressFade onPress={onToggleExpand} disabled={unavailable} style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={compact ? 22 : 26}
          color={selected ? colors.primary : "#ddd6cd"}
          style={{ marginRight: 10 }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.sansBold, fontSize: compact ? 16 : 19, color: INK }}>
            {row.name}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: unavailable ? "#b23a22" : colors.muted, marginTop: 2 }}>
            {unavailable
              ? reason
              : selected
                ? `Week ${row.weekNumber} · Session ${chosen?.sessionNumber ?? ""}`
                : `Week ${row.weekNumber} · ${row.sessions.length} session${row.sessions.length === 1 ? "" : "s"}`}
          </Text>
        </View>
        {unavailable ? null : <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />}
      </PressFade>

      {isOpen && !unavailable ? (
        <View style={{ marginLeft: compact ? 32 : 36, marginTop: 2, opacity: full ? 0.5 : 1 }}>
          {row.sessions.map((s) => (
            <SessionRow
              key={s.spcWorkoutId}
              session={s}
              active={selectedWorkout === s.spcWorkoutId}
              onPress={() => onChooseSession(s)}
              onPreview={onPreview ? () => onPreview(s) : undefined}
            />
          ))}
          {full ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: "#8a5a2e", marginTop: 7 }}>
              A session holds four clients.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function HubClientPickList({
  mode = "multi", // "multi" (stage / start, up to 4) | "single" (add mid-session)
  excludeUserIds = [],
  onChange, // (slots) => void — [{ userId, name, spcWorkoutId, sessionNumber, weekNumber }]
  // Optional. When given, each session row grows an eye that opens the
  // caller's own preview — the wall's picker passes nothing, because a sheet
  // over a sheet on a touchscreen at 5am is not a preview, it's a trap.
  onPreview,
  // { userId: sessionNumber } — reopening a staged group for editing. Keyed
  // by session NUMBER rather than workout id because that is what a staged
  // slot stores (0090): the block's week rolls over between staging and the
  // morning, so the workout is only resolved at start.
  initialSessionNumbers = null,
  compact = false,
}) {
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState({}); // userId -> spcWorkoutId
  const [expanded, setExpanded] = useState(null); // userId

  const load = () => {
    setLoadError(false);
    setRoster(null);
    listStartableHubClients()
      .then(setRoster)
      .catch(() => setLoadError(true));
  };
  useEffect(load, []);

  // Seeded once the roster arrives, because turning a session number into a
  // workout id needs to know which week she is in. Runs on the roster, not on
  // the prop, so a re-render can't overwrite what the coach has since changed.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !roster || !initialSessionNumbers) return;
    const next = {};
    for (const [userId, sessionNumber] of Object.entries(initialSessionNumbers)) {
      const row = roster.find((r) => r.userId === userId);
      const session = (row?.sessions ?? []).find((s) => s.sessionNumber === sessionNumber);
      if (session) next[userId] = session.spcWorkoutId;
    }
    setSeeded(true);
    if (Object.keys(next).length > 0) emit(next);
  }, [roster, initialSessionNumbers, seeded]);

  const excluded = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (roster ?? []).filter((r) => !excluded.has(r.userId) && (!q || r.name.toLowerCase().includes(q)));
  }, [roster, search, excluded]);

  const emit = (next) => {
    setPicked(next);
    const slots = Object.entries(next).map(([userId, spcWorkoutId]) => {
      const row = (roster ?? []).find((r) => r.userId === userId);
      const session = (row?.sessions ?? []).find((s) => s.spcWorkoutId === spcWorkoutId);
      return {
        userId,
        name: row?.name ?? "",
        spcWorkoutId,
        sessionNumber: session?.sessionNumber ?? null,
        weekNumber: row?.weekNumber ?? null,
      };
    });
    onChange?.(slots);
  };

  // The name is expand-only. Selecting is what a session row does, and a name
  // that both expanded AND selected would silently commit a coach to whatever
  // default we guessed the moment she opened it to look.
  const toggleExpand = (row) => {
    if (row.sessions.length === 0) return;
    setExpanded((cur) => (cur === row.userId ? null : row.userId));
  };

  const chooseSession = (row, session) => {
    const already = picked[row.userId] === session.spcWorkoutId;
    if (already) {
      const next = { ...picked };
      delete next[row.userId];
      emit(next);
      return;
    }
    const next = mode === "single" ? {} : { ...picked };
    // Switching session for someone already picked isn't a new slot, so the
    // cap only applies to a client who isn't on the list yet.
    if (mode === "multi" && !picked[row.userId] && Object.keys(next).length >= MAX_SLOTS) return;
    next[row.userId] = session.spcWorkoutId;
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
          const betweenBlocks = row.weekNumber == null;
          const unavailable = betweenBlocks || row.sessions.length === 0;
          return (
            <HubClientRow
              key={row.userId}
              row={row}
              selectedWorkout={selectedWorkout}
              isOpen={expanded === row.userId}
              unavailable={unavailable}
              reason={betweenBlocks ? "No block running" : "Nothing published this week"}
              // A full board still lets you open a name to look, and still
              // lets you change the session of someone already on it. It only
              // refuses to add a fifth.
              full={full && !selectedWorkout}
              compact={compact}
              onToggleExpand={() => toggleExpand(row)}
              onChooseSession={(session) => chooseSession(row, session)}
              onPreview={onPreview ? (session) => onPreview(row, session) : undefined}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
