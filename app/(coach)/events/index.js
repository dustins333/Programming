import { useCallback, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Redirect, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { GraphicImage } from "../../../components/GraphicImage";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import {
  listEvents,
  createEvent,
  countResponsesByEvent,
  unpublishEvent,
  eventPhase,
} from "../../../lib/programming/events";
import { confirmUnpublishEvent } from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";
import { formatDateMDY } from "../../../lib/formatDate";
import { formatDateTimeInBoise, todayInBoise, addDays, boiseInstantFrom } from "../../../lib/boiseDate";
import { fonts, colors, statusColors } from "../../../lib/theme";

const RESPONSE_LABEL = {
  none: "Read only",
  signup: "Sign-up",
  order: "Order",
  link: "Link out",
};

function audienceLabel(event, groupPrograms) {
  if (event.target_type === "group_program") {
    const program = groupPrograms.find((p) => p.id === event.target_group_program_id);
    return program ? program.name : "Group program (deleted)";
  }
  if (event.target_type === "spc") return "SPC";
  if (event.target_type === "nutrition") return "Nutrition";
  return "Everyone";
}

function Section({ title, hint, children }) {
  return (
    <View className="mb-8">
      <Text className="mb-1 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
        {title}
      </Text>
      {hint ? (
        <Text className="mb-3 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          {hint}
        </Text>
      ) : (
        <View className="mb-3" />
      )}
      {children}
    </View>
  );
}

function EventRow({ event, groupPrograms, responseCount, phase, onOpen, onTakeDown }) {
  const tone = phase === "live" ? statusColors.onTrack : phase === "draft" ? statusColors.needsAction : statusColors.paused;
  return (
    <View className="mb-2 max-w-2xl flex-row items-start rounded-xl border border-stone-200 p-4">
      {event.image_path ? (
        <View className="mr-3" style={{ width: 48 }}>
          <GraphicImage path={event.image_path} minRatio={1} radius={8} />
        </View>
      ) : null}

      <PressFade onPress={onOpen} style={{ flex: 1, paddingRight: 12 }}>
        <View className="flex-row items-center gap-2">
          <Text style={{ fontFamily: fonts.sansSemiBold, color: "#44403c" }}>{event.title}</Text>
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: tone.bg }}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11, color: tone.text }}>
              {phase === "live" ? "Live" : phase === "draft" ? "Draft" : "Closed"}
            </Text>
          </View>
        </View>

        <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          {audienceLabel(event, groupPrograms)} · {RESPONSE_LABEL[event.response_type] ?? event.response_type}
          {event.event_date ? ` · ${formatDateMDY(event.event_date)}` : ""}
        </Text>
        <Text className="mt-0.5 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          {phase === "past" ? "Closed " : "Closes "}
          {formatDateTimeInBoise(event.closes_at)}
          {responseCount > 0 ? ` · ${responseCount} ${responseCount === 1 ? "response" : "responses"}` : ""}
        </Text>
      </PressFade>

      {phase === "live" ? (
        <PressFade onPress={onTakeDown} style={{ paddingHorizontal: 4, paddingVertical: 2 }}>
          <Text style={{ fontFamily: fonts.sansMedium, color: "#b23a22", fontSize: 12 }}>Take down</Text>
        </PressFade>
      ) : null}
    </View>
  );
}

export default function EventsIndex() {
  const { profile } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState([]);
  const [groupPrograms, setGroupPrograms] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [rows, programs, responseCounts] = await Promise.all([
        listEvents(),
        listGroupPrograms(),
        countResponsesByEvent(),
      ]);
      setEvents(rows);
      setGroupPrograms(programs);
      setCounts(responseCounts);
    } catch (err) {
      setLoadError(err.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Tab root on native, kept mounted across tab switches — refetch on focus
  // so a just-published event shows in the right section.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (profile && profile.role !== "admin") {
    return <Redirect href="/(coach)" />;
  }

  const handleNew = async () => {
    setCreating(true);
    try {
      // Created as a draft straight away and edited on the composer, rather
      // than behind a separate create form — a draft is invisible to
      // members, so the placeholder title never reaches anyone. Two weeks
      // out is just a sane default for the one genuinely required field.
      // boiseInstantFrom, not a hand-built ISO string — "23:45" has to mean
      // quarter to midnight at the gym, not in UTC.
      const created = await createEvent(
        { title: "Untitled event", closesAt: boiseInstantFrom(addDays(todayInBoise(), 14), "23:45") },
        profile.id
      );
      router.push(`/(coach)/events/${created.id}`);
    } catch (err) {
      toastError("Couldn't create the event", err);
    } finally {
      setCreating(false);
    }
  };

  const handleTakeDown = async (event) => {
    const confirmed = await confirmUnpublishEvent(event.title);
    if (!confirmed) return;
    try {
      await unpublishEvent(event.id);
      toastSuccess("Taken down. It's back in Drafts.");
      await load();
    } catch (err) {
      toastError("Couldn't take it down", err);
    }
  };

  const now = new Date();
  const live = events.filter((e) => eventPhase(e, now) === "live");
  const drafts = events.filter((e) => eventPhase(e, now) === "draft");
  const past = events.filter((e) => eventPhase(e, now) === "past");

  const renderRow = (event, phase) => (
    <EventRow
      key={event.id}
      event={event}
      phase={phase}
      groupPrograms={groupPrograms}
      responseCount={counts[event.id] ?? 0}
      onOpen={() => router.push(`/(coach)/events/${event.id}`)}
      onTakeDown={() => handleTakeDown(event)}
    />
  );

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white px-8 pt-8" contentContainerStyle={{ paddingBottom: 40 }}>
        {Platform.OS !== "web" ? (
          <PressFade onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/more"))} style={{ marginBottom: 16, alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back</Text>
          </PressFade>
        ) : null}

        <Text className="mb-1 text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
          Events
        </Text>
        <Text className="mb-6 max-w-xl text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
          Bring a friend day, class registration, supplement and merch orders. Members only see an Events tab while
          something is live — it appears when you publish and disappears on its own when the last event closes.
        </Text>

        <PressFade
          onPress={handleNew}
          disabled={creating}
          style={{
            opacity: creating ? 0.5 : 1,
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: colors.primary,
            borderRadius: 10,
            paddingVertical: 12,
            paddingHorizontal: 18,
            marginBottom: 28,
          }}
        >
          <Ionicons name="add" size={18} color="white" />
          <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
            {creating ? "Creating…" : "New event"}
          </Text>
        </PressFade>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : loadError ? (
          <View>
            <Text className="mb-2 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
              Couldn't load events. {loadError}
            </Text>
            <PressFade onPress={load} style={{ alignSelf: "flex-start" }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
            </PressFade>
          </View>
        ) : (
          <>
            <Section title="Live" hint={live.length === 0 ? "Nothing is live — members have no Events tab right now." : undefined}>
              {live.map((e) => renderRow(e, "live"))}
            </Section>

            {drafts.length > 0 ? <Section title="Drafts">{drafts.map((e) => renderRow(e, "draft"))}</Section> : null}

            {past.length > 0 ? (
              <Section title="Closed" hint="Hidden from members automatically once they closed.">
                {past.map((e) => renderRow(e, "past"))}
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </CoachShell>
  );
}
