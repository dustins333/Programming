import { useEffect, useState } from "react";
import { View, Text, Pressable, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { PhaseCard } from "./PhaseCard";
import { getPhotoSignedUrls } from "../../lib/nutrition/photos";
import { loggedCalories } from "../../lib/nutrition/targets";
import { formatDateMDY } from "../../lib/formatDate";
import { daysBetween } from "../../lib/boiseDate";
import { fonts, colors } from "../../lib/theme";

// The Onboarding tab (coach web v2, screen 18) — the only tab a client has
// until her first targets are set, and gone the moment they are.
//
// The gate is FIRST TARGETS, not the approval stamp. Those come apart in a
// real and previously broken way: a pre-existing standalone-app client
// switched on in Kova is already approved but has no target, which used to
// leave her with a full set of tabs, all of them measuring her against
// nothing. She now lands here, where the one thing to do is the one thing on
// screen.

const COUNT_WORDS = ["None", "One", "Two", "Three"];

function Card({ title, children, style }) {
  return (
    <View
      className="rounded-2xl p-5"
      style={[
        {
          borderWidth: 1,
          borderColor: "#ece7e1",
          backgroundColor: "white",
          shadowColor: "#44403c",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.05,
          shadowRadius: 10,
          elevation: 1,
        },
        style,
      ]}
    >
      {title ? (
        <Text
          className="mb-3"
          style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

function StartingPhotos({ photos }) {
  const [urls, setUrls] = useState({});
  const starting = ["front", "side", "back"]
    .map((angle) => photos.filter((p) => p.angle === angle).sort((a, b) => (a.date < b.date ? -1 : 1))[0])
    .filter(Boolean);

  useEffect(() => {
    const paths = starting.map((p) => p.storage_path);
    if (paths.length === 0) return;
    let cancelled = false;
    getPhotoSignedUrls(paths)
      .then((next) => {
        if (!cancelled) setUrls(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starting.map((p) => p.storage_path).join(",")]);

  return (
    <Card title="Starting photos">
      {starting.length === 0 ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
          Nothing in yet. Not a blocker — you can set her targets without them.
        </Text>
      ) : (
        <>
          <View className="flex-row" style={{ gap: 8 }}>
            {starting.map((photo) => (
              <View key={photo.id ?? photo.angle} style={{ flex: 1 }}>
                {urls[photo.storage_path] ? (
                  <Image
                    source={{ uri: urls[photo.storage_path] }}
                    style={{ width: "100%", aspectRatio: 3 / 4, borderRadius: 8, backgroundColor: "#f1efed" }}
                    resizeMode="cover"
                  />
                ) : (
                  <View className="items-center justify-center rounded-lg" style={{ aspectRatio: 3 / 4, backgroundColor: "#f1efed" }}>
                    <ActivityIndicator color={colors.primary} size="small" />
                  </View>
                )}
                <Text className="mt-1 text-center" style={{ fontFamily: fonts.sans, fontSize: 10.5, color: "#a8a29e" }}>
                  {photo.angle}
                </Text>
              </View>
            ))}
          </View>
          <Text className="mt-3" style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
            Taken {formatDateMDY(starting[0].date)}
            {starting[0].weight ? ` at ${starting[0].weight} lb` : ""}. These become the left frame in every comparison from here.
          </Text>
        </>
      )}
    </Card>
  );
}

// Her tracking days averaged, purely as a reference while setting the first
// targets. Deliberately not computeBaseline (lib/nutrition/onboarding.js) —
// that one exists to feed the approve screen's macro-split maths and carries
// no steps, weight, or day count, which are three of the four numbers worth
// glancing at here.
function firstWeekReference(logs) {
  if (!logs || logs.length === 0) return null;
  const mean = (values) => {
    const present = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number);
    return present.length === 0 ? null : present.reduce((sum, v) => sum + v, 0) / present.length;
  };
  return {
    days: logs.length,
    calories: mean(logs.map(loggedCalories)),
    protein: mean(logs.map((l) => l.protein_g)),
    steps: mean(logs.map((l) => l.steps)),
    weight: mean(logs.map((l) => l.weight)),
  };
}

export function NutritionOnboardingTab({
  userId,
  client,
  onboarding,
  otLogs,
  photos,
  isWide,
  sending,
  bypassing,
  onSendToClient,
  onCloseOut,
}) {
  const router = useRouter();
  const phases = onboarding.phases;

  // Count only the steps actually being ASKED of her. Objective tracking is
  // optional per client — assigning zero days deliberately skips it, and
  // computeOnboardingPhases marks it complete on that basis. Counting that as
  // a finished step made a brand-new client with nothing submitted open on
  // "One of three done", which reads as though the coach had already got
  // somewhere. A skipped step isn't a done step; it isn't a step.
  const applicable = [
    { key: "questionnaire", done: phases.questionnaire },
    ...(onboarding.trackingCount > 0 ? [{ key: "tracking", done: phases.tracking }] : []),
    { key: "photos", done: phases.photos },
  ];
  const doneCount = applicable.filter((p) => p.done).length;
  const baseline = firstWeekReference(otLogs);

  const daysSinceInvite = client.onboarding_sent_at
    ? daysBetween(new Date().toISOString().slice(0, 10), client.onboarding_sent_at.slice(0, 10))
    : null;

  const approveHref = `/(coach)/nutrition/clients/${userId}/onboarding/approve`;

  return (
    <View>
      {client.onboarding_sent_at ? null : (
        <View
          className="mb-4 flex-row flex-wrap items-center justify-between rounded-xl px-4 py-3"
          style={{ borderWidth: 1, borderColor: "#f0ddd2", backgroundColor: "#fdf6f2", gap: 12 }}
        >
          <Text className="flex-1" style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: "#b23a22", minWidth: 240 }}>
            Not sent yet — she can&apos;t see her questionnaire or tracking dates until you send it.
          </Text>
          <Pressable onPress={onSendToClient} disabled={sending} className="rounded-lg px-4 py-2.5" style={{ backgroundColor: colors.primary, opacity: sending ? 0.5 : 1 }}>
            <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
              {sending ? "Sending…" : "Send to client"}
            </Text>
          </Pressable>
        </View>
      )}

      {/* The banner states where she is and what the next move is, in that
          order — the progress bar is the only thing on this screen that
          doesn't need reading to be understood. */}
      <View className="mb-4 flex-row flex-wrap items-center rounded-2xl px-6 py-5" style={{ backgroundColor: "#33291f", gap: 20 }}>
        <View style={{ minWidth: 150 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#b0a08d", textTransform: "uppercase", letterSpacing: 0.6 }}>
            Onboarding
          </Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 24, color: "white", marginTop: 2 }}>
            {COUNT_WORDS[doneCount]} of {COUNT_WORDS[applicable.length].toLowerCase()} done
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 200 }}>
          <View style={{ height: 8, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
            <View style={{ width: `${(doneCount / applicable.length) * 100}%`, height: 8, borderRadius: 5, backgroundColor: "#8fb473" }} />
          </View>
          <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: "#b0a08d", marginTop: 8 }}>
            {client.onboarding_sent_at
              ? `Invited ${formatDateMDY(client.onboarding_sent_at.slice(0, 10))}${daysSinceInvite !== null ? ` · she has had the app ${daysSinceInvite} day${daysSinceInvite === 1 ? "" : "s"}` : ""}`
              : "Not sent to her yet"}
          </Text>
        </View>

        <Pressable onPress={() => router.push(approveHref)} className="rounded-lg px-5 py-3" style={{ backgroundColor: phases.readyForReview ? colors.primary : "rgba(255,255,255,0.12)" }}>
          <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: phases.readyForReview ? "white" : "#d8cec1" }}>
            Set her first targets
          </Text>
        </Pressable>
      </View>

      <View className="mb-4" style={{ flexDirection: isWide ? "row" : "column", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <PhaseCard
            title="Questionnaire"
            accent="accent"
            done={phases.questionnaire}
            subtext={phases.questionnaire ? "Submitted — tap to read her answers" : "Not submitted yet"}
            onPress={() => router.push(`/(coach)/nutrition/clients/${userId}/onboarding/questionnaire`)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PhaseCard
            title="Objective tracking"
            accent="primary"
            done={phases.tracking}
            subtext={
              onboarding.trackingCount === 0
                ? "Skipped — no days assigned (optional, tap to add)"
                : phases.tracking
                  ? `All ${onboarding.trackingCount} days logged — tap to view`
                  : `${onboarding.loggedCount} of ${onboarding.trackingCount} logged`
            }
            onPress={() => router.push(`/(coach)/nutrition/clients/${userId}/onboarding/tracking`)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PhaseCard
            title="Starting photos"
            accent="tertiary"
            done={phases.photos}
            subtext={phases.photos ? "All angles in — tap to view" : "Front/side/back needed — not a blocker"}
            onPress={() => router.push(`/(coach)/nutrition/clients/${userId}/onboarding/photos`)}
          />
        </View>
      </View>

      <View style={{ flexDirection: isWide ? "row" : "column", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Card>
            <View className="mb-2 flex-row flex-wrap items-center" style={{ gap: 8 }}>
              <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {phases.readyForReview ? "Ready for review" : "Still waiting on her"}
              </Text>
              {phases.readyForReview ? (
                <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: "#f4ede3" }}>
                  <Text style={{ fontFamily: fonts.sansBold, fontSize: 9, color: "#8a5a2e", letterSpacing: 0.4 }}>YOUR MOVE</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontFamily: fonts.sans, fontSize: 13.5, color: "#44403c", lineHeight: 20 }}>
              {phases.readyForReview
                ? "Everything you need is in. Setting her first targets is what turns this into a live client — the tabs above fill in from that point and she starts getting weekly check-ins."
                : "You can set her targets at any point — nothing above is a hard blocker. Close out onboarding if she isn't going to finish the rest in the app."}
            </Text>

            {baseline && baseline.days > 0 ? (
              <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: "#faf8f6" }}>
                <Text
                  className="mb-2"
                  style={{ fontFamily: fonts.sansBold, fontSize: 10, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}
                >
                  Her first week, for reference
                </Text>
                <View className="flex-row flex-wrap" style={{ gap: 24 }}>
                  {[
                    { label: "Avg calories", value: baseline.calories !== null ? Math.round(baseline.calories).toLocaleString() : "–" },
                    { label: "Avg protein", value: baseline.protein !== null ? `${Math.round(baseline.protein)} g` : "–" },
                    { label: "Avg steps", value: baseline.steps !== null ? Math.round(baseline.steps).toLocaleString() : "–" },
                    { label: "Weight", value: baseline.weight !== null ? baseline.weight.toFixed(1) : "–" },
                  ].map((stat) => (
                    <View key={stat.label}>
                      <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>{stat.label}</Text>
                      <Text style={{ fontFamily: fonts.sansBold, fontSize: 16, color: "#2a211c", marginTop: 2 }}>{stat.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View className="mt-4 flex-row flex-wrap" style={{ gap: 10 }}>
              <Pressable onPress={() => router.push(approveHref)} className="rounded-lg px-5 py-3" style={{ backgroundColor: colors.primary }}>
                <Text className="text-white" style={{ fontFamily: fonts.sansSemiBold, fontSize: 13 }}>
                  Set her first targets
                </Text>
              </Pressable>
              {/* Kova's real second action, in place of the mock's "Ask her
                  for more": close out with whatever she's actually submitted.
                  It's the one that comes up — a client finishes two of three
                  and stalls, and without this there's no way forward. */}
              <Pressable
                onPress={onCloseOut}
                disabled={bypassing}
                className="rounded-lg px-5 py-3"
                style={{ borderWidth: 1.5, borderColor: colors.primary, opacity: bypassing ? 0.5 : 1 }}
              >
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 13, color: colors.primaryOnWhite }}>
                  {bypassing ? "Closing out…" : "Close out onboarding →"}
                </Text>
              </Pressable>
            </View>
          </Card>
        </View>

        <View style={{ width: isWide ? 300 : undefined }}>
          <StartingPhotos photos={photos} />
        </View>
      </View>
    </View>
  );
}
