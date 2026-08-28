import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, Platform, Modal } from "react-native";
import { Redirect, useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { CoachShell } from "../../../components/CoachShell";
import { PressFade } from "../../../components/PressFade";
import { GraphicPicker } from "../../../components/GraphicPicker";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { NativePickerField } from "../../../components/NativePickerField";
import { QuestionListEditor } from "../../../components/nutrition/QuestionListEditor";
import { EventCard } from "../../../components/events/EventCard";
import { EventDetailView } from "../../../components/events/EventDetailView";
import { NUMERIC_DONE_ID } from "../../../components/NumericInputAccessory";
import { listGroupPrograms } from "../../../lib/programming/blocks";
import {
  createAnnouncement,
  pushAnnouncementNow,
  deletePendingAnnouncementsForEvent,
} from "../../../lib/programming/announcements";
import {
  getEvent,
  updateEvent,
  publishEvent,
  unpublishEvent,
  deleteEvent,
  listEventItems,
  addEventItem,
  updateEventItem,
  deleteEventItem,
  listEventQuestions,
  addEventQuestion,
  updateEventQuestion,
  deleteEventQuestion,
  countResponsesByEvent,
  eventPhase,
} from "../../../lib/programming/events";
import {
  confirmPublishEvent,
  confirmUnpublishEvent,
  confirmDeleteEvent,
  confirmRemoveEventItem,
} from "../../../lib/confirmDialog";
import { toastError, toastSuccess } from "../../../lib/toast";
import { boiseInstantFrom, formatDateTimeInBoise } from "../../../lib/boiseDate";
import {
  buildDateOptions,
  TIME_OPTIONS,
  toDateValue,
  toTimeValue,
  roundUpToQuarterHour,
} from "../../../lib/dateTimeOptions";
import { fonts, colors, statusColors } from "../../../lib/theme";

const isWeb = Platform.OS === "web";

const GO_LIVE_OPTIONS = [
  { key: "now", label: "As soon as I publish" },
  { key: "later", label: "Schedule it" },
];

// An hour out, rounded up to the next quarter — scan-announcements only
// polls every 15 minutes, so finer granularity would be a false promise.
function defaultGoLive() {
  return roundUpToQuarterHour(new Date(Date.now() + 60 * 60 * 1000));
}

const AUDIENCE_OPTIONS = [
  { key: "all", label: "Everyone" },
  { key: "group_program", label: "Group program" },
  { key: "spc", label: "SPC" },
  { key: "nutrition", label: "Nutrition" },
];

const RESPONSE_OPTIONS = [
  { key: "none", label: "Read only" },
  { key: "signup", label: "Sign-up" },
  { key: "order", label: "Order" },
  { key: "link", label: "Link out" },
];

const RESPONSE_HINT = {
  none: "Members just read it. No response collected.",
  signup: "Members tap a button to put their name down — a class, a program, a bring-a-friend day.",
  order: "Members pick quantities from the item list below.",
  link: "Members get one button out to a page you host elsewhere.",
};

// Web gets a real <select>; native gets the shared modal-list stand-in.
// Same split as every other form control in this app.
function Select({ options, value, onChange, placeholder, maxWidth = 260 }) {
  if (isWeb) {
    return (
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          fontFamily: fonts.sans,
          fontSize: 14,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #d6d3d1",
          maxWidth,
          width: "100%",
        }}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return <NativePickerField options={options} value={value} onChange={onChange} placeholder={placeholder} />;
}

function Field({ label, hint, children }) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
        {label}
      </Text>
      {children}
      {hint ? (
        <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

// One orderable item on an order event. Options are the variants a member
// picks between (S/M/L, Vanilla/Chocolate) — an empty list means the item
// has none and is ordered by quantity alone.
function ItemRow({ item, onPatch, onRemove }) {
  const [name, setName] = useState(item.name);
  const [newOption, setNewOption] = useState("");
  const options = item.options ?? [];

  const addOption = async () => {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    if (options.includes(trimmed)) {
      toastError("That option is already on this item");
      return;
    }
    setNewOption("");
    await onPatch({ options: [...options, trimmed] });
  };

  return (
    <View className="mb-3 rounded-xl border border-stone-200 p-4">
      <View className="flex-row items-center gap-3">
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={() => {
            const trimmed = name.trim();
            if (!trimmed) {
              setName(item.name);
              return;
            }
            if (trimmed !== item.name) onPatch({ name: trimmed });
          }}
          placeholder="Item name"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
          style={{ fontFamily: fonts.sans }}
        />
        <PressFade onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={18} color="#a8a29e" />
        </PressFade>
      </View>

      <Text className="mb-2 mt-3 text-xs text-stone-500" style={{ fontFamily: fonts.sansMedium }}>
        Options (size, flavor…) — leave empty if there aren't any
      </Text>

      {options.length > 0 ? (
        <View className="mb-2 flex-row flex-wrap gap-2">
          {options.map((opt) => (
            <View
              key={opt}
              className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ backgroundColor: "#fdf6f2", borderWidth: 1, borderColor: "#f0ddd2" }}
            >
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: colors.primaryOnWhite }}>{opt}</Text>
              <PressFade
                onPress={() => onPatch({ options: options.filter((o) => o !== opt) })}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Ionicons name="close" size={12} color={colors.primaryOnWhite} />
              </PressFade>
            </View>
          ))}
        </View>
      ) : null}

      <View className="flex-row items-center gap-2">
        <TextInput
          value={newOption}
          onChangeText={setNewOption}
          onSubmitEditing={addOption}
          placeholder="Add an option"
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
          style={{ fontFamily: fonts.sans, maxWidth: 220 }}
        />
        <PressFade onPress={addOption} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>Add</Text>
        </PressFade>
      </View>
    </View>
  );
}

export default function EventComposer() {
  const { profile } = useAuth();
  const router = useRouter();
  const { eventId } = useLocalSearchParams();

  const [event, setEvent] = useState(null);
  const [items, setItems] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [groupPrograms, setGroupPrograms] = useState([]);
  const [responseCount, setResponseCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state, seeded from the loaded row.
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imagePath, setImagePath] = useState(null);
  const [location, setLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [closesDate, setClosesDate] = useState("");
  const [closesTime, setClosesTime] = useState("");
  const [audience, setAudience] = useState("all");
  const [targetGroupProgramId, setTargetGroupProgramId] = useState(null);
  const [responseType, setResponseType] = useState("none");
  const [linkUrl, setLinkUrl] = useState("");
  // Off by default — asking "how many guests?" only makes sense for a
  // bring-a-friend day, not for registering someone onto a program.
  const [askGuestCount, setAskGuestCount] = useState(false);
  const [ctaLabel, setCtaLabel] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  // Publishing alone only makes the tab appear. This is what actively tells
  // people — it writes a normal announcement pointing back at this event, so
  // the popup and the push both come free from the existing pipeline.
  const [alsoAnnounce, setAlsoAnnounce] = useState(true);
  // When members start seeing it. "later" writes events.publish_at, which
  // member-facing RLS gates on (0096), and schedules the announcement for
  // the same instant — so the tab, the popup and the push all arrive
  // together without anyone being at a keyboard.
  const [goLiveTiming, setGoLiveTiming] = useState("now");
  const [goLiveDate, setGoLiveDate] = useState(() => toDateValue(defaultGoLive()));
  const [goLiveTime, setGoLiveTime] = useState(() => toTimeValue(defaultGoLive()));

  const dateOptions = useMemo(() => buildDateOptions(120), []);
  const optionalDateOptions = useMemo(() => buildDateOptions(120, { includeNone: true, noneLabel: "No specific date" }), []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [row, itemRows, questionRows, programs, counts] = await Promise.all([
        getEvent(eventId),
        listEventItems(eventId),
        listEventQuestions(eventId),
        listGroupPrograms(),
        countResponsesByEvent(),
      ]);
      if (!row) throw new Error("That event no longer exists.");
      setEvent(row);
      setItems(itemRows);
      setQuestions(questionRows);
      setGroupPrograms(programs);
      setResponseCount(counts[eventId] ?? 0);

      setTitle(row.title === "Untitled event" ? "" : row.title);
      setBody(row.body ?? "");
      setImagePath(row.image_path);
      setLocation(row.location ?? "");
      setEventDate(row.event_date ?? "");
      const closes = new Date(row.closes_at);
      setClosesDate(toDateValue(closes));
      setClosesTime(toTimeValue(closes));
      setAudience(row.target_type);
      setTargetGroupProgramId(row.target_group_program_id);
      setResponseType(row.response_type);
      setLinkUrl(row.link_url ?? "");
      setAskGuestCount(Boolean(row.ask_guest_count));
      setCtaLabel(row.cta_label ?? "");
      // Off by default once this event has already been announced, so
      // taking it down and re-publishing doesn't notify everyone twice.
      setAlsoAnnounce(!row.pushed_at);
      // Only a publish_at still in the future is a real schedule; one that
      // has already passed just means "live", so the picker resets rather
      // than offering to re-schedule into the past.
      const scheduledFor = row.publish_at ? new Date(row.publish_at) : null;
      if (scheduledFor && scheduledFor > new Date()) {
        setGoLiveTiming("later");
        setGoLiveDate(toDateValue(scheduledFor));
        setGoLiveTime(toTimeValue(scheduledFor));
      } else {
        setGoLiveTiming("now");
      }
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

  if (profile && profile.role !== "admin") {
    return <Redirect href="/(coach)" />;
  }

  const audienceLabel = () => {
    if (audience === "group_program") {
      const program = groupPrograms.find((p) => p.id === targetGroupProgramId);
      return program ? program.name : "that program";
    }
    if (audience === "spc") return "SPC clients";
    if (audience === "nutrition") return "nutrition clients";
    return "everyone";
  };

  // Validation shared by Save and Publish, so publishing can't slip past
  // a check that saving enforces.
  const validate = () => {
    if (!title.trim()) return "Give the event a title.";
    if (!closesDate || !closesTime) return "Pick when this closes — it's what hides the event when it's over.";
    if (audience === "group_program" && !targetGroupProgramId) return "Pick which group program this is for.";
    if (responseType === "link" && !linkUrl.trim()) return "A link-out event needs a URL.";
    if (responseType === "order" && items.length === 0) return "Add at least one item to order.";
    return null;
  };

  const saveDetails = async () => {
    const problem = validate();
    if (problem) {
      toastError(problem);
      return false;
    }
    setSaving(true);
    try {
      await updateEvent(eventId, {
        title: title.trim(),
        body: body.trim() || null,
        image_path: imagePath,
        location: location.trim() || null,
        event_date: eventDate || null,
        closes_at: boiseInstantFrom(closesDate, closesTime),
        target_type: audience,
        target_group_program_id: audience === "group_program" ? targetGroupProgramId : null,
        response_type: responseType,
        link_url: responseType === "link" ? linkUrl.trim() : null,
        ask_guest_count: responseType === "signup" ? askGuestCount : false,
        cta_label: responseType === "link" ? ctaLabel.trim() || null : null,
      });
      await load();
      return true;
    } catch (err) {
      toastError("Couldn't save", err);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (await saveDetails()) toastSuccess("Saved.");
  };

  // null = live immediately. A schedule that has already slipped past is
  // treated as "now" rather than rejected — the coach's intent was clearly
  // "go", and holding it back would be the surprising answer.
  const resolveGoLiveAt = () => {
    if (goLiveTiming === "now") return null;
    if (!goLiveDate || !goLiveTime) throw new Error("Pick the day and time it should go live");
    const at = boiseInstantFrom(goLiveDate, goLiveTime);
    if (closesDate && closesTime && new Date(at) >= new Date(boiseInstantFrom(closesDate, closesTime))) {
      throw new Error("It would go live after it closes — pick an earlier time, or push the closing date out.");
    }
    return new Date(at) > new Date() ? at : null;
  };

  const handlePublish = async () => {
    // Save first, so what goes live is what's on screen rather than
    // whatever was last persisted.
    if (!(await saveDetails())) return;

    let goLiveAt;
    try {
      goLiveAt = resolveGoLiveAt();
    } catch (err) {
      toastError(err.message);
      return;
    }

    const confirmed = await confirmPublishEvent(title.trim(), audienceLabel(), goLiveAt);
    if (!confirmed) return;
    try {
      await publishEvent(eventId, goLiveAt);
    } catch (err) {
      toastError("Couldn't publish", err);
      return;
    }

    if (!alsoAnnounce) {
      toastSuccess(
        goLiveAt
          ? `Scheduled. It shows up on their Events tab ${formatDateTimeInBoise(goLiveAt)}.`
          : "Published. It's on their Events tab now."
      );
      await load();
      return;
    }

    // Announcing is a separate, best-effort step: the event IS published at
    // this point, so a push failure must read as "the announcement didn't
    // go out", never as "publishing failed". Same fire-and-report shape the
    // announcements compose form already uses.
    try {
      const announcement = await createAnnouncement(
        {
          title: title.trim(),
          message: body.trim() || `Tap to see the details.`,
          // The same instant the event itself becomes visible, so nobody is
          // ever pushed at something they can't open yet.
          sendAt: goLiveAt ?? new Date().toISOString(),
          targetType: audience,
          targetGroupProgramId,
          imagePath,
          eventId,
        },
        profile.id
      );
      if (goLiveAt) {
        // Left for scan-announcements' cron scan to send once send_at
        // passes — the same path any scheduled announcement takes. pushed_at
        // stays null deliberately: nothing has gone out yet, and it's what
        // lets a cancelled schedule clean the queued announcement up.
        toastSuccess(`Scheduled for ${formatDateTimeInBoise(goLiveAt)}.`);
      } else {
        await pushAnnouncementNow(announcement.id);
        await updateEvent(eventId, { pushed_at: new Date().toISOString() });
        toastSuccess("Published and announced.");
      }
    } catch (err) {
      toastError("Published, but the announcement didn't go out", err);
    }
    await load();
  };

  const handleTakeDown = async () => {
    const scheduled = eventPhase(event) === "scheduled";
    const confirmed = await confirmUnpublishEvent(event.title, scheduled);
    if (!confirmed) return;
    try {
      await unpublishEvent(eventId);
      // An announcement queued to go out with this event has to come down
      // with it, or people get pushed at something they can't open. Only
      // ever removes one that hasn't sent yet.
      await deletePendingAnnouncementsForEvent(eventId);
      toastSuccess(scheduled ? "Schedule cancelled — it's a draft again." : "Taken down.");
      await load();
    } catch (err) {
      toastError("Couldn't take it down", err);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirmDeleteEvent(event.title, responseCount);
    if (!confirmed) return;
    try {
      await deleteEvent(eventId);
      router.replace("/(coach)/events");
    } catch (err) {
      toastError("Couldn't delete", err);
    }
  };

  // --- item handlers ---
  const handleAddItem = async () => {
    try {
      await addEventItem(eventId, { name: "New item", position: items.length });
      setItems(await listEventItems(eventId));
    } catch (err) {
      toastError("Couldn't add the item", err);
    }
  };

  const handlePatchItem = async (itemId, fields) => {
    try {
      await updateEventItem(itemId, fields);
      setItems(await listEventItems(eventId));
    } catch (err) {
      toastError("Couldn't save the item", err);
    }
  };

  const handleRemoveItem = async (item) => {
    const confirmed = await confirmRemoveEventItem(item.name);
    if (!confirmed) return;
    try {
      await deleteEventItem(item.id);
      setItems(await listEventItems(eventId));
    } catch (err) {
      toastError("Couldn't remove the item", err);
    }
  };

  // --- question handlers ---
  const refreshQuestions = async () => setQuestions(await listEventQuestions(eventId));

  const handleSwapQuestions = async (a, b) => {
    await updateEventQuestion(a.id, { position: b.position });
    await updateEventQuestion(b.id, { position: a.position });
    await refreshQuestions();
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

  if (loadError) {
    return (
      <CoachShell>
        <ScrollView className="flex-1 bg-white px-8 pt-8">
          <PressFade onPress={() => router.push("/(coach)/events")} style={{ marginBottom: 16, alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back to Events</Text>
          </PressFade>
          <Text className="mb-2 text-sm text-red-600" style={{ fontFamily: fonts.sans }}>
            {loadError}
          </Text>
          <PressFade onPress={load} style={{ alignSelf: "flex-start" }}>
            <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>Retry</Text>
          </PressFade>
        </ScrollView>
      </CoachShell>
    );
  }

  const phase = eventPhase(event);
  const tone = phase === "live" ? statusColors.onTrack : phase === "draft" ? statusColors.needsAction : statusColors.paused;

  // Built from what's on screen RIGHT NOW, not from the saved row — the
  // point of a preview is checking edits before committing them. Items and
  // questions are already persisted (they save as you add them), so those
  // come straight from state.
  const previewEvent = {
    id: eventId,
    title: title.trim() || "Untitled event",
    body: body.trim() || null,
    image_path: imagePath,
    event_date: eventDate || null,
    closes_at: closesDate && closesTime ? boiseInstantFrom(closesDate, closesTime) : event.closes_at,
    location: location.trim() || null,
    response_type: responseType,
    link_url: linkUrl.trim() || null,
    cta_label: ctaLabel.trim() || null,
    ask_guest_count: askGuestCount,
  };

  return (
    <CoachShell>
      <ScrollView className="flex-1 bg-white px-8 pt-8" contentContainerStyle={{ paddingBottom: 60 }}>
        <PressFade
          onPress={() => (router.canGoBack() ? router.back() : router.push("/(coach)/events"))}
          style={{ marginBottom: 16, alignSelf: "flex-start" }}
        >
          <Text style={{ fontFamily: fonts.sansMedium, color: colors.primaryOnWhite }}>‹ Back to Events</Text>
        </PressFade>

        <View className="mb-6 flex-row items-center gap-3">
          <Text className="text-2xl" style={{ fontFamily: fonts.display, color: colors.primary }}>
            {title.trim() || "New event"}
          </Text>
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: tone.bg }}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 11, color: tone.text }}>
              {phase === "live" ? "Live" : phase === "draft" ? "Draft" : "Closed"}
            </Text>
          </View>

          {/* Up here rather than beside Publish: on an order event the
              buttons are a long scroll down past the item list, and a
              preview is something you reach for mid-compose. */}
          <PressFade
            onPress={() => setPreviewOpen(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderWidth: 1,
              borderColor: "#d6d3d1",
              borderRadius: 999,
              paddingVertical: 6,
              paddingHorizontal: 12,
            }}
          >
            <Ionicons name="eye-outline" size={15} color={colors.primaryOnWhite} />
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: colors.primaryOnWhite }}>Preview</Text>
          </PressFade>
        </View>

        <View className="mb-6 max-w-xl rounded-2xl border border-stone-200 p-5">
          <GraphicPicker value={imagePath} onChange={setImagePath} folder="events" />

          <Field label="Title">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Bring a Friend Day"
              className="rounded-lg border border-stone-300 px-3 py-2.5"
              style={{ fontFamily: fonts.sans }}
            />
          </Field>

          <Field label="Details">
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="What do they need to know?"
              multiline
              inputAccessoryViewID={NUMERIC_DONE_ID}
              numberOfLines={4}
              className="rounded-lg border border-stone-300 px-3 py-2.5"
              style={{ fontFamily: fonts.sans, minHeight: 90, textAlignVertical: "top" }}
            />
          </Field>

          <Field label="Date of the event" hint="Shown to members. Leave blank for something like an order window.">
            <Select options={optionalDateOptions} value={eventDate} onChange={(v) => setEventDate(v ?? "")} />
          </Field>

          <Field
            label="Closes"
            hint="Responses stop here, and the event disappears from members' tab on its own."
          >
            <View className="flex-row gap-2" style={{ maxWidth: 420 }}>
              <Select options={dateOptions} value={closesDate} onChange={(v) => setClosesDate(v ?? "")} maxWidth={200} />
              <Select options={TIME_OPTIONS} value={closesTime} onChange={(v) => setClosesTime(v ?? "")} maxWidth={140} />
            </View>
          </Field>

          <Field label="Location" hint="Optional.">
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Main floor"
              className="rounded-lg border border-stone-300 px-3 py-2.5"
              style={{ fontFamily: fonts.sans, maxWidth: 260 }}
            />
          </Field>

          <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            Who sees it
          </Text>
          <SegmentedControl segments={AUDIENCE_OPTIONS} activeKey={audience} onSelect={setAudience} />

          {audience === "group_program" ? (
            <Field label="Which program?">
              <Select
                options={groupPrograms.map((p) => ({ value: p.id, label: p.name }))}
                value={targetGroupProgramId}
                onChange={setTargetGroupProgramId}
                placeholder="Select a program…"
              />
            </Field>
          ) : null}

          <Text className="mb-1 mt-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
            What you want back
          </Text>
          <SegmentedControl segments={RESPONSE_OPTIONS} activeKey={responseType} onSelect={setResponseType} />
          <Text className="mb-4 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
            {RESPONSE_HINT[responseType]}
          </Text>

          {responseType === "signup" ? (
            <PressFade
              onPress={() => setAskGuestCount((v) => !v)}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 16, maxWidth: 480 }}
            >
              <Ionicons
                name={askGuestCount ? "checkbox" : "checkbox-outline"}
                size={20}
                color={askGuestCount ? colors.primary : "#a8a29e"}
              />
              <View style={{ flex: 1 }}>
                <Text className="text-sm" style={{ fontFamily: fonts.sansMedium, color: "#57534e" }}>
                  Ask how many guests they're bringing
                </Text>
                <Text className="mt-0.5 text-xs" style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>
                  For a bring-a-friend day. Leave off when you're just signing people up for something.
                </Text>
              </View>
            </PressFade>
          ) : null}

          {responseType === "link" ? (
            <>
              <Field label="Link" hint="Opens outside the app — a GHL page, a Google form, whatever you're already using.">
                <TextInput
                  value={linkUrl}
                  onChangeText={setLinkUrl}
                  placeholder="https://…"
                  autoCapitalize="none"
                  className="rounded-lg border border-stone-300 px-3 py-2.5"
                  style={{ fontFamily: fonts.sans }}
                />
              </Field>

              <Field label="Button text" hint='Optional. Defaults to "Open".'>
                <TextInput
                  value={ctaLabel}
                  onChangeText={setCtaLabel}
                  placeholder="e.g. Register now"
                  className="rounded-lg border border-stone-300 px-3 py-2.5"
                  style={{ fontFamily: fonts.sans, maxWidth: 260 }}
                />
              </Field>
            </>
          ) : null}

          <PressFade
            onPress={handleSave}
            disabled={saving}
            style={{
              opacity: saving ? 0.5 : 1,
              alignItems: "center",
              borderRadius: 8,
              paddingVertical: 12,
              paddingHorizontal: 20,
              backgroundColor: colors.primary,
              alignSelf: "flex-start",
              marginTop: 8,
            }}
          >
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
              {saving ? "Saving…" : "Save changes"}
            </Text>
          </PressFade>
        </View>

        {responseType === "order" ? (
          <View className="mb-6 max-w-xl rounded-2xl border border-stone-200 p-5">
            <Text className="mb-1 text-lg" style={{ fontFamily: fonts.sansBold, color: colors.primaryOnWhite }}>
              What they can order
            </Text>
            <Text className="mb-4 text-sm text-stone-500" style={{ fontFamily: fonts.sans }}>
              No prices — this collects the order, not the money.
            </Text>

            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onPatch={(fields) => handlePatchItem(item.id, fields)}
                onRemove={() => handleRemoveItem(item)}
              />
            ))}

            <PressFade onPress={handleAddItem} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite, fontSize: 13 }}>Add an item</Text>
            </PressFade>
          </View>
        ) : null}

        {responseType === "signup" || responseType === "order" ? (
          <View className="mb-6 max-w-xl rounded-2xl border border-stone-200 p-5">
            <QuestionListEditor
              title="Anything else to ask?"
              description="Optional. Asked when they respond — a friend's name, a shirt preference, whatever you need."
              questions={questions}
              onAdd={async (text) => {
                await addEventQuestion(eventId, text, questions.length);
                await refreshQuestions();
              }}
              onUpdate={async (id, fields) => {
                await updateEventQuestion(id, fields);
                await refreshQuestions();
              }}
              onDelete={async (id) => {
                await deleteEventQuestion(id);
                await refreshQuestions();
              }}
              onMove={handleSwapQuestions}
              choicesEnabled
            />
          </View>
        ) : null}

        {phase === "draft" ? (
          <View className="mb-4 max-w-xl">
            <Text className="mb-1 text-sm text-stone-700" style={{ fontFamily: fonts.sansMedium }}>
              Goes live
            </Text>
            <SegmentedControl segments={GO_LIVE_OPTIONS} activeKey={goLiveTiming} onSelect={setGoLiveTiming} />
            {goLiveTiming === "later" ? (
              <View className="mt-2">
                <View className="flex-row gap-2" style={{ maxWidth: 420 }}>
                  <Select options={dateOptions} value={goLiveDate} onChange={(v) => setGoLiveDate(v ?? "")} maxWidth={200} />
                  <Select options={TIME_OPTIONS} value={goLiveTime} onChange={(v) => setGoLiveTime(v ?? "")} maxWidth={140} />
                </View>
                <Text className="mt-1 text-xs text-stone-400" style={{ fontFamily: fonts.sans }}>
                  Nobody sees it until then — the tab, the popup and the notification all land together. Times are
                  Boise, to the nearest quarter hour.
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {phase === "scheduled" ? (
          <View
            className="mb-4 max-w-xl rounded-2xl p-4"
            style={{ backgroundColor: "#fdf6f2", borderWidth: 1, borderColor: "#f0ddd2" }}
          >
            <Text className="text-sm" style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
              Scheduled for {formatDateTimeInBoise(event.publish_at)}
            </Text>
            <Text className="mt-1 text-xs" style={{ fontFamily: fonts.sans, color: "#57534e" }}>
              Nobody can see it yet. To change the time, cancel the schedule and publish it again.
            </Text>
          </View>
        ) : null}

        {phase === "draft" ? (
          <PressFade
            onPress={() => setAlsoAnnounce((v) => !v)}
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 16, maxWidth: 520 }}
          >
            <Ionicons
              name={alsoAnnounce ? "checkbox" : "checkbox-outline"}
              size={20}
              color={alsoAnnounce ? colors.primary : "#a8a29e"}
            />
            <View style={{ flex: 1 }}>
              <Text className="text-sm" style={{ fontFamily: fonts.sansMedium, color: "#57534e" }}>
                Also announce this
              </Text>
              <Text className="mt-0.5 text-xs" style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>
                {event.pushed_at
                  ? "Already announced once — leave this off unless you want to tell everyone again."
                  : "Sends a notification and pops up in the app, with this graphic. Without it the event just appears on their Events tab."}
              </Text>
            </View>
          </PressFade>
        ) : null}

        <View className="max-w-xl flex-row flex-wrap items-center gap-4">
          {phase === "draft" ? (
            <PressFade
              onPress={handlePublish}
              disabled={saving}
              style={{
                opacity: saving ? 0.5 : 1,
                borderRadius: 8,
                paddingVertical: 12,
                paddingHorizontal: 20,
                backgroundColor: "#4d6142",
              }}
            >
              <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold }}>
                {goLiveTiming === "later" ? "Schedule" : "Publish"}
              </Text>
            </PressFade>
          ) : null}

          {phase === "live" || phase === "scheduled" ? (
            <PressFade onPress={handleTakeDown} style={{ borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, borderWidth: 1, borderColor: "#b23a22" }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: "#b23a22" }}>
                {phase === "scheduled" ? "Cancel schedule" : "Take down"}
              </Text>
            </PressFade>
          ) : null}

          {responseType !== "none" && responseType !== "link" ? (
            <PressFade onPress={() => router.push(`/(coach)/events/${eventId}/responses`)} style={{ paddingVertical: 12 }}>
              <Text style={{ fontFamily: fonts.sansSemiBold, color: colors.primaryOnWhite }}>
                {responseCount > 0 ? `See ${responseCount} ${responseCount === 1 ? "response" : "responses"} →` : "See responses →"}
              </Text>
            </PressFade>
          ) : null}

          <PressFade onPress={handleDelete} style={{ paddingVertical: 12 }}>
            <Text style={{ fontFamily: fonts.sansMedium, color: "#a8a29e", fontSize: 13 }}>Delete</Text>
          </PressFade>
        </View>

        <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
          <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "rgba(68,64,60,0.45)" }}>
            <View className="w-full rounded-2xl bg-white" style={{ maxWidth: 460, maxHeight: "90%" }}>
              <View className="flex-row items-center justify-between border-b px-5 py-4" style={{ borderBottomColor: "#ece7e1" }}>
                <View>
                  <Text style={{ fontFamily: fonts.sansBold, color: "#44403c" }}>What they'll see</Text>
                  <Text className="mt-0.5 text-xs" style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>
                    Your unsaved changes included. Nothing here is tappable.
                  </Text>
                </View>
                <PressFade onPress={() => setPreviewOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color="#78716c" />
                </PressFade>
              </View>

              {/* Phone-width frame — a member view stretched across a
                  desktop card would misrepresent every line break and the
                  graphic's crop, which is most of what you open a preview
                  to check. */}
              <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ alignItems: "center", padding: 16 }}>
                <View style={{ width: 360, maxWidth: "100%" }}>
                  <Text className="mb-2 text-xs uppercase" style={{ fontFamily: fonts.sansBold, color: "#a8a29e", letterSpacing: 1 }}>
                    In their Events list
                  </Text>
                  <View style={{ backgroundColor: colors.canvas, borderRadius: 18, padding: 12 }}>
                    <EventCard event={previewEvent} response={null} onPress={() => {}} />
                  </View>

                  <Text className="mb-2 mt-6 text-xs uppercase" style={{ fontFamily: fonts.sansBold, color: "#a8a29e", letterSpacing: 1 }}>
                    When they open it
                  </Text>
                  <View style={{ backgroundColor: colors.canvas, borderRadius: 18, padding: 14 }}>
                    <EventDetailView event={previewEvent} items={items} questions={questions} preview />
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </CoachShell>
  );
}
