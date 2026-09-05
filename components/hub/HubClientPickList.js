import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressFade } from "../PressFade";
import { SegmentedControl } from "../SegmentedControl";
import { listStartableHubClients } from "../../lib/programming/hub";
import { formatDateShort } from "../../lib/formatDate";
import { dateInBoise, todayInBoise } from "../../lib/boiseDate";
import { fonts, colors, type } from "../../lib/theme";

// The roster both hub pickers work from — every active SPC client with a
// block covering today, their week, and that week's published sessions.
//
// Since 0106 it also carries members of any hub_enabled GROUP program (LLYL),
// behind a segmented control that opens on SPC. One roster rather than two so
// the two populations cannot disagree about who is startable; the segment is
// only a filter over it. Staging passes allowPrograms={false} — a staged group
// resolves its workout against SPC at start time (0090/0091), so offering a
// group member there would stage something that can't be started.
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
// THE DATE beside it (migration 0115) is when she last finalized that
// session. The count alone can't separate two sessions logged once each,
// which is the commonest version of this decision.
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

// When she last finalized this session, as prose: "Last Aug 29". The year is
// appended only when it isn't this one — a block runs weeks, so the year is
// never in question in practice, and spelling it every time costs width the
// pill doesn't have.
//
// Read through dateInBoise, never a slice of the ISO string: a session
// finalized in the Boise evening is already tomorrow in UTC.
function lastLoggedLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const boise = dateInBoise(d);
  const sameYear = boise.slice(0, 4) === todayInBoise().slice(0, 4);
  return `Last ${formatDateShort(boise)}${sameYear ? "" : ` ${boise.slice(0, 4)}`}`;
}

// Full width, not a wrapping chip row. Real session titles run to "Alicia
// SPC: Pull Ups + Athleticism", which cannot sit beside a sibling on a phone
// — and the count and the preview both need somewhere to live.
//
// THE COACH'S OWN TITLE LEADS when there is one, with "Session 2" demoted
// underneath it. It used to be the other way round, which buried the only
// part of the row that says what the session actually is. With no title the
// number stays in bold, so a row is never left without a heading.
//
// The second line also carries when she last finalized it. loggedCount alone
// cannot answer "which of these did she do most recently" — a client with one
// completion against each session reads identically on every pill, which is
// exactly the case a coach is standing there trying to resolve.
function SessionRow({ session, active, onPress, onPreview }) {
  const done = Boolean(session.completed);
  const bg = active ? colors.primary : done ? DONE_BG : "#fff";
  const border = active ? colors.primary : done ? DONE_BORDER : CARD_BORDER;
  const text = active ? "#fff" : INK;
  const sub = active ? "rgba(255,255,255,0.75)" : colors.muted;

  const numberLabel = `Session ${session.sessionNumber}`;
  const title = (session.title ?? "").trim();
  const last = lastLoggedLabel(session.lastLoggedAt);
  // "Not logged yet" only where we actually know that. A count above zero
  // with no date means the roster predates this field, and inventing "never"
  // there would be a lie the coach would act on.
  const dateLine = last ?? ((session.loggedCount ?? 0) === 0 ? "Not logged yet" : null);
  const subLine = [title ? numberLabel : null, dateLine].filter(Boolean).join(" · ");

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
            {title || numberLabel}
          </Text>
          {subLine ? (
            <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: sub, marginTop: 1 }}>
              {subLine}
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
  // She has already logged the selected session this week and the coach
  // answered "start a new one". Said on the row because the completion is
  // not opened until the board starts — on the Stage tab that is hours
  // later, and a flag nobody can see is a flag nobody can trust.
  makeup = false,
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
  // A session row carries one of the two ids (0106); the picked value is
  // whichever it was, so compare against the same coalesce everywhere.
  const idOf = (s) => s.groupWorkoutId ?? s.spcWorkoutId;
  const chosen = (row.sessions ?? []).find((s) => idOf(s) === selectedWorkout);
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
                ? `Week ${row.weekNumber} · Session ${chosen?.sessionNumber ?? ""}${makeup ? " · doing it again" : ""}`
                : `Week ${row.weekNumber} · ${row.sessions.length} session${row.sessions.length === 1 ? "" : "s"}`}
          </Text>
        </View>
        {unavailable ? null : <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />}
      </PressFade>

      {isOpen && !unavailable ? (
        <View style={{ marginLeft: compact ? 32 : 36, marginTop: 2, opacity: full ? 0.5 : 1 }}>
          {row.sessions.map((s) => (
            <SessionRow
              key={idOf(s)}
              session={s}
              active={selectedWorkout === idOf(s)}
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

/* ---------------------------------------------------- already done today? */

// The coach's side of the member's make-up popup. She logged Session 1 on
// Monday, she is back on Thursday and wants to do it again: that is a second
// real session of the same week (0102's instance column), not a mistake.
//
// Centered card rather than a bottom sheet, matching the picker it opens
// from — the hub's dialogs are coach-facing on a landscape screen, which is
// what the house rule reserves centered dialogs for.
//
// Only offered where the board is about to run. Staging tomorrow's 6am is the
// one place this must NOT appear: the instance would be created against
// today's week, for a session she has not done yet.
function RepeatSessionDialog({ visible, name, sessionNumber, sameDay, onClose, onOpenLogged, onStartNew }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.45)", alignItems: "center", justifyContent: "center", padding: 20 }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 460,
            backgroundColor: colors.canvas,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: CARD_BORDER,
            padding: 22,
          }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 20, color: INK }}>
            {`${(name ?? "").split(" ")[0]} already logged Session ${sessionNumber} this week`}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: type.body, color: colors.muted, marginTop: 5 }}>
            Both are normal. Pick whichever matches what she is doing today.
          </Text>
          <View style={{ gap: 10, marginTop: 16 }}>
            <PressFade
              onPress={onOpenLogged}
              style={{
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: "#e0dbd4",
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: INK }}>Put that session on the board</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 3 }}>
                What she already logged. Add a set, fix a weight.
              </Text>
            </PressFade>
            <PressFade
              onPress={onStartNew}
              style={{
                backgroundColor: "#fff",
                borderWidth: 1,
                borderColor: "#e0dbd4",
                borderRadius: 14,
                paddingVertical: 14,
                paddingHorizontal: 16,
              }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: INK }}>Start a new one</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginTop: 3 }}>
                A second session this week, good for making up one she missed.
              </Text>
            </PressFade>
          </View>
          {/* A set row is keyed by date, not by session (0102: logs carry no
              instance), so two sessions on ONE day share their sets and the
              second overwrites the first. Said here rather than discovered
              afterwards — it is the only case where "start a new one" costs
              something, and it is invisible until her morning numbers have
              already gone. */}
          {sameDay ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, lineHeight: 17, color: "#8a5a2e", marginTop: 14 }}>
              She logged this earlier today, so both sessions share today's set boxes. A make-up on a different day keeps its own.
            </Text>
          ) : null}
          <PressFade
            onPress={onClose}
            style={{ alignSelf: "center", marginTop: 16, paddingVertical: 6, paddingHorizontal: 12 }}
          >
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.primaryOnWhite }}>Never mind</Text>
          </PressFade>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function HubClientPickList({
  mode = "multi", // "multi" (stage / start, up to 4) | "single" (add mid-session)
  excludeUserIds = [],
  onChange, // (slots) => void — [{ userId, name, spcWorkoutId | groupWorkoutId, programKind, programId, sessionNumber, weekNumber }]
  // Optional. When given, each session row grows an eye that opens the
  // caller's own preview — the wall's picker passes nothing, because a sheet
  // over a sheet on a touchscreen at 5am is not a preview, it's a trap.
  onPreview,
  // { userId: sessionNumber } — reopening a staged group for editing. Keyed
  // by session NUMBER rather than workout id because that is what a staged
  // slot stores (0090): the block's week rolls over between staging and the
  // morning, so the workout is only resolved at start.
  initialSessionNumbers = null,
  // Picking a session she has already logged this week asks whether to open
  // it or start a second one. Answering "start a new one" does NOT write
  // anything here — it flags the slot, and the make-up completion is opened
  // once she is actually on the board. See handleStartNewInstance.
  allowRepeat = false,
  // { userId: true } — reopening a staged group whose slots were already
  // flagged as make-ups, so the answer survives an edit. Keyed by user id for
  // the same reason initialSessionNumbers is: that is what a staged row holds.
  initialMakeups = null,
  // Whether the SPC / group segments are offered. Default on so the wall's
  // own picker and add-mid-session get them without opting in; staging turns
  // it off (see the header).
  allowPrograms = true,
  // Which segment to open on — a group program's id, arriving from the Group
  // Programs page's "Live session" link. Falls back to SPC if that program
  // isn't startable right now (no block covering today, or it was turned off).
  initialProgram = null,
  compact = false,
}) {
  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  // Keyed on row.key (programKind:programId:userId), not userId: one person
  // can legitimately be both an SPC client and a member of a hub_enabled
  // group, which is two rows and two different sessions.
  const [picked, setPicked] = useState({}); // row.key -> workout id
  const [expanded, setExpanded] = useState(null); // row.key
  const [program, setProgram] = useState(initialProgram ?? "spc");
  const [repeatAsk, setRepeatAsk] = useState(null); // { row, session }
  // Once she has answered for a session, selecting it again is just a
  // selection — deselect-and-reselect must not keep asking.
  const [repeatAnswered, setRepeatAnswered] = useState(() => new Set());
  // Which of those answers was "start a new one". This is the ONLY thing the
  // dialog produces: the completion itself is opened after she lands on the
  // board (hub_open_makeup, migration 0117), never here.
  const [makeups, setMakeups] = useState(() => new Set());

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
    const seedMakeups = new Set();
    for (const [userId, sessionNumber] of Object.entries(initialSessionNumbers)) {
      const row = roster.find((r) => r.userId === userId && r.programKind === "spc");
      const session = (row?.sessions ?? []).find((s) => s.sessionNumber === sessionNumber);
      if (!session) continue;
      next[row.key] = session.spcWorkoutId;
      // A staged slot the coach already answered "start a new one" for comes
      // back flagged, so editing the group's time doesn't quietly undo it.
      if (initialMakeups?.[userId]) seedMakeups.add(`${row.key}:${session.spcWorkoutId}`);
    }
    setSeeded(true);
    setMakeups(seedMakeups);
    if (Object.keys(next).length > 0) emit(next, seedMakeups);
  }, [roster, initialSessionNumbers, initialMakeups, seeded]);

  const excluded = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);

  // One segment per hub_enabled program actually present in the roster, in
  // name order after SPC. Built from the data rather than a fixed list, so
  // turning a program on in settings is all it takes to see it here.
  const segments = useMemo(() => {
    if (!allowPrograms || !roster) return [];
    const byId = new Map();
    for (const r of roster) {
      if (r.programKind !== "group" || !r.programId) continue;
      if (!byId.has(r.programId)) byId.set(r.programId, r.programName ?? "Group");
    }
    if (byId.size === 0) return [];
    return [
      { key: "spc", label: "SPC" },
      ...[...byId.entries()]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => ({ key: id, label: name })),
    ];
  }, [roster, allowPrograms]);

  // A program turned off (or its block ending) between renders must not strand
  // the picker on a segment that no longer exists.
  const activeProgram = segments.length > 0 && segments.some((x) => x.key === program) ? program : "spc";

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (roster ?? []).filter((r) => {
      if (excluded.has(r.userId)) return false;
      if (!allowPrograms) {
        if (r.programKind !== "spc") return false;
      } else if (activeProgram === "spc") {
        if (r.programKind !== "spc") return false;
      } else if (r.programId !== activeProgram) {
        return false;
      }
      return !q || r.name.toLowerCase().includes(q);
    });
  }, [roster, search, excluded, activeProgram, allowPrograms]);

  // `nextMakeups` defaults to current state — passed explicitly only by the
  // handlers that change it in the same tick, since state is a render behind.
  const emit = (next, nextMakeups = makeups) => {
    setPicked(next);
    const slots = Object.entries(next).map(([key, workoutId]) => {
      const row = (roster ?? []).find((r) => r.key === key);
      const session = (row?.sessions ?? []).find(
        (s) => (s.groupWorkoutId ?? s.spcWorkoutId) === workoutId
      );
      return {
        userId: row?.userId ?? null,
        name: row?.name ?? "",
        programKind: row?.programKind ?? "spc",
        programId: row?.programId ?? null,
        spcWorkoutId: session?.groupWorkoutId ? null : workoutId,
        groupWorkoutId: session?.groupWorkoutId ?? null,
        sessionNumber: session?.sessionNumber ?? null,
        // The SESSION's authored week, not the client's current calendar week.
        // Since 0101 a session can be moved into a different week, and its
        // completions and logs are keyed on the week it was written in — a
        // slot carrying the calendar week would file both somewhere nothing
        // can find them. Falls back to the client row for a roster fetched
        // before the RPC started returning it.
        weekNumber: session?.weekNumber ?? row?.weekNumber ?? null,
        // "She already did this — start a second one." An intent, not a
        // record: the caller opens it after the board write, because the
        // display account may only write a completion for a client already
        // on the board (0117's header).
        newInstance: nextMakeups.has(`${key}:${workoutId}`),
      };
    });
    onChange?.(slots);
  };

  // The name is expand-only. Selecting is what a session row does, and a name
  // that both expanded AND selected would silently commit a coach to whatever
  // default we guessed the moment she opened it to look.
  const toggleExpand = (row) => {
    if (row.sessions.length === 0) return;
    setExpanded((cur) => (cur === row.key ? null : row.key));
  };

  // The select itself, once any "she already did this" question is settled.
  const selectSession = (row, session, nextMakeups = makeups) => {
    const next = mode === "single" ? {} : { ...picked };
    // Switching session for someone already picked isn't a new slot, so the
    // cap only applies to a client who isn't on the list yet.
    if (mode === "multi" && !picked[row.key] && Object.keys(next).length >= MAX_SLOTS) return;
    next[row.key] = session.groupWorkoutId ?? session.spcWorkoutId;
    emit(next, nextMakeups);
  };

  // Records the answer and nothing else. Writing the second completion HERE
  // is what broke this from the wall for good: the display's only write
  // policy on session_completions requires the client to be on the board
  // already, which she never is at pick time, so every "start a new one"
  // from the TV died on a 42501. It also left a phantom completion behind
  // whenever the coach then cancelled the picker. Opened at start/add
  // instead — see 0117.
  const handleStartNewInstance = () => {
    // The Modal stays mounted while it fades out, so a fast second tap can
    // land after repeatAsk has already been cleared.
    if (!repeatAsk) return;
    const { row, session } = repeatAsk;
    const key = `${row.key}:${session.spcWorkoutId}`;
    const nextMakeups = new Set(makeups).add(key);
    setMakeups(nextMakeups);
    setRepeatAnswered((prev) => new Set(prev).add(key));
    setRepeatAsk(null);
    selectSession(row, session, nextMakeups);
  };

  const chooseSession = (row, session) => {
    const workoutId = session.groupWorkoutId ?? session.spcWorkoutId;
    if (picked[row.key] === workoutId) {
      const next = { ...picked };
      delete next[row.key];
      // Taking her off drops the make-up answer with her, or re-picking the
      // same session later would silently still be flagged.
      const nextMakeups = new Set(makeups);
      nextMakeups.delete(`${row.key}:${workoutId}`);
      setMakeups(nextMakeups);
      setRepeatAnswered((prev) => {
        const n = new Set(prev);
        n.delete(`${row.key}:${workoutId}`);
        return n;
      });
      emit(next, nextMakeups);
      return;
    }
    // "She already did this — open it or start a second?" is an SPC question:
    // the second instance is filed under a calendar week (0102), which a group
    // completion doesn't have.
    if (row.programKind === "spc" && allowRepeat && session.completed && !repeatAnswered.has(`${row.key}:${workoutId}`)) {
      setRepeatAsk({ row, session });
      return;
    }
    selectSession(row, session);
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
      {segments.length > 0 ? (
        <SegmentedControl segments={segments} activeKey={activeProgram} onSelect={setProgram} dense />
      ) : null}
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
            {roster.length === 0
              ? "Nobody has a block running today."
              : search.trim()
                ? "No clients match."
                : "Nobody on this program has a block running today."}
          </Text>
        ) : null}
        {rows.map((row) => {
          const selectedWorkout = picked[row.key];
          const betweenBlocks = row.weekNumber == null;
          const unavailable = betweenBlocks || row.sessions.length === 0;
          return (
            <HubClientRow
              key={row.key}
              row={row}
              selectedWorkout={selectedWorkout}
              makeup={Boolean(selectedWorkout) && makeups.has(`${row.key}:${selectedWorkout}`)}
              isOpen={expanded === row.key}
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
      <RepeatSessionDialog
        visible={Boolean(repeatAsk)}
        name={repeatAsk?.row?.name}
        sessionNumber={repeatAsk?.session?.sessionNumber}
        sameDay={
          !!repeatAsk?.session?.lastLoggedAt &&
          dateInBoise(new Date(repeatAsk.session.lastLoggedAt)) === todayInBoise()
        }
        onClose={() => setRepeatAsk(null)}
        onOpenLogged={() => {
          if (!repeatAsk) return;
          const { row, session } = repeatAsk;
          const key = `${row.key}:${session.spcWorkoutId}`;
          const nextMakeups = new Set(makeups);
          nextMakeups.delete(key);
          setMakeups(nextMakeups);
          setRepeatAnswered((prev) => new Set(prev).add(key));
          setRepeatAsk(null);
          selectSession(row, session, nextMakeups);
        }}
        onStartNew={handleStartNewInstance}
      />
    </View>
  );
}
