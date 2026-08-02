import { View, Text } from "react-native";
import { fonts } from "../../lib/theme";

function StepCircle({ state }) {
  if (state === "done") {
    return (
      <View className="items-center justify-center rounded-full" style={{ width: 32, height: 32, backgroundColor: "#a46a57" }}>
        <Text style={{ color: "white", fontSize: 16 }}>✓</Text>
      </View>
    );
  }
  if (state === "overdue") {
    return (
      <View className="items-center justify-center rounded-full" style={{ width: 32, height: 32, backgroundColor: "#d97706" }}>
        <Text style={{ color: "white", fontFamily: fonts.sansBold }}>!</Text>
      </View>
    );
  }
  return (
    <View className="items-center justify-center rounded-full border-2 border-stone-300" style={{ width: 32, height: 32 }}>
      <View className="rounded-full bg-stone-300" style={{ width: 6, height: 6 }} />
    </View>
  );
}

function Connector({ filled }) {
  return <View style={{ flex: 1, height: 2, backgroundColor: filled ? "#a46a57" : "#e7e5e4" }} />;
}

// 3 steps for Kova (Questionnaire / Objective Tracking / Photos) — the
// standalone app's 4th "Account" step (email-invite confirmation) doesn't
// apply, a Kova member already has a working login before nutrition is ever
// turned on.
export function OnboardingStepper({ steps }) {
  return (
    <View className="flex-row items-start">
      {steps.map((step, i) => (
        <View key={step.key} style={{ flex: 1, alignItems: "center" }}>
          <View className="w-full flex-row items-center">
            <Connector filled={i > 0 && steps[i - 1].state === "done"} />
            <StepCircle state={step.state} />
            <Connector filled={i < steps.length - 1 && step.state === "done"} />
          </View>
          <Text className="mt-2 text-center text-xs" style={{ fontFamily: fonts.sansMedium }}>
            {step.label}
          </Text>
          {step.subtext ? (
            <Text className="text-center text-xs" style={{ fontFamily: fonts.sans, color: step.state === "overdue" ? "#b45309" : "#a8a29e" }}>
              {step.subtext}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
