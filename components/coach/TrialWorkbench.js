import { View, Text, ActivityIndicator } from "react-native";
import { formatDateMD } from "../../lib/formatDate";
import { daysBetween } from "../../lib/boiseDate";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

// The trial bench, in place of the week grid on the Group Programs page for
// a program flagged is_trial (migration 0134). Deliberately shows no block,
// no week number and no length: a coach building the next block thinks in
// "the three sessions", and the block underneath is bookkeeping (see
// lib/programming/trial.js for why it still is one).

const CARD_BORDER = "#ece7e1";

function LiftRow({ lift, previous }) {
  // A superset reads as one thing, so its rows share a left rule rather than
  // repeating a badge on each.
  const joined = lift.superset_group_id && previous?.superset_group_id === lift.superset_group_id;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        gap: 8,
        paddingVertical: 4,
        paddingLeft: lift.superset_group_id ? 9 : 0,
        borderLeftWidth: lift.superset_group_id ? 2 : 0,
        borderLeftColor: "#e3ead9",
        marginTop: joined ? 0 : 2,
      }}
    >
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.sans, fontSize: 13, color: "#2a211c" }}>
        {lift.exercises?.name ?? "Unknown exercise"}
      </Text>
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: "#78716c" }}>
        {lift.sets}x{lift.reps}
      </Text>
    </View>
  );
}

function SessionCard({ session, index, width, onOpen }) {
  const empty = session.lifts.length === 0;
  return (
    <View style={{ width, backgroundColor: "#fff", borderWidth: 1, borderColor: CARD_BORDER, borderRadius: 14, padding: 16 }}>
      <Text style={{ fontFamily: fonts.sansBold, fontSize: 9.5, letterSpacing: 1.2, color: "#a8a29e" }}>
        SESSION {index}
      </Text>
      <Text numberOfLines={2} style={{ fontFamily: fonts.display, fontSize: 17, color: "#2a211c", marginTop: 5 }}>
        {session.title || "Untitled"}
      </Text>
      {session.summary.warmupCount > 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 3 }}>
          {session.summary.warmupCount} warm-up {session.summary.warmupCount === 1 ? "move" : "moves"}
        </Text>
      ) : null}

      <View style={{ marginTop: 10, marginBottom: 12 }}>
        {empty ? (
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#a8a29e" }}>Nothing in it yet</Text>
        ) : (
          session.lifts.map((lift, i) => <LiftRow key={lift.id} lift={lift} previous={session.lifts[i - 1]} />)
        )}
      </View>

      <PressFade
        onPress={onOpen}
        style={{
          alignSelf: "flex-start",
          borderWidth: 1,
          borderColor: "#d9d4cd",
          borderRadius: 8,
          paddingVertical: 8,
          paddingHorizontal: 14,
          backgroundColor: "#fff",
        }}
      >
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>
          {empty ? "Build it" : "Edit"}
        </Text>
      </PressFade>
    </View>
  );
}

function Banner({ children, tone = "neutral", action }) {
  const bg = tone === "closing" ? "#f6efe4" : "#fff";
  const border = tone === "closing" ? "#e4d6bd" : CARD_BORDER;
  return (
    <View
      style={{
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 18,
        marginBottom: 18,
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <View style={{ flex: 1, minWidth: 240 }}>{children}</View>
      {action}
    </View>
  );
}

export function TrialWorkbench({ state, program, today, busy, onOpenSession, onPush, onStartTrial, onEndTrial, showing, onShow }) {
  if (!state) {
    return (
      <View style={{ paddingVertical: 40, alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const showingNext = showing === "next" && state.next;
  const active = showingNext ? state.next : state.current;
  const columnWidth = 300;

  if (!active) {
    return (
      <View
        style={{
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: "#d6d1ca",
          borderRadius: 16,
          paddingVertical: 42,
          alignItems: "center",
          paddingHorizontal: 24,
        }}
      >
        <Text style={{ fontFamily: fonts.display, fontSize: 20, color: "#2a211c" }}>No trial on the bench</Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: "#78716c", marginTop: 6, textAlign: "center" }}>
          Start one and build the {program.sessions_per_week} sessions you want to try out. Change them as you go, then
          push the whole thing to a group when it's ready.
        </Text>
        <PressFade
          onPress={onStartTrial}
          disabled={busy}
          style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 22, opacity: busy ? 0.5 : 1 }}
        >
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>
            {busy ? "Starting…" : `Start a trial (${formatDateMD(state.nextAvailableMonday)})`}
          </Text>
        </PressFade>
      </View>
    );
  }

  const daysLeft = daysBetween(active.block.block_end_date, today);
  const built = active.sessions.some((s) => s.lifts.length > 0);

  return (
    <View>
      {state.current && state.next ? (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          {[
            { key: "current", label: "On the bench now" },
            { key: "next", label: `Next trial · ${formatDateMD(state.next.block.block_start_date)}` },
          ].map((tab) => {
            const on = (showing === "next" ? "next" : "current") === tab.key;
            return (
              <PressFade
                key={tab.key}
                onPress={() => onShow(tab.key)}
                style={{
                  borderWidth: 1,
                  borderColor: on ? colors.primary : "#d9d4cd",
                  backgroundColor: on ? colors.primary : "#fff",
                  borderRadius: 99,
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: on ? "#fff" : "#57534e" }}>{tab.label}</Text>
              </PressFade>
            );
          })}
        </View>
      ) : null}

      <Banner
        tone={active.closing && !showingNext ? "closing" : "neutral"}
        action={
          <View style={{ flexDirection: "row", gap: 10 }}>
            {active.closing && !showingNext && !state.next ? (
              <PressFade
                onPress={onStartTrial}
                disabled={busy}
                style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 11, paddingHorizontal: 16, backgroundColor: "#fff", opacity: busy ? 0.5 : 1 }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>Start the next one</Text>
              </PressFade>
            ) : null}
            {!active.closing && !showingNext ? (
              <PressFade
                onPress={onEndTrial}
                disabled={busy}
                style={{ borderWidth: 1, borderColor: "#d9d4cd", borderRadius: 9, paddingVertical: 11, paddingHorizontal: 16, backgroundColor: "#fff", opacity: busy ? 0.5 : 1 }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12.5, color: "#44403c" }}>End this trial</Text>
              </PressFade>
            ) : null}
            <PressFade
              onPress={onPush}
              disabled={busy || !built}
              style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 12, paddingHorizontal: 20, opacity: busy || !built ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: "#fff" }}>Push to…</Text>
            </PressFade>
          </View>
        }
      >
        <Text style={{ fontFamily: fonts.display, fontSize: 20, color: "#2a211c" }}>
          {showingNext ? "Next trial" : "On the bench"}
        </Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#78716c", marginTop: 4 }}>
          {showingNext
            ? `Starts ${formatDateMD(active.block.block_start_date)}. Build it now, it goes live that Monday.`
            : active.closing
              ? `Pushed already, so this one finishes ${formatDateMD(active.block.block_end_date)}${daysLeft >= 0 ? ` (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)` : ""}.`
              : `Running since ${formatDateMD(active.block.block_start_date)}. It carries on week to week until you push it.`}
        </Text>
      </Banner>

      <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.3, color: "#a8a29e", marginBottom: 12 }}>
        SESSIONS
      </Text>
      <View style={{ flexDirection: "row", gap: 14, flexWrap: "wrap" }}>
        {active.sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            index={session.session_number}
            width={columnWidth}
            onOpen={() => onOpenSession(session)}
          />
        ))}
      </View>
    </View>
  );
}
