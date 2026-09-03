import { View, Text, Pressable } from "react-native";
import { STATUS_META } from "../../lib/nutrition/rosterStatus";
import { weekOnProgram } from "../../lib/nutrition/queue";
import { dateInBoise, daysBetween } from "../../lib/boiseDate";
import { CheckinCallPill } from "./CheckinCallPill";
import { fonts, colors } from "../../lib/theme";

// The Nutrition queue's left rail (coach web v2, screen 17).
//
// A status is a group HEADER when it's open and a one-line count when it
// isn't. Collapsed rows still carry their dot and number, which is the whole
// reason they stay on screen rather than hiding behind a filter dropdown: a
// coach should be able to see that four people haven't checked in without
// leaving the six who have.

const STATUS_DOT = {
  readyForCheckin: "#8a5a2e",
  checkinPending: "#b23a22",
  checkinCompleted: "#4d6142",
  checkinClosed: "#a8a29e",
  otSetup: "#8a5a2e",
  otInProgress: "#4d6142",
  readyForReview: "#8a5a2e",
  needsTarget: "#8a5a2e",
  paused: "#a8a29e",
};

function initials(name) {
  return (name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

// Shared by subline and the booked-call line so the two can't word the week
// differently on rows sitting one directly above the other.
function weekPart(client, today) {
  const week = weekOnProgram(client.startDate, today);
  return week ? `· week ${week}` : "";
}

// One line per client, phrased for the status she's actually in — a waiting
// check-in wants "how long has this been sitting", an onboarding client
// wants "which step".
function subline(client, today) {
  const week = weekPart(client, today);
  const weekSuffix = week ? ` ${week}` : "";

  if (client.rosterStatus === "readyForCheckin") {
    const days = client.checkinSubmittedAt ? daysBetween(today, dateInBoise(new Date(client.checkinSubmittedAt))) : null;
    const waited = days === null ? "Waiting" : days <= 0 ? "Waiting today" : `Waiting ${days} day${days === 1 ? "" : "s"}`;
    return `${waited}${weekSuffix}`;
  }
  if (client.rosterStatus === "checkinPending") return `Nothing in yet${weekSuffix}`;
  if (client.rosterStatus === "checkinCompleted") return `Reviewed${weekSuffix}`;
  if (client.rosterStatus === "checkinClosed") return `Closed out, nothing came in${weekSuffix}`;
  if (client.rosterStatus === "otSetup") return "Waiting on you to send it";
  if (client.rosterStatus === "otInProgress")
    return client.trackingDatesCount
      ? `${client.trackingLoggedCount} of ${client.trackingDatesCount} tracking days logged`
      : "Working through onboarding";
  if (client.rosterStatus === "readyForReview") return "Ready for your review";
  if (client.rosterStatus === "needsTarget") return "No target set yet";
  if (client.rosterStatus === "paused") return "Paused";
  return "";
}

function ClientRow({ client, today, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: "#f6f3ef",
        backgroundColor: selected ? "#fdf6f2" : "transparent",
        borderLeftWidth: 3,
        borderLeftColor: selected ? colors.primary : "transparent",
      }}
    >
      <View className="items-center justify-center rounded-full" style={{ width: 32, height: 32, backgroundColor: "#f4ede7", flexShrink: 0 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: colors.primaryOnWhite }}>{initials(client.name)}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: selected ? fonts.sansBold : fonts.sansSemiBold, fontSize: 13.5, color: "#2a211c" }}>
          {client.name}
        </Text>
        {/* A booked call TAKES the second line rather than sitting beside
            the waiting count, because "Waiting 3 days" is the thing that
            was misleading: a client with a call on the calendar is not
            waiting on anybody. The week still shows, since that is the one
            part of the old line that stays true either way. */}
        {client.checkinBooking ? (
          <View className="flex-row items-center" style={{ gap: 6, marginTop: 2, minWidth: 0 }}>
            <CheckinCallPill booking={client.checkinBooking} today={today} />
            {weekPart(client, today) ? (
              <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", flexShrink: 0 }}>
                {weekPart(client, today)}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e", marginTop: 1 }}>
            {subline(client, today)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// A status is a header when it's open and a one-line count when it isn't.
// Collapsed rows still carry the dot and the number, which is the whole
// reason they're worth keeping on screen rather than hiding behind a filter.
function StatusGroup({ status, clients, open, onToggle, selectedUserId, onSelect, today }) {
  const meta = STATUS_META[status];
  return (
    <View>
      <Pressable
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderBottomWidth: 1,
          borderBottomColor: "#ece7e1",
          backgroundColor: open ? "#faf8f6" : "white",
        }}
      >
        <View className="flex-row items-center" style={{ gap: 8, flex: 1, minWidth: 0 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: STATUS_DOT[status] ?? "#a8a29e" }} />
          <Text
            numberOfLines={1}
            style={{ fontFamily: open ? fonts.sansBold : fonts.sansMedium, fontSize: 13, color: open ? colors.primaryOnWhite : "#57534e" }}
          >
            {meta.label}
          </Text>
        </View>
        <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: open ? "#f4ddd2" : "#f4f1ec" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 11, color: open ? "#8a5140" : "#a8a29e" }}>{clients.length}</Text>
        </View>
      </Pressable>

      {open
        ? clients.map((client) => (
            <ClientRow
              key={client.userId}
              client={client}
              today={today}
              selected={client.userId === selectedUserId}
              onPress={() => onSelect(client)}
            />
          ))
        : null}
    </View>
  );
}

export { StatusGroup, subline };
