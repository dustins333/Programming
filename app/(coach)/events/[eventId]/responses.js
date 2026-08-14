import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../../lib/auth/AuthProvider";
import { CoachShell } from "../../../../components/CoachShell";
import { PressFade } from "../../../../components/PressFade";
import { SegmentedControl } from "../../../../components/SegmentedControl";
import { getLiveEventDetail, listEventResponses, rollUpOrders } from "../../../../lib/programming/events";
import { buildResponsesCsv, csvFilename, downloadCsv } from "../../../../lib/programming/eventsCsv";
import { toastError, toastSuccess } from "../../../../lib/toast";
import { formatDateTimeInBoise } from "../../../../lib/boiseDate";
import { fonts, colors } from "../../../../lib/theme";

const VIEWS = [
  { key: "rollup", label: "Totals" },
  { key: "people", label: "By person" },
];

function Row({ left, right, bold }) {
  return (
    <View className="flex-row items-center justify-between border-b py-2.5" style={{ borderBottomColor: "#ece7e1" }}>
      <View style={{ flex: 1, paddingRight: 12 }}>{left}</View>
      <Text style={{ fontFamily: bold ? fonts.sansBold : fonts.sansMedium, color: "#44403c" }}>{right}</Text>
    </View>
  );
}

export default function EventResponses() {
  const { profile } = useAuth();
  const router = useRouter();
  const { eventId } = useLocalSearchParams();

  const [event, setEvent] = useState(null);
  const [items, setItems] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [responses, setResponses] = useState([]);
  const [view, setView] = useState("rollup");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [{ event: row, items: itemRows, questions: questionRows }, responseRows] = await Promise.all([
        getLiveEventDetail(eventId),
        listEventResponses(eventId),
      ]);
      if (!row) throw new Error("That event no longer exists.");
      setEvent(row);
      setItems(itemRows);
      setQuestions(questionRows);
      setResponses(responseRows);
      // A sign-up has no per-item totals to roll up, so open on the list.
      if (row.response_type !== "order") setView("people");
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const rollup = useMemo(
    () => (event?.response_type === "order" ? rollUpOrders(responses, items) : []),
    [event, responses, items]
  );

  const totalGuests = useMemo(
    () => responses.reduce((sum, r) => sum + (r.guest_count ?? 0), 0),
    [responses]
  );

  if (profile && profile.role !== "admin") {
    return <Redirect href="/(coach)" />;
  }

  const handleExport = () => {
    const csv = buildResponsesCsv(event, responses, items, questions);
    if (downloadCsv(csvFilename(event), csv)) {
      toastSuccess("Exported.");
    } else {
      // Native has no file-system dependency in this project — same
      // limitation payroll's own export documents.
      toastError("CSV export is web only — open this page on a computer.");
    }
  };

  if (loading) {
    return (
      <CoachShell>
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color={colors.primary} />
        </View>
      </CoachShell>
    );
  }

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white px-8 pt-8" contentContainerStyle={{ paddingBottom: 48 }}>
        <PressFade
          onPress={() => (router.canGoBack() ? router.back() : router.push(`/(coach)/events/${eventId}`))}
          style={{ marginBottom: 16, alignSelf: "flex-start" }}
        >
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back to the event</Text>
        </PressFade>

        {loadError ? (
          <View>
            <Text className="mb-2 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
              {loadError}
            </Text>
            <PressFade onPress={load} style={{ alignSelf: "flex-start" }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
            </PressFade>
          </View>
        ) : (
          <>
            <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
              {event.title}
            </Text>
            <Text className="mb-6 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
              {responses.length} {responses.length === 1 ? "person has" : "people have"} responded
              {event.response_type === "signup" && totalGuests > 0
                ? ` · ${totalGuests} ${totalGuests === 1 ? "guest" : "guests"} on top`
                : ""}
            </Text>

            {responses.length === 0 ? (
              <Text className="text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
                Nothing's come in yet.
              </Text>
            ) : (
              <>
                <View className="mb-4 max-w-md flex-row items-center gap-4">
                  {event.response_type === "order" ? (
                    <View style={{ flex: 1 }}>
                      <SegmentedControl segments={VIEWS} activeKey={view} onSelect={setView} />
                    </View>
                  ) : null}
                  {Platform.OS === "web" ? (
                    <PressFade onPress={handleExport} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}>
                      <Ionicons name="download-outline" size={16} color={colors.primary} />
                      <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>CSV</Text>
                    </PressFade>
                  ) : null}
                </View>

                <View className="max-w-xl rounded-2xl border border-stone-200 p-5">
                  {view === "rollup" && event.response_type === "order" ? (
                    rollup.map((line) => (
                      <Row
                        key={line.key}
                        bold
                        left={
                          <>
                            <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
                              {line.itemName}
                              {line.option ? ` · ${line.option}` : ""}
                            </Text>
                            <Text className="mt-0.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                              {line.people} {line.people === 1 ? "person" : "people"}
                            </Text>
                          </>
                        }
                        right={`× ${line.qty}`}
                      />
                    ))
                  ) : (
                    responses.map((response) => (
                      <View key={response.id} className="border-b py-3" style={{ borderBottomColor: "#ece7e1" }}>
                        <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>
                          {response.member?.name || response.member?.email || "(unknown)"}
                        </Text>

                        {event.response_type === "signup" && event.ask_guest_count ? (
                          <Text className="mt-0.5 text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
                            {response.guest_count > 0
                              ? `+ ${response.guest_count} ${response.guest_count === 1 ? "guest" : "guests"}`
                              : "On their own"}
                          </Text>
                        ) : null}

                        {(response.lineItems ?? []).map((li) => {
                          const item = items.find((i) => i.id === li.event_item_id);
                          return (
                            <Text key={li.id} className="mt-0.5 text-sm text-stone-600" style={{ fontFamily: fonts.sans }}>
                              {li.qty} × {item?.name ?? "(deleted item)"}
                              {li.option ? ` · ${li.option}` : ""}
                            </Text>
                          );
                        })}

                        {(response.answers ?? [])
                          .filter((a) => a.answer)
                          .map((a) => (
                            <Text key={a.question} className="mt-1 text-xs text-stone-500" style={{ fontFamily: fonts.sans }}>
                              {a.question}: {a.answer}
                            </Text>
                          ))}

                        <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                          {formatDateTimeInBoise(response.submitted_at)}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
