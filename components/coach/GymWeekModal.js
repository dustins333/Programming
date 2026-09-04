import { Modal, View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { SessionRow } from "../RecentSessionsCard";
import { PressFade } from "../PressFade";
import { formatTimeInBoise } from "../../lib/boiseDate";
import { formatDateMD } from "../../lib/formatDate";
import { fonts, colors } from "../../lib/theme";

// The sheet behind every tile on the mobile pulse band. One component, four
// tiles, because four near-identical modals is how two of them end up
// disagreeing with the numbers above them.
//
// It renders rows it is HANDED — the dashboard already loaded them to draw
// the counts (see gymWeek.js). Nothing is fetched here, so the number on the
// tile and the length of this list are the same array, not two queries that
// happen to agree today.

function initials(name) {
  return (name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function PersonRow({ person, subtitle, tone, onPress }) {
  return (
    <PressFade
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#f3efe9" }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 99,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: tone === "warn" ? "#fdf1ea" : "#f3f6ef",
          borderWidth: 1,
          borderColor: tone === "warn" ? "#e8c4b8" : "#d9e3cd",
        }}
      >
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: tone === "warn" ? colors.primaryOnWhite : "#4d6142" }}>
          {initials(person.name)}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14.5, color: "#292524" }}>
          {person.name}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted, marginTop: 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#c9c4bd" />
    </PressFade>
  );
}

function seenSubtitle(p) {
  if (p.startedOnly) return "Trained, not finalized yet";
  return `${p.sessions} ${p.sessions === 1 ? "session" : "sessions"} this week`;
}

function notSeenSubtitle(p) {
  if (p.daysSince == null) return "No finished session on record";
  if (p.daysSince === 0) return "Last in today";
  if (p.daysSince === 1) return "Last in yesterday";
  return `Last in ${formatDateMD(p.lastDate)}, ${p.daysSince} days ago`;
}

export function GymWeekModal({ visible, onClose, view, week }) {
  const router = useRouter();
  if (!view) return null;

  const open = (userId) => {
    onClose();
    router.push(`/(coach)/clients/${userId}`);
  };

  const spec = {
    sessionsToday: {
      eyebrow: "SESSIONS TODAY",
      count: week?.sessionsToday.length,
      note: "Finalized today. A session still being logged shows up once she taps Finalize.",
    },
    sessionsWeek: {
      eyebrow: "SESSIONS THIS WEEK",
      count: week?.sessions.length,
      note: "Finalized since Monday.",
    },
    membersWeek: {
      eyebrow: "GIRLS IN THIS WEEK",
      count: week?.seen.length,
      note: "Anyone who trained since Monday, whether or not she finalized.",
    },
    membersNotSeen: {
      eyebrow: "GIRLS NOT IN THIS WEEK",
      count: week?.notSeen.length,
      note: "On a training program, nothing logged since Monday. Longest gone first.",
    },
  }[view];

  const rows = () => {
    if (!week) return null;
    if (view === "sessionsToday" || view === "sessionsWeek") {
      const list = view === "sessionsToday" ? week.sessionsToday : week.sessions;
      if (list.length === 0) return <Empty text="Nothing finalized yet." />;
      return list.map((session) => (
        <SessionRow
          key={session.id}
          userId={session.userId}
          session={session}
          title={session.userName}
          avatarName={session.userName}
          subtitle={[
            view === "sessionsToday" ? formatTimeInBoise(session.completedAt) : formatDateMD(session.date),
            session.label,
            session.sessionTitle,
          ]
            .filter(Boolean)
            .join(" · ")}
          onOpenClient={() => open(session.userId)}
        />
      ));
    }
    const list = view === "membersWeek" ? week.seen : week.notSeen;
    if (list.length === 0) {
      return <Empty text={view === "membersWeek" ? "Nobody in yet this week." : "Everyone's been in. Good week."} />;
    }
    return list.map((person) => (
      <PersonRow
        key={person.userId}
        person={person}
        tone={view === "membersWeek" ? (person.startedOnly ? "warn" : "ok") : "warn"}
        subtitle={view === "membersWeek" ? seenSubtitle(person) : notSeenSubtitle(person)}
        onPress={() => open(person.userId)}
      />
    ));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(68,64,60,0.35)", alignItems: "center", justifyContent: "center", padding: 16 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ width: "100%", maxWidth: 560, maxHeight: "86%", backgroundColor: "#fff", borderRadius: 18, overflow: "hidden" }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: "#ece7e1",
            }}
          >
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 11, letterSpacing: 1, color: "#a8a29e" }}>{spec.eyebrow}</Text>
              <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.primaryOnWhite, marginTop: 3 }}>
                {spec.count ?? "–"}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: colors.muted, marginTop: 2 }}>{spec.note}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#a8a29e" />
            </Pressable>
          </View>

          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 18 }}>
            {week ? rows() : <Empty text="Couldn't load this week." />}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Empty({ text }) {
  return (
    <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted, paddingVertical: 22, textAlign: "center" }}>{text}</Text>
  );
}
