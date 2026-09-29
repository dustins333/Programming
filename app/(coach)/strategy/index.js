import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, TextInput, ActivityIndicator, Platform } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { T, MAX_WIDTH, GUTTER, Card, Eyebrow, shortDate, weekday, weekdayDate, timeParts, coachShort } from "../../../components/coach/strategy/ui";
import { addDays, todayInBoise } from "../../../lib/boiseDate";
import { getStrategySessionDay, listStrategySearchClients } from "../../../lib/programming/strategySessions";
import { fonts } from "../../../lib/theme";

// Strategy Sessions: who's booked today, who's been seen, and a search to
// start one with anyone. Built from design_handoff_strategy_sessions_v1.
// Universal file, phone-first with a max width, same pattern as Coach Prep.
//
// A saved client leaves Scheduled and goes to the top of Completed; the
// server marks her done, this screen just filters. Reloads on focus so a
// save shows the moment the coach comes back.

function Row({ children, onPress, last, minHeight, disabled }) {
  return (
    <PressFade
      onPress={onPress}
      disabled={disabled || !onPress}
      style={{
        minHeight,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: T.border,
      }}
    >
      {children}
    </PressFade>
  );
}

function Chevron() {
  return <Ionicons name="chevron-forward" size={16} color={T.ink4} style={{ marginLeft: 8 }} />;
}

function StepButton({ icon, onPress, label }) {
  return (
    <PressFade
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: T.card,
        borderWidth: 1,
        borderColor: T.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icon} size={18} color={T.ink} />
    </PressFade>
  );
}

function lastSessionText(s) {
  if (s.lastSession) {
    const coach = s.lastSession.coachName ? ` | ${coachShort(s.lastSession.coachName)}` : "";
    return `Last session ${shortDate(s.lastSession.date)}${coach}`;
  }
  if (!s.ghlContactId) return "Not linked to GLM, so there's nowhere to save notes";
  return s.noSessions ? "No sessions on record" : null;
}

export default function StrategyToday() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const today = todayInBoise();
  const [date, setDate] = useState(typeof params.date === "string" && params.date ? params.date : today);
  const [state, setState] = useState({ status: "loading" });
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [clients, setClients] = useState(null);
  const searchRef = useRef(null);

  const load = useCallback(async () => {
    setState((prev) => (prev.status === "ready" && prev.data.date === date ? prev : { status: "loading" }));
    try {
      const data = await getStrategySessionDay(date);
      setState({ status: "ready", data });
    } catch (err) {
      console.error("Strategy sessions: failed to load day", err);
      setState({ status: "error", message: err.message ?? String(err) });
    }
  }, [date]);

  const loadClients = useCallback(async () => {
    try {
      setClients(await listStrategySearchClients());
    } catch (err) {
      console.error("Strategy sessions: failed to load clients", err);
      setClients([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // Refresh search's last-session lines too, if it's been opened.
      if (clients) loadClients();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    if (!searching || !clients) return [];
    const q = query.trim().toLowerCase();
    return clients.filter((c) => (c.name ?? "").toLowerCase().includes(q));
  }, [clients, query, searching]);

  const openClient = (contactId) =>
    router.push({ pathname: "/(coach)/strategy/[contactId]", params: { contactId, ...(date !== today ? { date } : {}) } });

  // Coach-only notes are usually written after the client has gone, so a
  // Kova-saved session in Completed gets a button straight to them, on the
  // day it was held (which isn't always the day this list is showing).
  const openCoachNotes = (contactId, heldOn) =>
    router.push({
      pathname: "/(coach)/strategy/[contactId]",
      params: { contactId, focus: "coach", ...(heldOn !== today ? { date: heldOn } : {}) },
    });

  const focusSearch = () => {
    if (!clients) loadClients();
    searchRef.current?.focus();
  };

  const isToday = date === today;
  const data = state.status === "ready" ? state.data : null;
  // `done` from the server means saved through Kova. A session written
  // straight into GLM that day counts too: her summary's last session date
  // IS this day (without this she showed in Scheduled and Completed at once,
  // with "last session" naming the very day she was booked).
  const scheduled = (data?.scheduled ?? []).map((s) =>
    s.done || s.last_session_on !== data.date
      ? s
      : { ...s, done: true }
  );
  const left = scheduled.filter((s) => !s.done);
  const completed = data?.completed ?? [];

  return (
    <CoachShell>
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: T.canvas }}
        contentContainerStyle={{ padding: GUTTER, paddingBottom: 44 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: "100%", maxWidth: MAX_WIDTH, alignSelf: "center" }}>
          {/* Web has the CoachShell nav; native reaches this from More. */}
          {Platform.OS !== "web" ? (
            <PressFade
              onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/more"))}
              style={{ alignSelf: "flex-start", height: 44, justifyContent: "center" }}
            >
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: T.clayText }}>‹ More</Text>
            </PressFade>
          ) : null}

          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Eyebrow color={T.clayText}>Strategy sessions</Eyebrow>
              <Text style={{ fontFamily: fonts.display, fontSize: 30, color: T.clay, marginTop: 4 }}>
                {isToday ? "Today" : weekday(date)}
              </Text>
              <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: T.ink3, marginTop: 2 }}>{weekdayDate(date)}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <StepButton icon="chevron-back" label="Previous day" onPress={() => setDate((d) => addDays(d, -1))} />
              <StepButton icon="chevron-forward" label="Next day" onPress={() => setDate((d) => addDays(d, 1))} />
            </View>
          </View>
          {!isToday ? (
            <PressFade onPress={() => setDate(today)} style={{ alignSelf: "flex-start", height: 44, justifyContent: "center" }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: T.clayText }}>Back to today</Text>
            </PressFade>
          ) : null}

          {/* Search */}
          <View
            style={{
              marginTop: isToday ? 18 : 6,
              height: 52,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: searching || searchFocused ? T.clay : T.inputBorder,
              backgroundColor: T.card,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: 14,
            }}
          >
            <Ionicons name="search" size={18} color={T.ink3} />
            <TextInput
              ref={searchRef}
              value={query}
              onChangeText={setQuery}
              onFocus={() => {
                setSearchFocused(true);
                if (!clients) loadClients();
              }}
              onBlur={() => setSearchFocused(false)}
              placeholder="Find any client to start a session"
              placeholderTextColor={T.ink4}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              style={{ flex: 1, minWidth: 0, height: "100%", paddingHorizontal: 10, fontFamily: fonts.sans, fontSize: 15, color: T.ink }}
            />
            {searching || searchFocused ? (
              <PressFade
                onPress={() => {
                  setQuery("");
                  searchRef.current?.blur();
                }}
                style={{ height: 50, paddingHorizontal: 14, justifyContent: "center" }}
              >
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: T.clayText }}>Cancel</Text>
              </PressFade>
            ) : null}
          </View>

          {searching ? (
            <SearchResults clients={clients} results={results} onStart={openClient} />
          ) : state.status === "loading" ? (
            <View style={{ paddingVertical: 48, alignItems: "center" }}>
              <ActivityIndicator color={T.clay} />
            </View>
          ) : state.status === "error" ? (
            <View style={{ marginTop: 22 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: T.ink2 }}>
                Couldn't load the day. {state.message}
              </Text>
              <PressFade onPress={load} style={{ alignSelf: "flex-start", height: 44, justifyContent: "center" }}>
                <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: T.clayText }}>Try again</Text>
              </PressFade>
            </View>
          ) : (
            <>
              {/* Scheduled */}
              <View style={{ marginTop: 22 }}>
                {scheduled.length === 0 ? (
                  <View style={{ borderWidth: 2, borderStyle: "dashed", borderColor: T.dashed, borderRadius: 18, padding: 20 }}>
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: T.ink }}>
                      {isToday ? "Nobody's booked today" : `Nobody's booked ${shortDate(date)}`}
                    </Text>
                    <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: T.ink2, marginTop: 6 }}>
                      Pulling someone aside? Search for any client and start a session with her.
                    </Text>
                    <PressFade
                      onPress={focusSearch}
                      style={{
                        alignSelf: "flex-start",
                        marginTop: 14,
                        height: 44,
                        paddingHorizontal: 16,
                        borderRadius: 12,
                        backgroundColor: T.clayTint,
                        borderWidth: 1,
                        borderColor: T.clayTintBorder,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Ionicons name="search" size={16} color={T.clayText} />
                      <Text style={{ fontFamily: fonts.sansBold, fontSize: 14, color: T.clayText }}>Search clients</Text>
                    </PressFade>
                  </View>
                ) : (
                  <>
                    <Eyebrow>
                      {left.length < scheduled.length
                        ? `Scheduled | ${left.length} left`
                        : `Scheduled | ${scheduled.length}${isToday ? " today" : ""}`}
                    </Eyebrow>
                    {left.length === 0 ? (
                      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: T.ink2, marginTop: 10 }}>
                        Everyone booked {isToday ? "today" : "this day"} has been seen.
                      </Text>
                    ) : (
                      <Card style={{ marginTop: 10 }}>
                        {left.map((s, i) => {
                          const { time, meridiem } = timeParts(s.starts_at);
                          const meta = [
                            s.coach_name ? coachShort(s.coach_name) : null,
                            // Only a session BEFORE this day is her "last" one.
                            s.last_session_on && s.last_session_on < date ? `last session ${shortDate(s.last_session_on)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" | ");
                          return (
                            <Row key={s.appointment_id} minHeight={66} last={i === left.length - 1} onPress={() => openClient(s.client.ghl_contact_id)}>
                              <View style={{ width: 62 }}>
                                <Text style={{ fontFamily: fonts.display, fontSize: 19, color: T.ink }}>{time}</Text>
                                <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: T.ink3, marginTop: 1 }}>{meridiem}</Text>
                              </View>
                              <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                                <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: T.ink }}>
                                  {s.client.name ?? "Unknown client"}
                                </Text>
                                {meta ? (
                                  <Text numberOfLines={1} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: T.ink3, marginTop: 3 }}>
                                    {meta}
                                  </Text>
                                ) : null}
                              </View>
                              <Chevron />
                            </Row>
                          );
                        })}
                      </Card>
                    )}
                  </>
                )}
              </View>

              {/* Completed */}
              {completed.length > 0 ? (
                <View style={{ marginTop: 22 }}>
                  <Eyebrow>Completed | last 3 weeks</Eyebrow>
                  <Card style={{ marginTop: 10 }}>
                    {completed.map((c, i) => {
                      const onDay = c.held_on === date;
                      const when = onDay ? (isToday ? "Today" : shortDate(c.held_on)) : shortDate(c.held_on);
                      const right = [when, c.coach_name ? coachShort(c.coach_name) : null].filter(Boolean).join(" | ");
                      const last = i === completed.length - 1;
                      return (
                        <View key={c.client.ghl_contact_id} style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: T.border }}>
                          <Row minHeight={52} last onPress={() => openClient(c.client.ghl_contact_id)}>
                            {onDay ? <Ionicons name="checkmark" size={17} color={T.olive} style={{ marginRight: 8 }} /> : null}
                            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: fonts.sansSemiBold, fontSize: 14, color: T.ink }}>
                              {c.client.name ?? "Unknown client"}
                            </Text>
                            <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: onDay ? T.olive : T.ink3, marginLeft: 10 }}>{right}</Text>
                            <Chevron />
                          </Row>
                          {c.source === "kova" ? (
                            <PressFade
                              onPress={() => openCoachNotes(c.client.ghl_contact_id, c.held_on)}
                              style={{
                                alignSelf: "flex-start",
                                marginLeft: 16,
                                marginTop: -4,
                                marginBottom: 10,
                                height: 40,
                                paddingHorizontal: 12,
                                borderRadius: 10,
                                backgroundColor: T.inset,
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <Ionicons name="lock-closed" size={12} color={T.ink2} />
                              <Text style={{ fontFamily: fonts.sansBold, fontSize: 13, color: T.ink2 }}>
                                {c.has_coach_notes ? "Edit coach notes" : "Add coach notes"}
                              </Text>
                            </PressFade>
                          ) : null}
                        </View>
                      );
                    })}
                  </Card>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </CoachShell>
  );
}

function SearchResults({ clients, results, onStart }) {
  if (!clients) {
    return (
      <View style={{ paddingVertical: 40, alignItems: "center" }}>
        <ActivityIndicator color={T.clay} />
      </View>
    );
  }
  return (
    <View style={{ marginTop: 22 }}>
      <Eyebrow>{`All clients | ${results.length}`}</Eyebrow>
      {results.length === 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: T.ink2, marginTop: 10 }}>No clients match that name.</Text>
      ) : (
        <Card style={{ marginTop: 10 }}>
          {results.slice(0, 50).map((c, i, list) => {
            const meta = lastSessionText(c);
            const linked = !!c.ghlContactId;
            return (
              <Row key={c.userId} minHeight={68} last={i === list.length - 1} onPress={linked ? () => onStart(c.ghlContactId) : null}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: linked ? T.ink : T.ink4 }}>
                    {c.name}
                  </Text>
                  {meta ? (
                    <Text numberOfLines={2} style={{ fontFamily: fonts.sans, fontSize: 12.5, color: T.ink3, marginTop: 3 }}>
                      {meta}
                    </Text>
                  ) : null}
                </View>
                {linked ? (
                  <View
                    style={{
                      marginLeft: 10,
                      height: 38,
                      paddingHorizontal: 14,
                      borderRadius: 999,
                      backgroundColor: T.clayTint,
                      borderWidth: 1,
                      borderColor: T.clayTintBorder,
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontFamily: fonts.sansBold, fontSize: 13.5, color: T.clayText }}>Start ›</Text>
                  </View>
                ) : null}
              </Row>
            );
          })}
        </Card>
      )}
      <Text style={{ fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: T.ink3, marginTop: 12, paddingHorizontal: 4 }}>
        Starting from search makes an unscheduled session. It saves and counts the same as a booked one.
      </Text>
    </View>
  );
}
