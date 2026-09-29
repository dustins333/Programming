import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Platform } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { BottomTabBarHeightContext } from "expo-router/build/react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { T, MAX_WIDTH, GUTTER, Card, Eyebrow, shortDate, longDate, firstName, coachShort } from "../../../components/coach/strategy/ui";
import { dateInBoise, formatTimeInBoise, todayInBoise } from "../../../lib/boiseDate";
import { useKeyboardHeight } from "../../../lib/scrollToKeyboard";
import { getStrategySessionClient, pillarLabel, saveStrategySession, textStrategySession } from "../../../lib/programming/strategySessions";
import { bullet, CoachOnlyBox, SharedBox } from "../../../components/coach/strategy/SessionForm";
import { SavedDialog } from "../../../components/coach/strategy/SavedDialog";
import { fonts } from "../../../lib/theme";

// One client's strategy session: prep (a one-or-two sentence recap, the
// AI's suggested pillar, questions to ask, then the last write-up and
// history) on top; the session template and Save underneath. The template
// (components/coach/strategy/SessionForm) is Goal, Plan bullets and Notes,
// shared with the client, then a Coach only box with the pillar and
// coach-only notes. The coach must choose the pillar herself (the dropdown
// starts blank, the suggestion is only marked), and saving locks it in.
// Built from design_handoff_strategy_sessions_v1; see its README for every
// state.
//
// Save opens SavedDialog, which offers to text her a copy of the shared part
// whenever it changed since the last text. ?focus=coach (the day list's
// "Add coach notes") opens with coach-only notes out and focused, for the
// write-up a coach adds after the client has left.
//
// Loads in two steps so the page is usable at once: a cache-only call that
// never waits on the AI, then, only if her summary is missing or stale, a
// second call that writes it. The summary card shows a skeleton in between;
// everything else is already there.
//
// Kova is the source of truth, GLM (the UI's name for GoHighLevel) is
// downstream: a save that lands in Kova but not GLM still reads as SAVED,
// with a secondary line and a retry. It also retries on its own every 30s
// while this screen is open, and the day list retries any leftovers
// server-side, which is what "we'll keep trying on our own" means.

const RETRY_MS = 30_000;

function SkeletonBar({ width, height = 12, style }) {
  return <View style={{ width, height, borderRadius: 6, backgroundColor: T.inset, ...style }} />;
}

function TextLink({ children, onPress, disabled, style }) {
  return (
    <PressFade
      onPress={onPress}
      disabled={disabled}
      style={{ height: 44, justifyContent: "center", opacity: disabled ? 0.5 : 1, ...style }}
    >
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: T.clayText }}>{children}</Text>
    </PressFade>
  );
}

// "updated today 7:41 AM" / "updated Sept 22"
function updatedLabel(iso) {
  if (!iso) return null;
  const day = dateInBoise(new Date(iso));
  return day === todayInBoise() ? `updated today ${formatTimeInBoise(iso)}` : `updated ${shortDate(day)}`;
}

// Whether a write-up is long enough to need "Read full notes". Measuring
// rendered lines isn't reliable on web, so estimate: more than ~4 lines of
// text at this width, or more than 4 line breaks.
function isLong(text) {
  return (text ?? "").length > 200 || (text ?? "").split("\n").length > 4;
}

function SummaryCard({ data, loading, onRefresh }) {
  const s = data.summary;
  const noteSessions = data.sessions.filter((e) => e.kind === "strategy_session" && e.sources.includes("notes")).length;
  return (
    <View
      style={{
        backgroundColor: T.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: T.clayTintBorder,
        padding: 18,
        shadowColor: "#44403c",
        shadowOpacity: 0.045,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Eyebrow color={T.clayText} style={{ flex: 1 }}>
          Prep | summarized from notes
        </Eyebrow>
        <PressFade
          onPress={onRefresh}
          disabled={loading}
          accessibilityLabel="Refresh summary"
          style={{ height: 44, flexDirection: "row", alignItems: "center", gap: 5, paddingLeft: 10, opacity: loading ? 0.5 : 1 }}
        >
          <Ionicons name="refresh" size={15} color={T.clayText} />
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: T.clayText }}>Refresh</Text>
        </PressFade>
      </View>

      {loading ? (
        <View style={{ marginTop: 6 }}>
          <SkeletonBar width="92%" height={16} />
          <SkeletonBar width="70%" height={16} style={{ marginTop: 8 }} />
          <SkeletonBar width="40%" height={9} style={{ marginTop: 18 }} />
          <SkeletonBar width="55%" height={16} style={{ marginTop: 10 }} />
          <SkeletonBar width="85%" style={{ marginTop: 18 }} />
          <SkeletonBar width="75%" style={{ marginTop: 10 }} />
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: T.ink3, marginTop: 16 }}>
            Writing her summary. This can take a few seconds; everything below is ready now.
          </Text>
        </View>
      ) : !s ? (
        <View style={{ marginTop: 4 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: T.ink2 }}>
            Couldn't write a summary right now. Her last session and full history are below.
          </Text>
          <TextLink onPress={onRefresh} style={{ alignSelf: "flex-start" }}>
            Try again
          </TextLink>
        </View>
      ) : (
        <>
          {s.recap ? (
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 16.5, lineHeight: 24, color: T.ink, marginTop: 4 }}>{s.recap}</Text>
          ) : null}
          {s.pillar ? (
            <View style={{ marginTop: 16 }}>
              <Eyebrow>Suggested pillar</Eyebrow>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 15.5, color: T.clayText, marginTop: 6 }}>{pillarLabel(s.pillar)}</Text>
              {s.pillar_reason ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: T.ink2, marginTop: 3 }}>{s.pillar_reason}</Text>
              ) : null}
            </View>
          ) : null}
          {s.ask_about?.length ? (
            <View style={{ marginTop: 16, backgroundColor: T.clayTint, borderRadius: 14, padding: 14 }}>
              <Eyebrow color={T.clayText}>Ask about</Eyebrow>
              {s.ask_about.map((item, i) => (
                <View key={i} style={{ flexDirection: "row", marginTop: 7 }}>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, lineHeight: 21, color: T.clayText, width: 18 }}>?</Text>
                  <Text style={{ flex: 1, minWidth: 0, fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 21, color: T.ink }}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: T.ink4, marginTop: 14 }}>
            {[`From ${noteSessions} session${noteSessions === 1 ? "" : "s"} of notes`, updatedLabel(data.summary_generated_at)]
              .filter(Boolean)
              .join(" | ")}
          </Text>
        </>
      )}
    </View>
  );
}

function LastWriteUp({ note }) {
  const [open, setOpen] = useState(false);
  const long = isLong(note.text);
  return (
    <Card style={{ padding: 18 }}>
      <Eyebrow>{["Last session", longDate(note.date), note.coach_name ? coachShort(note.coach_name) : null].filter(Boolean).join(" | ")}</Eyebrow>
      <Text
        numberOfLines={open || !long ? undefined : 4}
        style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: T.ink, marginTop: 10 }}
      >
        {note.text}
      </Text>
      {long ? (
        <PressFade onPress={() => setOpen((o) => !o)} style={{ height: 48, justifyContent: "center", alignSelf: "flex-start", marginBottom: -8 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: T.clayText }}>{open ? "Show less ▴" : "Read full notes ▾"}</Text>
        </PressFade>
      ) : null}
    </Card>
  );
}

function History({ entries }) {
  const [openKey, setOpenKey] = useState(null);
  if (!entries.length) return null;
  return (
    <View>
      <Eyebrow>Session history</Eyebrow>
      <Card style={{ marginTop: 10 }}>
        {entries.map((e, i) => {
          const key = `${e.date}-${i}`;
          const hasNotes = !!e.note_text;
          const discovery = e.kind === "discovery_session";
          const open = openKey === key;
          return (
            <View key={key} style={{ borderBottomWidth: i === entries.length - 1 ? 0 : 1, borderBottomColor: T.border }}>
              <PressFade
                onPress={hasNotes ? () => setOpenKey(open ? null : key) : undefined}
                disabled={!hasNotes}
                style={{ minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: hasNotes ? T.ink : T.ink4 }}>
                  {shortDate(e.date)}, {e.date.slice(0, 4)}
                </Text>
                {discovery || e.coach_name ? (
                  <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: T.ink3, marginLeft: 8, flexShrink: 1 }}>
                    {[discovery ? "Discovery session" : null, e.coach_name ? coachShort(e.coach_name) : null].filter(Boolean).join(" | ")}
                  </Text>
                ) : null}
                <View style={{ flex: 1 }} />
                {hasNotes ? (
                  <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={15} color={T.ink4} />
                ) : (
                  <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: T.ink4 }}>Booked, no notes</Text>
                )}
              </PressFade>
              {open ? (
                <View style={{ marginHorizontal: 12, marginBottom: 12, padding: 14, borderRadius: 14, backgroundColor: T.inset }}>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: T.ink }}>{e.note_text}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>
    </View>
  );
}

function SavedCard({ saved, name, onRetry, retrying, textedAt, onText }) {
  const time = formatTimeInBoise(saved.at);
  return (
    <View style={{ borderWidth: 2, borderColor: T.olive, borderRadius: 18, backgroundColor: T.card, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <View style={{ width: 30, height: 30, borderRadius: 999, backgroundColor: T.olive, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 15, color: T.olive }}>
            {saved.synced ? `Saved at ${time}` : `Saved in Kova at ${time}`}
          </Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: T.ink2, marginTop: 2 }}>
            {saved.synced ? `In GLM. ${name}'s moved to Completed.` : `${name}'s in Completed and her notes are safe.`}
          </Text>
          {textedAt ? (
            <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: T.ink2, marginTop: 2 }}>
              {`Texted to ${name} at ${formatTimeInBoise(textedAt)}.`}
            </Text>
          ) : null}
          {onText ? (
            <PressFade onPress={onText} style={{ alignSelf: "flex-start", height: 40, justifyContent: "center" }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: T.clayText }}>
                {textedAt ? `Text ${name} the updated copy` : `Text ${name} a copy`}
              </Text>
            </PressFade>
          ) : null}
        </View>
      </View>
      {!saved.synced ? (
        <View
          style={{
            marginTop: 12,
            backgroundColor: T.needsBg,
            borderRadius: 12,
            paddingLeft: 12,
            paddingVertical: 6,
            paddingRight: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Text style={{ flex: 1, minWidth: 0, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: T.needsText }}>
            Not in GLM yet. We'll keep trying on our own.
          </Text>
          <PressFade
            onPress={onRetry}
            disabled={retrying}
            style={{
              height: 44,
              paddingHorizontal: 14,
              borderRadius: 10,
              backgroundColor: T.card,
              justifyContent: "center",
              opacity: retrying ? 0.5 : 1,
            }}
          >
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: T.clayText }}>{retrying ? "Retrying…" : "Retry now"}</Text>
          </PressFade>
        </View>
      ) : null}
    </View>
  );
}

// Everything that's saved, in one comparable shape: what "dirty" and
// "unchanged since the save" compare.
function snapshot({ goal, plan, clientNotes, coachNotes, pillar }) {
  return JSON.stringify([goal.trim(), plan.map((b) => b.text.trim()).filter(Boolean), clientNotes.trim(), coachNotes.trim(), pillar]);
}

export default function StrategyClient() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const contactId = String(params.contactId ?? "");
  const today = todayInBoise();
  const date = typeof params.date === "string" && params.date ? params.date : today;
  const isFuture = date > today;

  const [state, setState] = useState({ status: "loading" });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState(() => [bullet()]);
  const [clientNotes, setClientNotes] = useState("");
  const [coachNotes, setCoachNotes] = useState("");
  const focusCoach = params.focus === "coach";
  const [showCoachNotes, setShowCoachNotes] = useState(focusCoach);
  // Focus coach notes only when asked for (the day list's button, or the
  // "+ Add coach-only notes" tap), never just because some already exist.
  const [focusCoachNotes, setFocusCoachNotes] = useState(focusCoach);
  const [showMissing, setShowMissing] = useState(false);
  const [pillar, setPillar] = useState(null);
  const [pillarMissing, setPillarMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [saveError, setSaveError] = useState(null);
  // { at, synced, snap } for a save made during THIS visit.
  const [saved, setSaved] = useState(null);
  // The saved session's id and text state: { id, textedAt, textedBody,
  // preview }. preview is the text she'd get for what's saved now.
  const [session, setSession] = useState(null);
  const [dialog, setDialog] = useState(null);
  const coachBoxRef = useRef(null);
  // today_session as it was when the screen loaded: a save made earlier.
  const [earlier, setEarlier] = useState(null);
  const notesSeeded = useRef(false);

  const keyboardHeight = useKeyboardHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;

  const fetchFull = useCallback(
    async (refresh) => {
      setSummaryLoading(true);
      try {
        const data = await getStrategySessionClient({ ghlContactId: contactId, date: date !== today ? date : undefined, refresh });
        setState({ status: "ready", data });
      } catch (err) {
        console.error("Strategy session: summary failed", err);
        setState((prev) => (prev.status === "ready" ? { ...prev, data: { ...prev.data, summary: null, summary_pending: false } } : prev));
      } finally {
        setSummaryLoading(false);
      }
    },
    [contactId, date, today]
  );

  const load = useCallback(async () => {
    try {
      const data = await getStrategySessionClient({ ghlContactId: contactId, date: date !== today ? date : undefined, cachedOnly: true });
      setState({ status: "ready", data });
      if (!notesSeeded.current) {
        notesSeeded.current = true;
        const t = data.today_session;
        if (t) {
          if (t.goal) {
            setGoal(t.goal);
            setPlan(t.plan?.length ? t.plan.map((x) => bullet(x)) : [bullet()]);
            setClientNotes(t.client_notes ?? "");
          } else {
            // Saved before the template: its free text lands in Notes, and
            // Goal and Plan wait to be filled in on the next save.
            setClientNotes(t.notes ?? "");
          }
          setCoachNotes(t.coach_notes ?? "");
          if (t.coach_notes) setShowCoachNotes(true);
          setPillar(t.pillar ?? null);
          setEarlier({ at: t.saved_at, synced: t.ghl_synced });
          setSession({ id: t.id, textedAt: t.texted_at, textedBody: t.texted_body, preview: null });
        }
      }
      if (data.summary_pending) fetchFull(false);
    } catch (err) {
      console.error("Strategy session: failed to load", err);
      setState({ status: "error", message: err.message ?? String(err) });
    }
  }, [contactId, date, today, fetchFull]);

  useFocusEffect(
    useCallback(() => {
      if (state.status !== "ready") load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  const fields = { goal, plan, clientNotes, coachNotes, pillar };
  const snap = snapshot(fields);
  const ready = !!goal.trim() && plan.some((b) => b.text.trim()) && !!pillar;

  // A copy is worth offering when what she'd get differs from what she was
  // last sent (or she was never sent one). An edit to coach-only fields
  // leaves the preview unchanged, so it offers nothing.
  const offerFor = (s) => !!s?.preview && s.preview !== s.textedBody;

  const save = useCallback(
    async ({ silent = false } = {}) => {
      // Tappable with fields missing on purpose: say what's missing rather
      // than leave a button that looks ready and does nothing.
      if (!ready) {
        setShowMissing(true);
        if (!pillar) setPillarMissing(true);
        return;
      }
      silent ? setRetrying(true) : setSaving(true);
      setSaveError(null);
      try {
        const res = await saveStrategySession({
          ghlContactId: contactId,
          goal,
          plan: plan.map((b) => b.text),
          clientNotes,
          coachNotes,
          pillar,
          appointmentId: state.data?.today_booking?.appointment_id,
          heldOn: date !== today ? date : undefined,
        });
        const synced = !!res.ghl_synced;
        const next = {
          id: res.session?.id,
          textedAt: res.session?.texted_at ?? null,
          textedBody: res.session?.texted_body ?? null,
          preview: res.text_preview ?? null,
        };
        setSaved({ at: res.session?.updated_at ?? new Date().toISOString(), synced, snap });
        setSession(next);
        if (!silent) setDialog({ synced, offer: offerFor(next), preview: next.preview, textedAt: next.textedAt, sending: false, error: null });
      } catch (err) {
        if (!silent) setSaveError(err.message ?? "Couldn't save. Try again.");
      } finally {
        silent ? setRetrying(false) : setSaving(false);
      }
    },
    [ready, goal, plan, clientNotes, coachNotes, pillar, snap, contactId, state.data, date, today]
  );

  const sendText = async () => {
    if (!session?.id) return;
    setDialog((d) => d && { ...d, sending: true, error: null });
    try {
      const res = await textStrategySession(session.id);
      setSession((s) => ({ ...s, textedAt: res.texted_at, textedBody: res.texted_body }));
      setDialog(null);
    } catch (err) {
      setDialog((d) => d && { ...d, sending: false, error: err.message ?? "The text didn't send." });
    }
  };

  // Keep trying GLM on our own while the screen is open, as long as
  // nothing's been edited since the save (an edit waits for Save).
  const unsynced = saved && !saved.synced && saved.snap === snap;
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!unsynced) return undefined;
    const id = setInterval(() => saveRef.current({ silent: true }), RETRY_MS);
    return () => clearInterval(id);
  }, [unsynced]);

  // Arriving from "Add coach notes": bring the Coach only box into view once
  // the page has rendered (web; the coach app is used as a PWA).
  const isReady = state.status === "ready";
  useEffect(() => {
    if (!isReady || !focusCoach || Platform.OS !== "web") return undefined;
    const id = setTimeout(() => coachBoxRef.current?.scrollIntoView?.({ block: "center" }), 150);
    return () => clearTimeout(id);
  }, [isReady, focusCoach]);

  const backToToday = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: "/(coach)/strategy", params: date !== today ? { date } : {} });

  if (state.status !== "ready") {
    return (
      <CoachShell>
        <View style={{ flex: 1, backgroundColor: T.canvas, padding: GUTTER }}>
          <View style={{ width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center" }}>
            <TextLink onPress={backToToday} style={{ alignSelf: "flex-start" }}>
              ‹ Today
            </TextLink>
            {state.status === "loading" ? (
              <ActivityIndicator color={T.clay} style={{ marginTop: 48 }} />
            ) : (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: T.ink2 }}>
                  Couldn't load this client. {state.message}
                </Text>
                <TextLink onPress={load} style={{ alignSelf: "flex-start" }}>
                  Try again
                </TextLink>
              </View>
            )}
          </View>
        </View>
      </CoachShell>
    );
  }

  const data = state.data;
  const name = data.client.name ?? "This client";
  const first = firstName(name) || "She";
  const booking = data.today_booking;
  const past = data.sessions.filter((e) => e.date < date);
  const hasAnyNotes = past.some((e) => e.note_text);
  // Everything except the write-up already shown in its own card. That's the
  // latest session WITH notes, which isn't always the latest session: a
  // booking with no write-up can come after it, and belongs in history.
  const shownIndex = past.findIndex((e) => e.note_text && e.kind === "strategy_session");
  const history = past.filter((_, i) => i !== shownIndex);
  const showSummaryCard = data.note_count > 0 || data.summary || summaryLoading;

  const dirty = !saved || saved.snap !== snap;
  const hasSaved = !!saved || !!earlier;
  const canSave = ready;
  const showBack = saved && !dirty;
  const kbPad = Platform.OS === "ios" ? Math.max(0, keyboardHeight - tabBarHeight) : 0;

  return (
    <CoachShell>
      <View style={{ flex: 1, backgroundColor: T.canvas, paddingBottom: kbPad }}>
        <ScrollView className="flex-1" contentContainerStyle={{ padding: GUTTER, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center" }}>
            <TextLink onPress={backToToday} style={{ alignSelf: "flex-start" }}>
              ‹ {date === today ? "Today" : shortDate(date)}
            </TextLink>

            {/* Header */}
            <View
              style={{
                alignSelf: "flex-start",
                marginTop: 2,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: booking ? T.clayTint : T.greyPill,
                borderWidth: booking ? 1 : 0,
                borderColor: T.clayTintBorder,
              }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1, color: booking ? T.clayText : T.ink2 }}>
                {booking
                  ? `${formatTimeInBoise(booking.starts_at)} | BOOKED${booking.coach_name ? ` WITH ${coachShort(booking.coach_name).toUpperCase()}` : ""}`
                  : "UNSCHEDULED"}
              </Text>
            </View>
            <Text style={{ fontFamily: fonts.display, fontSize: 30, color: T.clay, marginTop: 8 }}>{name}</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: T.ink3, marginTop: 2 }}>
              {data.last_session
                ? `Last session: ${longDate(data.last_session.date)}${data.last_session.coach_name ? ` with ${coachShort(data.last_session.coach_name)}` : ""}`
                : summaryLoading
                  ? " "
                  : "No sessions on record"}
            </Text>

            {/* Prep */}
            <View style={{ marginTop: 16, gap: 14 }}>
              {showSummaryCard ? (
                <SummaryCard data={data} loading={summaryLoading} onRefresh={() => fetchFull(true)} />
              ) : (
                <View style={{ borderWidth: 2, borderStyle: "dashed", borderColor: T.dashed, borderRadius: 18, padding: 20 }}>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: T.ink }}>First strategy session</Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: T.ink2, marginTop: 6 }}>
                    No notes yet, so there's nothing to summarize. Start with her goals, training history and anything she wants you to know.
                  </Text>
                </View>
              )}

              {hasAnyNotes && data.last_note ? <LastWriteUp note={data.last_note} /> : null}
              {hasAnyNotes ? <History entries={history} /> : null}
            </View>

            {/* Today's notes */}
            <View style={{ marginTop: 22 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Eyebrow color={T.clayText} style={{ flex: 1 }}>
                  {date === today ? "Today's notes" : `Notes for ${shortDate(date)}`}
                </Eyebrow>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: T.ink4 }}>{shortDate(date)} | you</Text>
              </View>

              {isFuture ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: T.ink2, marginTop: 10 }}>
                  Notes open on the day of the session.
                </Text>
              ) : (
                <>
                  {earlier && !saved ? (
                    <View style={{ marginTop: 10, backgroundColor: T.oliveTint, borderRadius: 14, padding: 12 }}>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: T.olive }}>
                        {`You saved this session${earlier.at ? ` at ${formatTimeInBoise(earlier.at)}` : ""}. Edits update the same session, not a new one.`}
                      </Text>
                    </View>
                  ) : null}
                  <View style={{ marginTop: 10, gap: 14 }}>
                    <SharedBox
                      first={first}
                      goal={goal}
                      onGoal={setGoal}
                      plan={plan}
                      onPlan={setPlan}
                      clientNotes={clientNotes}
                      onClientNotes={setClientNotes}
                      showMissing={showMissing}
                      disabled={saving}
                    />
                    <CoachOnlyBox
                      ref={coachBoxRef}
                      first={first}
                      pillar={pillar}
                      onPillar={(v) => {
                        setPillar(v);
                        setPillarMissing(false);
                      }}
                      suggested={data.summary?.pillar}
                      pillarMissing={pillarMissing}
                      coachNotes={coachNotes}
                      onCoachNotes={setCoachNotes}
                      showCoachNotes={showCoachNotes}
                      onShowCoachNotes={() => {
                        setFocusCoachNotes(true);
                        setShowCoachNotes(true);
                      }}
                      autoFocusCoachNotes={focusCoachNotes}
                      disabled={saving}
                    />
                  </View>
                  {saved ? (
                    <View style={{ marginTop: 14 }}>
                      <SavedCard
                        saved={saved}
                        name={first}
                        retrying={retrying}
                        onRetry={() => save({ silent: true })}
                        textedAt={session?.textedAt}
                        onText={
                          !dirty && offerFor(session) && state.data.client.texting?.ok !== false
                            ? () => setDialog({ synced: saved.synced, offer: true, preview: session.preview, textedAt: session.textedAt, sending: false, error: null })
                            : null
                        }
                      />
                    </View>
                  ) : null}
                  {saveError ? (
                    <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#b23a22", marginTop: 10 }}>{saveError}</Text>
                  ) : null}
                </>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Save bar */}
        {!isFuture ? (
          <View style={{ borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.canvas, paddingHorizontal: GUTTER, paddingVertical: 12 }}>
            <View style={{ width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center" }}>
              {showBack ? (
                <PressFade
                  onPress={backToToday}
                  style={{
                    height: 56,
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderColor: T.clayTintBorder,
                    backgroundColor: T.card,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: T.clayText }}>Back to today</Text>
                </PressFade>
              ) : (
                <PressFade
                  onPress={() => save()}
                  disabled={!canSave || saving}
                  style={{
                    height: 56,
                    borderRadius: 16,
                    backgroundColor: T.clay,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: saving ? 0.6 : canSave ? 1 : 0.45,
                    shadowColor: T.clay,
                    shadowOpacity: canSave ? 0.28 : 0,
                    shadowRadius: 20,
                    shadowOffset: { width: 0, height: 8 },
                  }}
                >
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#fff" }}>
                    {saving ? "Saving…" : hasSaved ? "Save changes" : "Save session"}
                  </Text>
                </PressFade>
              )}
            </View>
          </View>
        ) : null}
      </View>
      <SavedDialog dialog={dialog} first={first} texting={data.client.texting} onYes={sendText} onClose={() => setDialog(null)} />
    </CoachShell>
  );
}
