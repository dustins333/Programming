import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { useHubBoard } from "../../../components/hub/useHubBoard";
import { HubLiveSession } from "../../../components/hub/HubLiveSession";
import { HubClientPickList } from "../../../components/hub/HubClientPickList";
import { HubSessionPreviewSheet } from "../../../components/hub/HubSessionPreviewSheet";
import { HubPinCard } from "../../../components/hub/HubPinCard";
import { HubAddClientModal } from "../../../components/hub/HubPickerModals";
import { StagedSessionsCard, useStagedSessions } from "../../../components/hub/StagedSessionsCard";
import { SpcSessionDeck } from "../../../components/coach/SpcSessionPreview";
import { StageWhenSheet, describeWhen } from "../../../components/coach/StagingTray";
import { removeHubClient, startHubSession } from "../../../lib/programming/hub";
import {
  listMyStagedSessions,
  startStagedSession,
  createStagedSession,
  updateStagedSession,
  finalizeStagedSession,
  getStagedSession,
  syncStagedClients,
} from "../../../lib/programming/hubStaging";
import { confirmStartNextStaged } from "../../../lib/confirmDialog";
import { todayInBoise } from "../../../lib/boiseDate";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { showToast, toastError } from "../../../lib/toast";
import { fonts, colors, type } from "../../../lib/theme";

// SPC Live Sessions — the one screen the hub lives on.
//
// A selector at the top, and what it offers depends on whether a board is
// already running:
//
//   nothing staged, nothing running   Stage a session  | Start now
//   something staged                  Staged sessions  | Start now
//   board running                     Block overview   | Logging
//
// The left side is always "the thing you have", and it only offers to BUILD
// one while you have none. Once a group exists, the left side lists what is
// waiting and each row opens its clients' block overviews — reading a staged
// group before 5am is the most common thing done on this screen, and it used
// to be reachable only once a session was already live.
//
// Staging ANOTHER group is the circle beside the title. It appears only when
// the left side isn't already the picker, which is exactly when there would
// otherwise be no way in.

const CARD_BORDER = "#ece7e1";
const INK = "#2a211c";

/* -------------------------------------------------------------- sticky bar */

// Docked, not at the end of the list: the roster scrolls for as long as it
// needs to and the count has to stay visible while it does — a coach adding
// the fourth person shouldn't have to scroll to find out they got there.
function StickyBar({ count, label, busyLabel, busy, onPress, hint }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: insets.bottom + 12,
        backgroundColor: "#fff",
        borderTopWidth: 1,
        borderTopColor: CARD_BORDER,
      }}
    >
      {hint ? (
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sans, fontSize: type.caption, color: colors.muted, marginBottom: 8 }}>
          {hint}
        </Text>
      ) : null}
      <PressFade
        onPress={onPress}
        disabled={count === 0 || busy}
        style={{
          borderRadius: 14,
          paddingVertical: 15,
          alignItems: "center",
          backgroundColor: colors.primary,
          opacity: count === 0 || busy ? 0.5 : 1,
        }}
      >
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "white" }}>
          {busy ? busyLabel : `${label}${count > 0 ? ` (${count})` : ""}`}
        </Text>
      </PressFade>
    </View>
  );
}

// Beside the title, not under the selector: the old inline link read as part
// of whatever section happened to sit above it. A circle plus its own words,
// because an unlabelled + beside a title could mean add a client, a block or
// a session.
function StagedList(props) {
  return <StagedSessionsCard {...props} />;
}

function StageAnotherButton({ onPress }) {
  return (
    <PressFade
      onPress={onPress}
      accessibilityLabel="Stage another session"
      style={{ alignItems: "center", width: 74, marginLeft: 8 }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fdf6f2",
          borderWidth: 1,
          borderColor: "#f0ddd2",
        }}
      >
        <Ionicons name="add" size={22} color={colors.primaryOnWhite} />
      </View>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={1.1}
        style={{
          marginTop: 3,
          textAlign: "center",
          fontFamily: fonts.sansSemiBold,
          fontSize: 10,
          lineHeight: 12,
          color: colors.primaryOnWhite,
        }}
      >
        Stage another session
      </Text>
    </PressFade>
  );
}

// Both halves of the selector show the same roster; only the sentence above
// it and what the docked bar does with the result differ. One component so
// "tap a name, then tap her session" cannot drift between the two.
function StagePicker({ mode = "stage", editing, onChange, onPreview, initialSessionNumbers, initialProgram, onGoToStartNow }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: fonts.sans, fontSize: type.body, lineHeight: 20, color: colors.muted, marginBottom: 14 }}>
        {mode === "start"
          ? "Up to four clients, starting right now on the wall."
          : editing
            ? `Editing ${describeWhen(editing)}. Tap a name to see her sessions, then tap the one she's doing.`
            : "Up to four clients. Tap a name to see her sessions, then tap the one she's doing."}
      </Text>

      {/* Staging is SPC-only and always has been (a staged slot stores a
          session NUMBER, resolved against SPC on the morning it runs — see
          0106's header), so the group segments simply aren't offered here.
          Said out loud rather than left as an absence: an LLYL girl who is
          on Start now and missing from this list reads as a bug, and the
          only way to find out otherwise was to ask. */}
      {mode === "stage" && onGoToStartNow ? (
        <PressFade
          onPress={onGoToStartNow}
          style={{
            backgroundColor: "#fdf6f2",
            borderWidth: 1,
            borderColor: "#f0ddd2",
            borderRadius: 12,
            paddingVertical: 11,
            paddingHorizontal: 13,
            marginBottom: 14,
          }}
        >
          <Text style={{ fontFamily: fonts.sans, fontSize: type.caption, lineHeight: 17, color: "#7a5a49" }}>
            SPC clients only. A group program can't be staged ahead.{" "}
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Start an LLYL board now →</Text>
          </Text>
        </PressFade>
      ) : null}

      {/* A fixed height because this sits inside the page's own ScrollView: a
          flex:1 list would collapse to nothing there, and a self-sizing one
          would nest a scroller inside a scroller. */}
      <View style={{ height: 500 }}>
        <HubClientPickList
          key={mode + (editing?.id ?? "")}
          mode="multi"
          onChange={onChange}
          onPreview={onPreview}
          initialSessionNumbers={initialSessionNumbers}
          // Starting now only. Staging a future group must not offer to file
          // a second instance, which would land against today's week.
          allowRepeat={mode === "start"}
          // Likewise: a staged slot stores a session NUMBER and resolves it
          // against SPC in the morning (0090/0091), so a group member staged
          // here would be unstartable. See 0106's header.
          allowPrograms={mode === "start"}
          initialProgram={mode === "start" ? initialProgram : null}
          compact
        />
      </View>
    </View>
  );
}

export default function SpcLiveSessions() {
  const { profile } = useAuth();
  const params = useLocalSearchParams();
  const hub = useHubBoard({ idlePoll: true });
  const { hubSession, board, pollError, end, refreshSession, refreshBoard } = hub;

  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, setEnding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [stagedRefresh, setStagedRefresh] = useState(0);
  const { groups: stagedGroups, reload: reloadStaged } = useStagedSessions(profile?.id, stagedRefresh);
  const hasStaged = (stagedGroups?.length ?? 0) > 0;

  // Which half of the selector. Tracked as its own key per mode so switching
  // to "Logging" during a session doesn't leave "Start now" selected
  // underneath for when the session ends.
  // Arriving from a group program's "Live session" link (0106): open Start now
  // with that program's segment already selected, rather than the Stage tab a
  // coach lands on when she opens this screen cold.
  // `?tab=start` is the dashboard's Live session button, whose whole job is
  // to remove taps — landing on the Stage tab would add one back, and Stage
  // is also the one tab that can't offer LLYL (see below).
  const programParam = typeof params.program === "string" ? params.program : null;
  const wantsStart = programParam !== null || params.tab === "start";
  const [idleTab, setIdleTab] = useState(wantsStart ? "start" : "left");
  const [liveTab, setLiveTab] = useState("logging");
  // Building a new group when the left side is already showing something
  // else. Not a third segment: it is a detour, and it takes the screen over
  // while it lasts rather than sitting alongside the other two.
  const [stagingAside, setStagingAside] = useState(false);

  // Staging
  const [slots, setSlots] = useState([]);
  const [whenOpen, setWhenOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [preview, setPreview] = useState(null);

  // Editing an existing group (StagedSessionsCard's "Edit" lands here).
  const editId = typeof params.staging === "string" ? params.staging : "";
  const [editing, setEditing] = useState(null);

  // Review deck — a staged group, or the running board.
  const [deck, setDeck] = useState(null);

  const live = Boolean(hubSession);

  // Built once: the list appears in two places (above the live views, or as
  // the left tab) and must behave identically in both.
  const stagedProps = {
    groups: stagedGroups,
    reload: reloadStaged,
    openSession: hubSession,
    onStarted: () => handleStarted(),
    onDeleted: (group) => {
      if (group.id === editId) clearEditing();
    },
    onReview: (group, resolved) =>
      setDeck({
        label: `Staged · ${describeWhen(group)}`,
        targetDate: group.scheduled_date,
        clients: (resolved ?? []).map((r) => ({ userId: r.userId, name: r.name, sessionNumber: r.sessionNumber })),
      }),
  };

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!editId) {
        setEditing(null);
        return () => {
          cancelled = true;
        };
      }
      // The DETOUR, not a tab. `setIdleTab("stage")` looked right and did
      // nothing: idleTab is only ever compared against "start", so anything
      // else falls through to leftKey — which is "staged" whenever a group
      // exists, i.e. always when you are editing one. Edit therefore landed
      // straight back on the list it came from, every time.
      setStagingAside(true);
      // A failed read must not strand the coach on a blank picker — it falls
      // back to building a new group, which is never destructive.
      getStagedSession(editId)
        .then((g) => !cancelled && setEditing(g))
        .catch(() => !cancelled && setEditing(null));
      return () => {
        cancelled = true;
      };
    }, [editId])
  );

  // Memoised, or the picker's seeding effect re-runs on every render of this
  // screen for the whole time the Stage tab is open.
  const initialSessionNumbers = useMemo(() => {
    if (!editing?.clients?.length) return null;
    return Object.fromEntries(editing.clients.map((c) => [c.user_id, c.session_number]));
  }, [editing]);

  const handleStarted = async () => {
    await refreshSession();
    await refreshBoard();
  };

  const handleDropClient = async (userId) => {
    await removeHubClient(userId);
    await handleStarted();
  };

  /* ----------------------------------------------------------- start now */

  const handleStartNow = async () => {
    if (slots.length === 0 || starting) return;
    setStarting(true);
    try {
      await startHubSession({
        coachId: profile.id,
        coachName: profile.name ?? null,
        slots: slots.map((s) => ({
          userId: s.userId,
          clientName: s.name,
          spcWorkoutId: s.spcWorkoutId,
          groupWorkoutId: s.groupWorkoutId ?? null,
          weekNumber: s.weekNumber,
        })),
      });
      setSlots([]);
      setLiveTab("logging");
      await handleStarted();
    } catch (e) {
      toastError("Couldn't start the session.", e);
    } finally {
      setStarting(false);
    }
  };

  /* -------------------------------------------------------------- staging */

  // The whole group in one write. `when` comes from the sheet the save bar
  // opens — asked at the end, once the coach knows who is actually on it.
  const handleSaveStaged = async ({ scheduledDate, scheduledTime, title }) => {
    if (slots.length === 0 || saving) return;
    setSaving(true);
    try {
      let group = editing;
      if (group) {
        await updateStagedSession(group.id, { scheduled_date: scheduledDate, scheduled_time: scheduledTime, title });
      } else {
        group = await createStagedSession({
          coachId: profile.id,
          coachName: profile.name ?? null,
          scheduledDate,
          scheduledTime,
          title,
        });
      }
      await syncStagedClients(group.id, slots, group.clients ?? []);
      // Finalizing is what puts it on the wall. Saving IS staging here —
      // there is no half-built state to come back to, so leaving it a draft
      // would just mean a group that quietly never appears at 5am.
      await finalizeStagedSession(group.id);
      setWhenOpen(false);
      setSlots([]);
      setEditing(null);
      setStagedRefresh((n) => n + 1);
      setStagingAside(false);
      showToast(`Staged for ${describeWhen({ scheduled_time: scheduledTime, scheduled_date: scheduledDate })}.`);
      if (editId) router.replace("/(coach)/spc/live");
    } catch (e) {
      toastError("Couldn't save the staged session.", e);
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------ end / next */

  const offerNextStaged = async () => {
    try {
      const today = todayInBoise();
      const next = (await listMyStagedSessions(profile?.id)).find(
        (g) => g.finalized_at && g.scheduled_date === today
      );
      if (!next) return;
      if (!(await confirmStartNextStaged(describeWhen(next), next.clients?.length ?? 0))) return;
      const res = await startStagedSession(next.id);
      const skipped = res?.skipped ?? [];
      if (skipped.length > 0) {
        showToast(`Started without ${skipped.map((x) => (x.name ?? "").split(" ")[0]).join(", ")}.`);
      }
      setStagedRefresh((n) => n + 1);
      await handleStarted();
    } catch {
      // Silent: the staged card still offers Start.
    }
  };

  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    try {
      await end();
      setConfirmEnd(false);
      setStagedRefresh((n) => n + 1);
      await offerNextStaged();
    } catch (e) {
      toastError("Couldn't end the session.", e);
    } finally {
      setEnding(false);
    }
  };

  /* ---------------------------------------------------------------- render */

  // The left segment's MEANING follows the data, so a coach never has to
  // notice that it changed: with nothing staged it builds one, with something
  // staged it lists them. Tracked as "left"/"start" rather than by label, or
  // staging your first group would silently drop you onto "Start now".
  const leftKey = hasStaged ? "staged" : "stage";
  const tab = live ? liveTab : idleTab === "start" ? "start" : leftKey;
  const segments = live
    ? [
        { key: "overview", label: "Block overview" },
        { key: "logging", label: "Logging" },
      ]
    : [
        { key: leftKey, label: hasStaged ? "Staged sessions" : "Stage a session" },
        { key: "start", label: "Start now" },
        { key: "history", label: "History" },
      ];

  // Leaving an edit has to take the ?staging param with it. Otherwise the
  // next "Stage another session" reopens seeded with the group you just left
  // — or, after a delete, with one that no longer exists, behind a "Save
  // changes" button that would write to a deleted row.
  const clearEditing = () => {
    setEditing(null);
    setSlots([]);
    if (editId) router.replace("/(coach)/spc/live");
  };

  const leaveStagingAside = () => {
    setStagingAside(false);
    clearEditing();
  };

  // History is a doorway rather than a third pane: selecting it navigates and
  // the selector goes back to where it was, so there is no third body to keep
  // in step with the two real ones.
  // Leaves the staging detour if one is open, so the tap always lands on the
  // roster it promises rather than under the aside.
  const goToStartNow = () => {
    leaveStagingAside();
    setIdleTab("start");
  };

  const handleIdleTab = (key) => {
    if (key === "history") {
      router.push("/(coach)/spc/sessions");
      return;
    }
    setIdleTab(key === leftKey ? "left" : key);
  };

  // One flag decides both what's shown and what the docked bar does.
  const stagingNow = stagingAside || (!live && tab === "stage");
  const startingNow = !live && tab === "start" && !stagingAside;
  const showPicker = stagingNow || startingNow;
  // Only where the left side isn't the picker already — otherwise it would
  // be a second door onto the screen you are looking at.
  const showStageAnother = !stagingAside && (hasStaged || live);

  // The running board, as review pages: slot order, so swiping matches the
  // order they're standing in. Each is pinned to the session she is actually
  // on — the board has already decided that, same as a staged group has.
  // The number comes off the board rather than the session row, which only
  // stores the workout id.
  const liveDeckClients = (hubSession?.clients ?? []).map((c) => ({
    userId: c.user_id,
    name: c.client_name,
    sessionNumber: board?.get(c.user_id)?.sessionNumber ?? null,
  }));

  return (
    <CoachShell>
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingVertical: 28,
            // Room for the docked bar, which otherwise covers the last row of
            // the roster exactly when the coach is reaching for it.
            paddingBottom: showPicker ? 120 : 28,
            flexGrow: 1,
          }}
        >
          <View className="mb-4 flex-row items-center justify-between">
            <View style={{ flex: 1 }}>
              <PressFade
                onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/spc"))}
                style={{ marginBottom: 6 }}
              >
                <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
              </PressFade>
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
                className="text-2xl"
                style={{ fontFamily: fonts.display, color: colors.primary }}
              >
                SPC Live Sessions
              </Text>
            </View>
            {showStageAnother ? <StageAnotherButton onPress={() => setStagingAside(true)} /> : null}
            {live && !confirmEnd ? (
              <PressFade
                onPress={() => setAddOpen(true)}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "#f0ddd2",
                  backgroundColor: "#fdf6f2",
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  marginRight: 8,
                }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>+ Add client</Text>
              </PressFade>
            ) : null}
            {live ? (
              confirmEnd ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {/* Names whose session it is. On a shared board the coach
                      tapping End is often not the coach running it. */}
                  {hubSession.coach_name && hubSession.coach_id !== profile?.id ? (
                    <Text style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: "#57534e", marginRight: 8 }}>
                      End {hubSession.coach_name.split(" ")[0]}'s session?
                    </Text>
                  ) : null}
                  <PressFade
                    onPress={handleEnd}
                    disabled={ending}
                    style={{
                      backgroundColor: "#b23a22",
                      borderRadius: 999,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      marginRight: 6,
                      opacity: ending ? 0.5 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "white" }}>{ending ? "Ending…" : "End it"}</Text>
                  </PressFade>
                  <PressFade onPress={() => setConfirmEnd(false)} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
                    <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted }}>Keep going</Text>
                  </PressFade>
                </View>
              ) : (
                <PressFade
                  onPress={() => setConfirmEnd(true)}
                  style={{ borderRadius: 999, borderWidth: 1, borderColor: CARD_BORDER, paddingHorizontal: 14, paddingVertical: 8 }}
                >
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.muted }}>End session</Text>
                </PressFade>
              )
            ) : null}
          </View>

          {pollError && live ? (
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: type.caption, color: "#8a5a2e", marginBottom: 8 }}>Reconnecting…</Text>
          ) : null}

          {stagingAside ? (
            <PressFade onPress={leaveStagingAside} style={{ marginBottom: 16, paddingVertical: 6 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>
                {live ? "‹ Back to the board" : "‹ Back to staged sessions"}
              </Text>
            </PressFade>
          ) : (
            <SegmentedControl segments={segments} activeKey={tab} onSelect={live ? setLiveTab : handleIdleTab} />
          )}

          {/* While a board runs this sits above the two live views, because
              "start the 6am" shouldn't depend on which of them you left open.
              Otherwise it IS the left tab, further down. */}
          {live && !stagingAside ? <StagedList {...stagedProps} /> : null}

          {hubSession === undefined ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : stagingAside ? (
            <StagePicker
              editing={editing}
              onChange={setSlots}
              onPreview={(row, session) => setPreview({ clientName: row.name, weekNumber: row.weekNumber, session })}
              initialSessionNumbers={initialSessionNumbers}
              onGoToStartNow={goToStartNow}
            />
          ) : live ? (
            tab === "overview" ? (
              <View style={{ marginTop: 6 }}>
                <Text style={{ fontFamily: fonts.sans, fontSize: type.body, lineHeight: 20, color: colors.muted, marginBottom: 12 }}>
                  Everyone on the board, block by block. Swipe between them.
                </Text>
                <PressFade
                  onPress={() => setDeck({ label: "On the board", targetDate: null, clients: liveDeckClients })}
                  disabled={!board || liveDeckClients.length === 0}
                  style={{
                    borderRadius: 14,
                    paddingVertical: 15,
                    alignItems: "center",
                    backgroundColor: colors.primary,
                    opacity: !board || liveDeckClients.length === 0 ? 0.5 : 1,
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "white" }}>
                    {board ? `Open block overview (${liveDeckClients.length})` : "Loading the board…"}
                  </Text>
                </PressFade>
              </View>
            ) : !board ? (
              <View style={{ paddingVertical: 40, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <View style={{ flex: 1, minHeight: 480 }}>
                <HubLiveSession
                  hub={hub}
                  authorId={profile?.id ?? null}
                  authorName={profile?.name?.split(" ")[0] ?? null}
                  scale="phone"
                  onDropClient={handleDropClient}
                />
              </View>
            )
          ) : tab === "staged" ? (
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: type.body, lineHeight: 20, color: colors.muted, marginBottom: 14 }}>
                Waiting on the board. Tap one to read everyone's block before they turn up.
              </Text>
              <StagedList {...stagedProps} showHeading={false} />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <StagePicker
                mode={tab === "start" ? "start" : "stage"}
                initialProgram={programParam}
                editing={tab === "stage" ? editing : null}
                onChange={setSlots}
                onPreview={(row, session) => setPreview({ clientName: row.name, weekNumber: row.weekNumber, session })}
                initialSessionNumbers={tab === "stage" ? initialSessionNumbers : null}
                onGoToStartNow={tab === "stage" ? goToStartNow : null}
              />
              {tab === "start" ? <HubPinCard /> : null}
            </View>
          )}
        </ScrollView>

        {showPicker ? (
          <StickyBar
            count={slots.length}
            label={stagingNow ? (editing ? "Save changes" : "Save session") : "Start live session"}
            busyLabel={stagingNow ? "Saving…" : "Starting…"}
            busy={stagingNow ? saving : starting}
            onPress={stagingNow ? () => setWhenOpen(true) : handleStartNow}
            hint={
              slots.length === 0
                ? "Pick a session for each client to add her."
                : stagingNow
                  ? "You'll pick the day and time next."
                  : null
            }
          />
        ) : null}

        <StageWhenSheet
          visible={whenOpen}
          onClose={() => setWhenOpen(false)}
          busy={saving}
          heading={editing ? "When is it?" : "When is it for?"}
          ctaLabel={editing ? "Save changes" : "Stage it"}
          busyLabel="Saving…"
          initial={
            editing
              ? {
                  scheduledDate: editing.scheduled_date,
                  scheduledTime: (editing.scheduled_time ?? "").slice(0, 5),
                  title: editing.title ?? "",
                }
              : null
          }
          onCreate={handleSaveStaged}
        />

        <HubSessionPreviewSheet visible={Boolean(preview)} onClose={() => setPreview(null)} target={preview} />

        <SpcSessionDeck
          visible={Boolean(deck)}
          onClose={() => setDeck(null)}
          clients={deck?.clients ?? []}
          targetDate={deck?.targetDate ?? null}
          label={deck?.label ?? "Reviewing"}
        />

        <HubAddClientModal
          visible={addOpen}
          onClose={() => setAddOpen(false)}
          onBoardUserIds={(hubSession?.clients ?? []).map((c) => c.user_id)}
          onAdded={async () => {
            setAddOpen(false);
            await handleStarted();
          }}
        />
      </View>
    </CoachShell>
  );
}
