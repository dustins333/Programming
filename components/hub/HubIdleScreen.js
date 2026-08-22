import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { getHubIdleStats } from "../../lib/programming/hub";
import { fonts, colors } from "../../lib/theme";

// What is on the wall most of the day. A big clock and the date, one number
// for the gym's week, and a rotating list of recent bests. No dashboard, no
// calls to action, no logo wall — and no instructions either: the handoff put
// a "a coach starts this from their phone" line down here, but the coaches
// already know, and it was the one piece of admin copy on a screen the whole
// gym looks at (dropped at Terra's call, 2026-08-22).
//
// Recent bests are member first names and numbers on a screen in a shared
// room, so they are OFF unless an admin turns them on (Settings → Equipment
// → Gym display). The gate is enforced inside programming.hub_idle_stats(),
// not here: when it is off the board never receives a client's name at all.

const ROTATE_MS = 20000;
const PAGE = 3;
const STATS_REFRESH_MS = 10 * 60 * 1000;

function StatCard({ children, tone = "white", style }) {
  return (
    <View
      style={{
        borderRadius: 20,
        backgroundColor: tone === "peach" ? "#fdf6f2" : "white",
        borderWidth: 1,
        borderColor: tone === "peach" ? "#f0ddd2" : "#ece7e1",
        paddingHorizontal: 26,
        paddingVertical: 22,
        shadowColor: "#44403c",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        ...style,
      }}
    >
      {children}
    </View>
  );
}

function bestValue(best) {
  if (best.tracks_weight === false || best.weight == null) {
    return `${best.reps ?? "–"} reps`;
  }
  return best.reps != null ? `${best.reps}×${best.weight}` : `${best.weight}`;
}

export function HubIdleScreen({ now }) {
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getHubIdleStats()
        .then((s) => {
          if (!cancelled) setStats(s);
        })
        // Idle decoration — a failure (or an unrun migration 0076) leaves the
        // clock alone rather than putting an error on a gym wall.
        .catch(() => {});
    load();
    const t = setInterval(load, STATS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const bests = stats?.bests ?? [];
  const pageCount = Math.max(1, Math.ceil(bests.length / PAGE));

  useEffect(() => {
    if (pageCount <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pageCount), ROTATE_MS);
    return () => clearInterval(t);
  }, [pageCount]);

  const visible = bests.slice(page * PAGE, page * PAGE + PAGE);

  const hasCards = stats?.sessionsThisWeek != null || visible.length > 0;

  // Centred as a GROUP rather than pushed out to both edges — on a 1920 wall
  // a flex:1 left block and a right-aligned card column read as two things
  // stuck to the outside of the screen with a hole between them. The right
  // column is only in the layout when it has something in it, so a bare clock
  // (bests off, or the stats call failing) still centres properly instead of
  // sitting left of an invisible 620px block.
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 56 }}>
      <View>
        <Image source={require("../../assets/kova-logo.jpg")} style={{ width: 150, height: 150, borderRadius: 75, marginBottom: 26 }} />
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 17, letterSpacing: 2.4, color: colors.muted, textTransform: "uppercase" }}>
          {now.toLocaleDateString([], { weekday: "long" })} · {now.toLocaleDateString([], { month: "long", day: "numeric" })}
        </Text>
        <Text style={{ fontFamily: fonts.display, fontSize: 250, lineHeight: 268, color: "#44403c" }}>
          {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "")}
        </Text>
      </View>

      {hasCards ? (
      <View style={{ width: 620, marginLeft: 88 }}>
        {stats?.sessionsThisWeek != null ? (
          <StatCard style={{ marginBottom: 18 }}>
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, letterSpacing: 1.6, color: colors.primaryOnWhite, textTransform: "uppercase" }}>
              This week at Kova
            </Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 6 }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 76, lineHeight: 84, color: colors.primary }}>{stats.sessionsThisWeek}</Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 20, lineHeight: 26, color: colors.muted, marginLeft: 14, marginBottom: 12 }}>
                sessions{"\n"}logged
              </Text>
            </View>
          </StatCard>
        ) : null}

        {visible.length > 0 ? (
          <StatCard tone="peach">
            <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, letterSpacing: 1.6, color: colors.primaryOnWhite, textTransform: "uppercase" }}>
              Recent bests
            </Text>
            {visible.map((best, i) => (
              <View
                key={`${best.who}-${best.lift}-${i}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingTop: 14,
                  paddingBottom: 12,
                  borderBottomWidth: i === visible.length - 1 ? 0 : 1,
                  borderBottomColor: "#f0ddd2",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 24, color: "#292524" }}>{best.who}</Text>
                  <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: colors.muted, marginTop: 2 }}>{best.lift}</Text>
                </View>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 30, color: colors.primaryOnWhite }}>{bestValue(best)}</Text>
              </View>
            ))}
          </StatCard>
        ) : null}
      </View>
      ) : null}
    </View>
  );
}
