import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Modal, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../lib/auth/AuthProvider";
import { todayInBoise } from "../../lib/boiseDate";
import { computeWeekWindows } from "../../lib/nutrition/weekCycle";
import { getClient as getNutritionClient } from "../../lib/nutrition/clients";
import { getCheckinForWeek, getClientQuestions } from "../../lib/nutrition/checkin";
import { listAllPhotos, isPhotoRequirementWeek, photosForRequirementWeek } from "../../lib/nutrition/photos";
import { readDraft } from "../../lib/formDraft";
import { describeCheckinProgress, outstandingSentence, hasStartedCheckin } from "../../lib/nutrition/checkinProgress";
import { PressFade } from "../PressFade";
import { fonts, colors } from "../../lib/theme";

// Mounted once in app/(member)/_layout.js, alongside AnnouncementChecker.
//
// Coaches reported members finishing one half of a check-in, seeing that card
// go green, and walking away believing they were done. The Check-In screen now
// says so loudly while she is on it, and a toast catches her on the way out,
// but neither reaches the member who closed the app mid-check-in and never
// went back. This does.
//
// Deliberately fires on RETURN rather than on navigating away: at that moment
// she is free to act on it, where an interrupting dialog as she leaves would
// most often be blocking her walk to the mirror to take the photos.
const NUDGE_KEY_PREFIX = "kova_checkin_nudge_v1:";

// Every guard that can be answered without a query is checked before any
// query runs, so the common case (already nudged today) costs one local read.
async function shouldNudge(userId, today) {
  const seenKey = NUDGE_KEY_PREFIX + userId;
  const seen = await AsyncStorage.getItem(seenKey);
  if (seen === today) return null;

  const client = await getNutritionClient(userId);
  if (!client || client.status !== "active" || !client.objective_tracking_approved_at) return null;

  const week = computeWeekWindows(today).currentWeek;
  const existing = await getCheckinForWeek(userId, week.start);
  if (existing) return null;

  const questions = await getClientQuestions(userId);
  const photosRequired = isPhotoRequirementWeek(client, week.start);

  const draft = await readDraft(`${userId}:checkin:${week.start}`);
  const answeredCount = questions.filter((q) => (draft?.[q.id] || "").trim().length > 0).length;

  // Only worth a query when this week actually asks for photos.
  let anglesInCount = 0;
  let photosSatisfied = !photosRequired;
  if (photosRequired) {
    const relevant = photosForRequirementWeek(await listAllPhotos(userId), week);
    const angles = new Set(relevant.map((p) => p.angle));
    anglesInCount = angles.size;
    photosSatisfied = ["front", "side", "back"].every((a) => angles.has(a));
  }

  // Nothing typed and nothing uploaded is not "started and forgotten" — that
  // member has simply not begun, and My Week's pill is the right nudge for
  // her. A popup there would be nagging rather than reminding.
  if (!hasStartedCheckin({ answeredCount, anglesInCount })) return null;

  const progress = describeCheckinProgress({
    photosRequired,
    photosSatisfied,
    questionCount: questions.length,
    answeredCount,
  });
  if (progress.nothingToDo) return null;

  await AsyncStorage.setItem(seenKey, today);
  // Null when she has in fact finished everything and it simply never sent —
  // the copy then stops after the first sentence rather than inventing a task.
  return { detail: outstandingSentence(progress) };
}

export function CheckinNudge() {
  const { profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [nudge, setNudge] = useState(null);

  const profileIdRef = useRef(profile?.id);
  profileIdRef.current = profile?.id;
  // She is already looking at the thing this would send her to.
  const onCheckinScreenRef = useRef(false);
  onCheckinScreenRef.current = Boolean(pathname && pathname.includes("nutrition/checkin"));

  const check = useCallback(() => {
    const id = profileIdRef.current;
    if (!id || onCheckinScreenRef.current) return;
    shouldNudge(id, todayInBoise())
      .then((result) => {
        if (result) setNudge(result);
      })
      .catch((err) => console.error("Failed to check for an unfinished check-in:", err));
  }, []);

  useEffect(() => {
    check();
  }, [profile?.id, check]);

  // Same reasoning as AnnouncementChecker: this lives at the layout level, so
  // reopening an app that was only backgrounded never remounts it and a
  // mount-only effect would never run again.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") check();
    });
    return () => subscription.remove();
  }, [check]);

  const close = useCallback(() => setNudge(null), []);

  const goFinish = useCallback(() => {
    setNudge(null);
    router.push("/(member)/nutrition/checkin");
  }, [router]);

  if (!nudge) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "rgba(68,64,60,0.35)" }}>
        <View
          className="w-full rounded-3xl p-6"
          style={{ maxWidth: 420, backgroundColor: "#faf8f6", borderWidth: 1, borderColor: "#ece7e1" }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#fdf6f2",
              marginBottom: 12,
            }}
          >
            <Ionicons name="clipboard-outline" size={22} color={colors.primaryOnWhite} />
          </View>
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.display, fontSize: 22, color: "#33251f" }}>
            You haven't sent your check-in yet
          </Text>
          {nudge.detail ? (
            <Text maxFontSizeMultiplier={1.25} className="mt-1.5" style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.muted }}>
              {nudge.detail}
            </Text>
          ) : null}
          <PressFade
            onPress={goFinish}
            style={{ marginTop: 20, borderRadius: 15, backgroundColor: colors.primary, alignItems: "center", paddingVertical: 14 }}
          >
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: "#fff" }}>
              Finish my check-in
            </Text>
          </PressFade>
          <PressFade onPress={close} style={{ marginTop: 6, alignItems: "center", paddingVertical: 10 }}>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: fonts.sansMedium, fontSize: 13.5, color: colors.muted }}>
              Not right now
            </Text>
          </PressFade>
        </View>
      </View>
    </Modal>
  );
}
