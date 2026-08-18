import { View, Text } from "react-native";
import { CheckinAnswerList } from "./CheckinAnswerList";
import { StartingPhotos } from "./StartingPhotos";
import { loggedCalories } from "../../lib/nutrition/targets";
import { formatDateMDY } from "../../lib/formatDate";
import { dateInBoise } from "../../lib/boiseDate";
import { fonts } from "../../lib/theme";

// Her onboarding, read as her FIRST check-in — the same review surface as
// every week after it, on the same tab, instead of being stranded behind a
// button on Settings. Questionnaire answers (highlightable, exactly as a
// weekly check-in's are), her starting photos, and her objective-tracking
// days. Coach notes and focus come from the Check-In tab's own rail, which
// stays put around this — so the whole review is one screen to talk over.
//
// The answers render through CheckinAnswerList rather than a second copy of
// the same markup: highlighting has enough hard-won edge-case handling in it
// (see HighlightableAnswer.web.js) that a parallel implementation would
// drift. Questionnaire answers have no prior week and no gym template to
// differ from, so hasPrior and hersOnly are simply false.

function Card({ title, headerRight, children, style }) {
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
        <View className="mb-3 flex-row flex-wrap items-center justify-between" style={{ gap: 8 }}>
          <Text style={{ fontFamily: fonts.sansBold, fontSize: 10.5, color: "#a8a29e", textTransform: "uppercase", letterSpacing: 0.5 }}>
            {title}
          </Text>
          {headerRight}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function TrackingDays({ onboarding }) {
  const dates = onboarding.trackingDates ?? [];
  const logsByDate = onboarding.logsByDate ?? {};

  if (dates.length === 0) {
    return (
      <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: "#a8a29e" }}>
        No days were assigned — objective tracking was skipped for her. That&apos;s a choice, not a gap.
      </Text>
    );
  }

  return (
    <View>
      {dates.map((d, i) => {
        const log = logsByDate[d.date];
        const calories = log ? loggedCalories(log) : null;
        return (
          <View
            key={d.date}
            className="flex-row items-center justify-between"
            style={{ paddingVertical: 8, borderBottomWidth: i === dates.length - 1 ? 0 : 1, borderBottomColor: "#f6f3ef" }}
          >
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: log ? "#44403c" : "#a8a29e" }}>
              {formatDateMDY(d.date)}
            </Text>
            {log ? (
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#78716c" }}>
                {calories !== null ? `${Math.round(calories).toLocaleString()} cal | ` : ""}
                {log.protein_g ?? "–"}p | {log.carb_g ?? "–"}c | {log.fat_g ?? "–"}f
              </Text>
            ) : (
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#c9c4bd" }}>not logged</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function OnboardingCheckinView({ client, onboarding, photos, isWide, onChangeHighlights }) {
  const response = onboarding?.response ?? null;
  const paired = (response?.answers ?? []).map((a, i) => ({
    index: i,
    question: a.question,
    answer: a.answer,
    hasPrior: false,
    lastAnswer: null,
    hersOnly: false,
  }));

  return (
    <View>
      <View style={{ flexDirection: isWide ? "row" : "column", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Card title="Starting photos" style={{ flex: 1 }}>
            <StartingPhotos photos={photos} client={client} emptyMessage="No starting photos came in." />
          </Card>
        </View>
        <View style={{ flex: 1 }}>
          <Card
            title="Objective tracking"
            style={{ flex: 1 }}
            headerRight={
              onboarding.trackingCount > 0 ? (
                <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                  {onboarding.loggedCount} of {onboarding.trackingCount} logged
                </Text>
              ) : null
            }
          >
            <TrackingDays onboarding={onboarding} />
          </Card>
        </View>
      </View>

      <View className="mt-4">
        <Card
          title="Questionnaire"
          headerRight={
            response?.submitted_at ? (
              // dateInBoise, never .slice(0,10) — submitted_at is a
              // timestamptz, so slicing reads the UTC date, a day ahead for
              // anything submitted in the Boise evening.
              <Text style={{ fontFamily: fonts.sans, fontSize: 11.5, color: "#a8a29e" }}>
                submitted {formatDateMDY(dateInBoise(new Date(response.submitted_at)))}
              </Text>
            ) : null
          }
        >
          {response ? (
            <CheckinAnswerList paired={paired} highlights={response.highlights} onChangeHighlights={onChangeHighlights} />
          ) : (
            <Text style={{ fontFamily: fonts.sans, color: "#a8a29e" }}>
              She hasn&apos;t submitted her questionnaire.
            </Text>
          )}
        </Card>
      </View>
    </View>
  );
}
